using Hangfire;
using Switchboard.Api.Data;
using Switchboard.Api.Agents;
using Switchboard.Api.Models;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Gmail.v1;
using Google.Apis.Services;
using Microsoft.AspNetCore.SignalR;

namespace Switchboard.Api.Jobs;

public class GmailPollerJob
{
    private readonly SwitchboardDbContext _db;
    private readonly ILogger<GmailPollerJob> _logger;
    private readonly TriageAgent _triageAgent;
    private readonly DraftingAgent _draftingAgent;
    private readonly Microsoft.AspNetCore.SignalR.IHubContext<Switchboard.Api.Hubs.ActivityHub> _hub;

    public GmailPollerJob(SwitchboardDbContext db, ILogger<GmailPollerJob> logger, TriageAgent triageAgent, DraftingAgent draftingAgent, Microsoft.AspNetCore.SignalR.IHubContext<Switchboard.Api.Hubs.ActivityHub> hub)
    {
        _db = db;
        _logger = logger;
        _triageAgent = triageAgent;
        _draftingAgent = draftingAgent;
        _hub = hub;
    }

    public async Task ExecuteAsync()
    {
        _logger.LogInformation("Starting Gmail Poll...");

        var tokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "GmailRefreshToken");
        if (tokenConfig == null || string.IsNullOrEmpty(tokenConfig.Value))
        {
            _logger.LogInformation("No Gmail Refresh Token found. Skipping.");
            return;
        }

        try
        {
            var clientIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_ID");
            var clientSecretConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_SECRET");
            var clientId = clientIdConfig?.Value;
            var clientSecret = clientSecretConfig?.Value;
            
            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
            {
                _logger.LogWarning("Real token found but missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in DB.");
                return;
            }

            var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
            {
                ClientSecrets = new ClientSecrets { ClientId = clientId, ClientSecret = clientSecret },
                Scopes = new[] { GmailService.Scope.GmailModify }
            });

            var credential = new UserCredential(flow, "user", new TokenResponse { RefreshToken = tokenConfig.Value });
            
            var service = new GmailService(new BaseClientService.Initializer()
            {
                HttpClientInitializer = credential,
                ApplicationName = "Switchboard",
            });

            // Fetch messages matching keywords
            var keywords = await _db.KeywordRules.Select(k => k.Keyword).ToListAsync();
            var q = keywords.Any() ? string.Join(" OR ", keywords.Select(k => $"\"{k}\"")) : "is:unread";
            var request = service.Users.Messages.List("me");
            request.Q = q;
            request.MaxResults = 10;
            var response = await request.ExecuteAsync();

            if (response.Messages != null && response.Messages.Count > 0)
            {
                foreach (var msgItem in response.Messages)
                {
                    // Skip if already processed
                    if (await _db.EmailResults.AnyAsync(e => e.MessageId == msgItem.Id)) continue;

                    var msgReq = service.Users.Messages.Get("me", msgItem.Id);
                    msgReq.Format = UsersResource.MessagesResource.GetRequest.FormatEnum.Full;
                    var msg = await msgReq.ExecuteAsync();

                    var fromHeader = msg.Payload.Headers.FirstOrDefault(h => h.Name == "From")?.Value ?? "Unknown";
                    var subjectHeader = msg.Payload.Headers.FirstOrDefault(h => h.Name == "Subject")?.Value ?? "No Subject";
                    
                    string GetEmailBody(Google.Apis.Gmail.v1.Data.MessagePart part)
                    {
                        if (part.MimeType == "text/plain" && part.Body?.Data != null)
                        {
                            string b64 = part.Body.Data.Replace('-', '+').Replace('_', '/');
                            switch (b64.Length % 4) { case 2: b64 += "=="; break; case 3: b64 += "="; break; }
                            return System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(b64));
                        }
                        if (part.Parts != null)
                        {
                            foreach (var p in part.Parts)
                            {
                                var res = GetEmailBody(p);
                                if (!string.IsNullOrEmpty(res)) return res;
                            }
                        }
                        return "";
                    }
                    
                    string fullBody = GetEmailBody(msg.Payload);
                    if (string.IsNullOrEmpty(fullBody)) fullBody = msg.Snippet ?? ""; // Fallback
                    if (fullBody.Length > 4000) fullBody = fullBody.Substring(0, 4000);

                    var emailResult = new EmailResult
                    {
                        MessageId = msg.Id,
                        Sender = fromHeader,
                        Subject = subjectHeader,
                        ProcessedAt = DateTime.UtcNow
                    };

                    _db.EmailResults.Add(emailResult);
                    await _db.SaveChangesAsync();

                    bool isMatch = await _triageAgent.ProcessEmailAsync(emailResult, fullBody);

                    if (isMatch)
                    {
                        var attachments = new List<string>();
                        if (msg.Payload.Parts != null)
                        {
                            var partsToProcess = new Queue<Google.Apis.Gmail.v1.Data.MessagePart>(msg.Payload.Parts);

                            while (partsToProcess.Count > 0)
                            {
                                var part = partsToProcess.Dequeue();
                                
                                if (part.Parts != null)
                                {
                                    foreach (var subPart in part.Parts) partsToProcess.Enqueue(subPart);
                                }

                                if (!string.IsNullOrEmpty(part.Filename) && part.Body?.AttachmentId != null)
                                {
                                    var attachReq = service.Users.Messages.Attachments.Get("me", msgItem.Id, part.Body.AttachmentId);
                                    var attachData = await attachReq.ExecuteAsync();
                                    
                                    string base64Str = attachData.Data.Replace('-', '+').Replace('_', '/');
                                    switch (base64Str.Length % 4)
                                    {
                                        case 2: base64Str += "=="; break;
                                        case 3: base64Str += "="; break;
                                    }
                                    byte[] bytes = Convert.FromBase64String(base64Str);
                                    
                                    string dir = Path.Combine(Directory.GetCurrentDirectory(), "..", "DownloadedAttachments");
                                    Directory.CreateDirectory(dir);
                                    string safeFilename = string.Join("_", part.Filename.Split(Path.GetInvalidFileNameChars()));
                                    string filePath = Path.Combine(dir, $"{msgItem.Id}_{safeFilename}");
                                    await System.IO.File.WriteAllBytesAsync(filePath, bytes);
                                    
                                    attachments.Add(part.Filename);
                                }
                            }
                        }
                        
                        if (attachments.Any())
                        {
                            emailResult.DownloadedAttachments = string.Join(", ", attachments);
                            await _db.SaveChangesAsync();
                        }

                        // Generate AI Draft Reply
                        string draftReply = await _draftingAgent.DraftReplyAsync(fullBody);
                        string toHeader = msg.Payload.Headers.FirstOrDefault(h => h.Name == "Reply-To")?.Value ?? fromHeader;
                        
                        string rawEmail = $"To: {toHeader}\r\nSubject: Re: {subjectHeader}\r\nIn-Reply-To: {msg.Id}\r\nReferences: {msg.Id}\r\n\r\n{draftReply}";
                        var inputBytes = System.Text.Encoding.UTF8.GetBytes(rawEmail);
                        string base64Url = Convert.ToBase64String(inputBytes).Replace('+', '-').Replace('/', '_').Replace("=", "");
                        
                        var draft = new Google.Apis.Gmail.v1.Data.Draft
                        {
                            Message = new Google.Apis.Gmail.v1.Data.Message { Raw = base64Url }
                        };
                        await service.Users.Drafts.Create(draft, "me").ExecuteAsync();

                        var attachLogText = attachments.Any() ? $" Extracted {attachments.Count} attachment(s) [{string.Join(", ", attachments)}]." : " No attachments found.";
                        await _hub.Clients.All.SendAsync("ReceiveLog", new
                        {
                            id = Guid.NewGuid().ToString(),
                            time = DateTime.UtcNow.ToString("HH:mm:ss"),
                            source = "Gmail Poller",
                            message = $"✅ Processed '{subjectHeader}'.{attachLogText} Generated AI Draft Reply."
                        });
                    }

                    // Mark as read
                    var mods = new Google.Apis.Gmail.v1.Data.ModifyMessageRequest { RemoveLabelIds = new[] { "UNREAD" } };
                    await service.Users.Messages.Modify(mods, "me", msgItem.Id).ExecuteAsync();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to poll Gmail API");
            System.IO.File.WriteAllText("gmail_error.txt", ex.ToString());
        }
    }
}

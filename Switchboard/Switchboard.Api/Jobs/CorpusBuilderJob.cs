using Hangfire;
using Switchboard.Api.Data;
using Switchboard.Api.Models;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Gmail.v1;
using Google.Apis.Services;
using Microsoft.Extensions.AI;
using System.Text;

namespace Switchboard.Api.Jobs;

public class CorpusBuilderJob
{
    private readonly SwitchboardDbContext _db;
    private readonly ILogger<CorpusBuilderJob> _logger;
    private readonly IChatClient _chatClient;

    public CorpusBuilderJob(SwitchboardDbContext db, ILogger<CorpusBuilderJob> logger, IChatClient chatClient)
    {
        _db = db;
        _logger = logger;
        _chatClient = chatClient;
    }

    public async Task ExecuteAsync()
    {
        _logger.LogInformation("Starting Corpus Builder Job...");

        var tokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "GmailRefreshToken");
        if (tokenConfig == null || string.IsNullOrEmpty(tokenConfig.Value))
        {
            _logger.LogInformation("No Gmail Refresh Token found. Skipping Corpus Build.");
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

            // Fetch recently sent emails (last 24 hours)
            var request = service.Users.Messages.List("me");
            request.Q = "in:sent newer_than:1d";
            request.MaxResults = 50; // max 50 for corpus
            var response = await request.ExecuteAsync();

            if (response.Messages == null || response.Messages.Count == 0)
            {
                _logger.LogInformation("No sent emails found in the last 24 hours to build a corpus.");
                return;
            }

            var corpusText = new StringBuilder();
            
            foreach (var msgItem in response.Messages.Take(10)) // analyze max 10 emails to keep prompt size reasonable
            {
                var msgReq = service.Users.Messages.Get("me", msgItem.Id);
                msgReq.Format = UsersResource.MessagesResource.GetRequest.FormatEnum.Full;
                var msg = await msgReq.ExecuteAsync();
                
                if (!string.IsNullOrEmpty(msg.Snippet))
                {
                    corpusText.AppendLine($"- {msg.Snippet}");
                }
            }

            var systemPrompt = @"You are a highly analytical AI specialized in linguistics and persona cloning.
Your task is to analyze a corpus of recent messages sent by a specific user, and deduce their conversational tone, vocabulary, formatting habits, and general style.
You must output ONLY a short paragraph (2-4 sentences) that describes exactly how an AI should mimic this person. 
Do not include any pleasantries or conversational text. Output ONLY the persona description (e.g., 'Use casual language, lowercase letters, no punctuation at the end of sentences, and slang like rn. Keep responses very brief.').";

            var userPrompt = $"Analyze the following sent messages to deduce my tone:\n\n{corpusText}";

            var llmResponse = await _chatClient.GetResponseAsync(
                new List<ChatMessage> { new ChatMessage(ChatRole.System, systemPrompt), new ChatMessage(ChatRole.User, userPrompt) }
            );

            if (!string.IsNullOrEmpty(llmResponse.Text))
            {
                var toneDesc = llmResponse.Text.Trim();
                // Clean up if it outputs markdown or quotes
                if (toneDesc.StartsWith("\"") && toneDesc.EndsWith("\"")) toneDesc = toneDesc.Substring(1, toneDesc.Length - 2);
                
                var config = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "whatsapp_voice_tone");
                if (config != null)
                {
                    config.Value = toneDesc;
                    config.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    _db.Configs.Add(new Config { Key = "whatsapp_voice_tone", Value = toneDesc });
                }
                
                await _db.SaveChangesAsync();
                _logger.LogInformation("Successfully updated Voice Tone based on daily corpus: {Tone}", toneDesc);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to build daily corpus from Gmail");
        }
    }
}

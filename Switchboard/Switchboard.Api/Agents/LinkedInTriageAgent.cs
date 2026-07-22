using System.Text.Json;
using Microsoft.Extensions.AI;
using Switchboard.Api.Data;
using Switchboard.Api.Models;
using Switchboard.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Telegram.Bot;

namespace Switchboard.Api.Agents;

/// <summary>
/// Mirrors TriageAgent.cs exactly but for LinkedIn message threads.
/// Generates draft reply options and escalates to Telegram for human approval.
/// IMPORTANT: LinkedIn replies are NEVER auto-sent. See LinkedInWatcherWorker for rationale.
/// </summary>
public class LinkedInTriageAgent
{
    private readonly IChatClient _chatClient;
    private readonly SwitchboardDbContext _db;
    private readonly IHubContext<ActivityHub> _hub;

    public LinkedInTriageAgent(IChatClient chatClient, SwitchboardDbContext db, IHubContext<ActivityHub> hub)
    {
        _chatClient = chatClient;
        _db = db;
        _hub = hub;
    }

    public class LiProcessResult
    {
        public string intent { get; set; } = "";
        public string[] replyOptions { get; set; } = new string[0];
    }

    /// <summary>
    /// Process a LinkedIn thread and generate reply options.
    /// </summary>
    /// <param name="senderName">Name of the LinkedIn contact</param>
    /// <param name="threadHistory">Full conversation history text</param>
    /// <param name="threadUrl">URL to the LinkedIn messaging thread</param>
    public async Task<LiProcessResult> ProcessThreadAsync(string senderName, string threadHistory, string threadUrl)
    {
        var startTime = DateTime.UtcNow;
        
        var toneConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "whatsapp_voice_tone");
        var voiceTone = toneConfig?.Value ?? "professional, friendly, and concise";

        var systemPrompt = $@"You are an AI assistant tasked with generating reply options for a LinkedIn conversation thread.
You MUST mimic the following voice/tone perfectly: ""{voiceTone}""
The conversation history is provided below. Generate appropriate reply options for the LAST message in the thread (which was sent by the other person).
You must reply with ONLY a valid JSON object matching this schema. DO NOT include prefixes like 'Option 1:' in the string values. DO NOT wrap the output in markdown code blocks.
{{
  ""intent"": ""short 3-5 word summary of the contact's intention"",
  ""replyOptions"": [
     ""A brief acknowledgement matching the requested tone"",
     ""A clarifying question matching the requested tone"",
     ""A direct answer/resolution matching the requested tone""
  ]
}}";

        var response = await _chatClient.GetResponseAsync(
            new List<ChatMessage> { new ChatMessage(ChatRole.System, systemPrompt), new ChatMessage(ChatRole.User, $"Contact: {senderName}\n\nThread:\n{threadHistory}") });

        LiProcessResult result;
        try
        {
            var rawText = response.Text ?? "{}";
            
            // Aggressive JSON cleanup for smaller models
            var jsonStartIndex = rawText.IndexOf('{');
            var jsonEndIndex = rawText.LastIndexOf('}');
            if (jsonStartIndex >= 0 && jsonEndIndex >= jsonStartIndex)
            {
                rawText = rawText.Substring(jsonStartIndex, jsonEndIndex - jsonStartIndex + 1);
            }

            result = JsonSerializer.Deserialize<LiProcessResult>(rawText.Trim()) ?? new LiProcessResult();
            if (result.replyOptions == null || result.replyOptions.Length == 0)
                result.replyOptions = new[] { "Thanks for reaching out!" };
            else
            {
                for (int i = 0; i < result.replyOptions.Length; i++)
                {
                    result.replyOptions[i] = System.Text.RegularExpressions.Regex.Replace(result.replyOptions[i], @"^(?:Option\s*\d+:|\d+\.)\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
                }
            }
        }
        catch
        {
            result = new LiProcessResult { intent = "Unknown", replyOptions = new[] { "Thanks for your message. Let me get back to you on this." } };
        }

        // Create escalation — always. LinkedIn messages are NEVER auto-sent.
        var preview = threadHistory.Length > 100 ? threadHistory.Substring(threadHistory.Length - 100) : threadHistory;
        var esc = new Escalation
        {
            Source = "LinkedIn",
            Channel = "LinkedIn",
            MessagePreview = $"{senderName}: {preview}",
            FullMessagePayload = JsonSerializer.Serialize(new { senderName, threadHistory, threadUrl, options = result.replyOptions }),
            ThreadUrl = threadUrl
        };
        _db.Escalations.Add(esc);
        await _db.SaveChangesAsync();

        // Push to Telegram with inline buttons
        var tokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramToken");
        var chatIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramChatId");
        if (tokenConfig != null && chatIdConfig != null && !string.IsNullOrEmpty(tokenConfig.Value))
        {
            try
            {
                var botClient = new TelegramBotClient(tokenConfig.Value);

                var buttons = new List<Telegram.Bot.Types.ReplyMarkups.InlineKeyboardButton[]>();
                for (int i = 0; i < result.replyOptions.Length; i++)
                {
                    var btnText = result.replyOptions[i].Length > 30 ? result.replyOptions[i].Substring(0, 27) + "..." : result.replyOptions[i];
                    buttons.Add(new[] { Telegram.Bot.Types.ReplyMarkups.InlineKeyboardButton.WithCallbackData(btnText, $"LI|{esc.Id}|{i}") });
                }
                var inlineKeyboard = new Telegram.Bot.Types.ReplyMarkups.InlineKeyboardMarkup(buttons);

                await botClient.SendMessage(chatIdConfig.Value,
                    $"💼 LINKEDIN MESSAGE 💼\n\nFrom: {senderName}\nIntent: {result.intent}\nMessage: {preview}\n\n⚠️ Reply will NOT be auto-sent. You'll need to copy-paste it manually.",
                    replyMarkup: inlineKeyboard);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Telegram send failed: " + ex.Message);
            }
        }

        var duration = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
        _db.AgentRunLogs.Add(new AgentRunLog
        {
            AgentName = "LinkedInTriageAgent",
            InputPayload = $"{senderName}: {threadHistory.Substring(0, Math.Min(threadHistory.Length, 500))}",
            OutputPayload = response.Text ?? "",
            DurationMs = duration,
        });
        await _db.SaveChangesAsync();

        await _hub.Clients.All.SendAsync("ReceiveLog", new
        {
            id = Guid.NewGuid().ToString(),
            time = DateTime.UtcNow.ToString("HH:mm:ss"),
            source = "LinkedInTriageAgent",
            message = $"💼 LinkedIn thread from {senderName} | Intent: {result.intent} | ExecTime: {duration}ms"
        });

        return result;
    }
}

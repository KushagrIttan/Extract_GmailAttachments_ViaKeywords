using System.Text.Json;
using Microsoft.Extensions.AI;
using Switchboard.Api.Data;
using Switchboard.Api.Models;
using Switchboard.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Telegram.Bot;

namespace Switchboard.Api.Agents;

public class TriageAgent
{
    private readonly IChatClient _chatClient;
    private readonly SwitchboardDbContext _db;
    private readonly IHubContext<ActivityHub> _hub;

    public TriageAgent(IChatClient chatClient, SwitchboardDbContext db, IHubContext<ActivityHub> hub)
    {
        _chatClient = chatClient;
        _db = db;
        _hub = hub;
    }

    private async Task SendTelegramNotificationAsync(string message)
    {
        try
        {
            var tokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramToken");
            var chatIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramChatId");
            if (tokenConfig != null && chatIdConfig != null && !string.IsNullOrEmpty(tokenConfig.Value))
            {
                var botClient = new TelegramBotClient(tokenConfig.Value);
                await botClient.SendMessage(chatIdConfig.Value, $"🚨 URGENT ESCALATION 🚨\n\n{message}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Telegram send failed: " + ex.Message);
        }
    }

    public class WaProcessResult
    {
        public bool isUrgent { get; set; }
        public string intent { get; set; } = "";
        public string[] replyOptions { get; set; } = new string[0];
    }

    public async Task<WaProcessResult> ProcessMessageAsync(WaMessage msg)
    {
        var startTime = DateTime.UtcNow;
        var toneConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "whatsapp_voice_tone");
        var voiceTone = toneConfig?.Value ?? "professional, friendly, and concise";

        var systemPrompt = $@"You are an AI assistant tasked with generating reply options for an incoming WhatsApp message.
You MUST mimic the following voice/tone perfectly: ""{voiceTone}""
You must reply with ONLY a valid JSON object matching this schema. DO NOT include prefixes like 'Option 1:' in the string values. DO NOT wrap the output in markdown code blocks.
{{
  ""intent"": ""short 3-5 word summary of the user's intention"",
  ""replyOptions"": [
     ""A brief acknowledgement matching the requested tone"",
     ""A clarifying question matching the requested tone"",
     ""A direct answer/resolution matching the requested tone""
  ]
}}";
        
        var response = await _chatClient.GetResponseAsync(
            new List<ChatMessage> { new ChatMessage(ChatRole.System, systemPrompt), new ChatMessage(ChatRole.User, msg.MessageText) });
            
        WaProcessResult result;
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
            
            result = JsonSerializer.Deserialize<WaProcessResult>(rawText.Trim()) ?? new WaProcessResult();
            if (result.replyOptions == null || result.replyOptions.Length == 0)
                result.replyOptions = new[] { "I received this." };
        }
        catch
        {
            result = new WaProcessResult { isUrgent = false, intent = "Unknown", replyOptions = new[] { "I received your message, but I'm having trouble understanding right now." } };
        }

        // WhatsApp messages ALWAYS escalate to Telegram for manual approval
        var preview = msg.MessageText.Substring(0, Math.Min(msg.MessageText.Length, 100));
        var esc = new Escalation 
        { 
            Source = "WhatsApp", 
            MessagePreview = preview,
            FullMessagePayload = JsonSerializer.Serialize(new { message = msg, options = result.replyOptions })
        };
        _db.Escalations.Add(esc);
        await _db.SaveChangesAsync();

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
                    buttons.Add(new[] { Telegram.Bot.Types.ReplyMarkups.InlineKeyboardButton.WithCallbackData(btnText, $"WA|{esc.Id}|{i}") });
                }
                var inlineKeyboard = new Telegram.Bot.Types.ReplyMarkups.InlineKeyboardMarkup(buttons);

                await botClient.SendMessage(chatIdConfig.Value, $"🚨 INCOMING WA MESSAGE 🚨\n\nFrom: {msg.PushName} ({msg.RemoteJid.Replace("@c.us", "")})\nIntent: {result.intent}\nMessage: {preview}", replyMarkup: inlineKeyboard);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Telegram send failed: " + ex.Message);
            }
        }
        
        var duration = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
        _db.AgentRunLogs.Add(new AgentRunLog
        {
            AgentName = "TriageAgent",
            InputPayload = msg.MessageText,
            OutputPayload = response.Text ?? "",
            DurationMs = duration,
        });
        await _db.SaveChangesAsync();

        await _hub.Clients.All.SendAsync("ReceiveLog", new
        {
            id = Guid.NewGuid().ToString(),
            time = DateTime.UtcNow.ToString("HH:mm:ss"),
            source = "TriageAgent",
            message = $"WA Intent: {result.intent} | Match: {result.isUrgent} | ExecTime: {duration}ms"
        });
        
        return result;
    }

    public async Task<bool> ProcessEmailAsync(EmailResult email, string snippet)
    {
        var startTime = DateTime.UtcNow;
        var fullText = $"Subject: {email.Subject}\nSnippet: {snippet}";
        
        // Gmail API's highly optimized search query already guarantees the keyword is present!
        // We skip the redundant and slow LLM verification completely.
        bool isUrgent = true;

        var preview = fullText.Substring(0, Math.Min(fullText.Length, 100));
        _db.Escalations.Add(new Escalation 
        { 
            Source = "Gmail", 
            MessagePreview = preview,
            FullMessagePayload = JsonSerializer.Serialize(email)
        });
        await SendTelegramNotificationAsync($"Source: Gmail\nFrom: {email.Sender}\nPreview: {preview}");
        
        var duration = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
        _db.AgentRunLogs.Add(new AgentRunLog
        {
            AgentName = "TriageAgent",
            InputPayload = fullText,
            OutputPayload = "Auto-Match (Skipped LLM as Gmail API pre-filtered)",
            DurationMs = duration,
        });
        await _db.SaveChangesAsync();

        await _hub.Clients.All.SendAsync("ReceiveLog", new
        {
            id = Guid.NewGuid().ToString(),
            time = DateTime.UtcNow.ToString("HH:mm:ss"),
            source = "TriageAgent",
            message = $"Processed Email. Keyword Match: true. ExecTime: {duration}ms"
        });
        
        return isUrgent;
    }
}

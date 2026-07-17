using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Polling;
using Switchboard.Api.Data;
using Microsoft.Extensions.AI;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System;
using Microsoft.AspNetCore.SignalR;

namespace Switchboard.Api.Workers;

public class TelegramListenerWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<TelegramListenerWorker> _logger;

    public TelegramListenerWorker(IServiceProvider serviceProvider, ILogger<TelegramListenerWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<SwitchboardDbContext>();
                
                var tokenConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramToken", stoppingToken);
                if (tokenConfig != null && !string.IsNullOrEmpty(tokenConfig.Value))
                {
                    _logger.LogInformation("Starting Telegram Bot listener...");
                    var botClient = new TelegramBotClient(tokenConfig.Value);
                    
                    var receiverOptions = new ReceiverOptions
                    {
                        AllowedUpdates = { } // receive all update types
                    };

                    botClient.StartReceiving(
                        HandleUpdateAsync,
                        HandleErrorAsync,
                        receiverOptions,
                        cancellationToken: stoppingToken
                    );
                    
                    // Stay alive until cancelled
                    await Task.Delay(Timeout.Infinite, stoppingToken);
                }
                else
                {
                    _logger.LogInformation("No Telegram Token found. Retrying in 10 seconds.");
                    await Task.Delay(10000, stoppingToken);
                }
            }
            catch (TaskCanceledException) { }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Telegram Listener loop");
                await Task.Delay(10000, stoppingToken);
            }
        }
    }

    private async Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken)
    {
        if (update.Type == Telegram.Bot.Types.Enums.UpdateType.CallbackQuery)
        {
            await HandleCallbackQueryAsync(botClient, update.CallbackQuery, cancellationToken);
            return;
        }

        // Only process Message updates
        if (update.Type != Telegram.Bot.Types.Enums.UpdateType.Message)
            return;
            
        var message = update.Message;
        if (message?.Text == null)
            return;

        using var scope = _serviceProvider.CreateScope();
        var chatClient = scope.ServiceProvider.GetRequiredService<IChatClient>();
        
        try
        {
            var systemPrompt = "You are a helpful assistant integrated into a system called Switchboard. Keep responses concise.";
            var response = await chatClient.GetResponseAsync(
                new List<ChatMessage> 
                { 
                    new ChatMessage(ChatRole.System, systemPrompt), 
                    new ChatMessage(ChatRole.User, message.Text) 
                }, 
                cancellationToken: cancellationToken);

            if (!string.IsNullOrEmpty(response.Text))
            {
                await botClient.SendMessage(
                    chatId: message.Chat.Id,
                    text: response.Text,
                    cancellationToken: cancellationToken
                );
            }
        }
        catch(Exception ex)
        {
            _logger.LogError(ex, "Failed to process chat message from Telegram");
            await botClient.SendMessage(
                chatId: message.Chat.Id,
                text: "Sorry, my AI core ran into an issue.",
                cancellationToken: cancellationToken
            );
        }
    }

    private async Task HandleCallbackQueryAsync(ITelegramBotClient botClient, CallbackQuery callbackQuery, CancellationToken cancellationToken)
    {
        if (callbackQuery.Data == null || !callbackQuery.Data.StartsWith("WA|")) return;
        
        var parts = callbackQuery.Data.Split('|');
        if (parts.Length != 3) return;
        
        int escId = int.Parse(parts[1]);
        int optionIndex = int.Parse(parts[2]);

        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SwitchboardDbContext>();
        
        var esc = await db.Escalations.FindAsync(escId);
        if (esc == null) return;

        try
        {
            var payload = System.Text.Json.JsonDocument.Parse(esc.FullMessagePayload);
            var options = payload.RootElement.GetProperty("options");
            var selectedText = options[optionIndex].GetString();
            
            // Clean up any "Option X: " prefixes just in case the model generates them
            selectedText = System.Text.RegularExpressions.Regex.Replace(selectedText ?? "", @"^(Option \d+:|Option\s\d+\s*-|Option\s\d+\.)\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();

            var remoteJid = payload.RootElement.GetProperty("message").GetProperty("RemoteJid").GetString();

            var instanceIdConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "greenApiInstanceId");
            var tokenConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "greenApiToken");
            var instanceId = instanceIdConfig?.Value;
            var token = tokenConfig?.Value;
            
            using var client = new System.Net.Http.HttpClient();
            var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, $"https://api.green-api.com/waInstance{instanceId}/sendMessage/{token}");
            var reqBody = new { chatId = remoteJid, message = selectedText };
            req.Content = new System.Net.Http.StringContent(System.Text.Json.JsonSerializer.Serialize(reqBody), System.Text.Encoding.UTF8, "application/json");
            
            await client.SendAsync(req, cancellationToken);

            await botClient.EditMessageText(
                chatId: callbackQuery.Message.Chat.Id,
                messageId: callbackQuery.Message.MessageId,
                text: callbackQuery.Message.Text + $"\n\n✅ Sent Response: \"{selectedText}\"",
                replyMarkup: null,
                cancellationToken: cancellationToken
            );

            await botClient.AnswerCallbackQuery(callbackQuery.Id, "Reply sent!", cancellationToken: cancellationToken);

            esc.Status = "Resolved";
            esc.ResolvedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            
            // Optionally, broadcast to SignalR Simulator if needed
            var hub = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.SignalR.IHubContext<Switchboard.Api.Hubs.ActivityHub>>();
            await hub.Clients.All.SendAsync("WhatsAppSimReply", new
            {
                intent = "Manual Override",
                isUrgent = false,
                reply = selectedText,
                timestamp = DateTime.UtcNow.ToString("HH:mm")
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send callback reply to WhatsApp");
            await botClient.AnswerCallbackQuery(callbackQuery.Id, "Failed to send.", showAlert: true, cancellationToken: cancellationToken);
        }
    }

    private Task HandleErrorAsync(ITelegramBotClient botClient, Exception exception, CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "Telegram Bot API Error");
        return Task.CompletedTask;
    }
}

using Switchboard.Api.Agents;
using Switchboard.Api.Data;
using Switchboard.Api.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Switchboard.Api.Endpoints;

public static class WebhookEndpoints
{
    public static void MapWebhookEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/webhooks/whatsapp", async (System.Text.Json.Nodes.JsonNode payload, SwitchboardDbContext db, TriageAgent triageAgent, Microsoft.AspNetCore.SignalR.IHubContext<Switchboard.Api.Hubs.ActivityHub> hub) =>
        {
            try
            {
                // Green API payload structure (webhooks send the object directly at the root)
                var bodyNode = payload["body"] ?? payload; 
                Console.WriteLine($"[WEBHOOK] Received payload: {payload.ToJsonString()}");
                
                var typeWebhook = bodyNode["typeWebhook"]?.ToString();
                Console.WriteLine($"[WEBHOOK] typeWebhook: {typeWebhook}");
                if (typeWebhook != "incomingMessageReceived") return Results.Ok();

                var senderData = bodyNode["senderData"];
                var messageData = bodyNode["messageData"];
                if (senderData == null || messageData == null) 
                {
                    Console.WriteLine("[WEBHOOK] senderData or messageData is null");
                    return Results.Ok();
                }

                var textMessage = messageData["textMessageData"]?["textMessage"]?.ToString() ?? "";
                if (string.IsNullOrEmpty(textMessage)) return Results.Ok();

                var waMsg = new WaMessage
                {
                    RemoteJid = senderData["chatId"]?.ToString() ?? "unknown",
                    MessageId = bodyNode["idMessage"]?.ToString() ?? "unknown",
                    PushName = senderData["senderName"]?.ToString() ?? "unknown",
                    MessageText = textMessage,
                    CreatedAt = DateTime.UtcNow
                };

                db.WaMessages.Add(waMsg);
                await db.SaveChangesAsync();

                // Trigger TriageAgent
                var result = await triageAgent.ProcessMessageAsync(waMsg);

                // Broadcast to React UI Simulator (always show what the AI generated)
                var replyText = result.replyOptions.FirstOrDefault() ?? "";
                await hub.Clients.All.SendAsync("WhatsAppSimReply", new
                {
                    intent = result.intent,
                    isUrgent = true,
                    reply = "(Sent to Telegram for manual selection)",
                    timestamp = DateTime.UtcNow.ToString("HH:mm")
                });

                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WEBHOOK] Exception: {ex.Message}\n{ex.StackTrace}");
                // Return 200 OK so Green API doesn't retry infinitely on parse errors
                return Results.Ok();
            }
        });
    }
}

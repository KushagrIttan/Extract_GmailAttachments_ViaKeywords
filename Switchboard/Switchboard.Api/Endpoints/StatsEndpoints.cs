using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Data;

namespace Switchboard.Api.Endpoints;

public static class StatsEndpoints
{
    public static void MapStatsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/stats", async (SwitchboardDbContext db) =>
        {
            var emails = await db.EmailResults.CountAsync();
            var escalations = await db.Escalations.CountAsync(e => e.Status == "Pending");
            var messages = await db.WaMessages.CountAsync();
            var drafts = await db.EmailDrafts.CountAsync();
            var keywords = await db.KeywordRules.CountAsync();

            var hasGmailToken = await db.Configs.AnyAsync(c => c.Key == "GmailRefreshToken" && !string.IsNullOrEmpty(c.Value));
            var hasGreenApi = await db.Configs.AnyAsync(c => c.Key == "greenApiInstanceId" && !string.IsNullOrEmpty(c.Value));
            var hasTelegram = await db.Configs.AnyAsync(c => c.Key == "telegramToken" && !string.IsNullOrEmpty(c.Value));

            return Results.Ok(new
            {
                total_emails = emails,
                pending_escalations = escalations,
                total_wa_messages = messages,
                total_drafts = drafts,
                total_keywords = keywords,
                gmail_connected = hasGmailToken,
                wa_connected = hasGreenApi,
                telegram_connected = hasTelegram
            });
        });

        app.MapGet("/api/stats/escalations", async (SwitchboardDbContext db) =>
        {
            var active = await db.Escalations
                .Where(e => e.Status == "Pending")
                .OrderByDescending(e => e.CreatedAt)
                .Take(20)
                .ToListAsync();
            return Results.Ok(active);
        });
    }
}

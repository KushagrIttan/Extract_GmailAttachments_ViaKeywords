using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Data;
using Switchboard.Api.Models;

namespace Switchboard.Api.Endpoints;

public static class StatsEndpoints
{
    public static void MapStatsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/stats", async (SwitchboardDbContext db) =>
        {
            var emails = await db.EmailResults.CountAsync();
            var escalations = await db.Escalations.CountAsync(e => e.Status == "Pending" && e.Source != "WhatsApp");
            var messages = await db.WaMessages.CountAsync();
            var drafts = await db.EmailDrafts.CountAsync();
            var keywords = await db.KeywordRules.CountAsync();
            var totalLeads = await db.Leads.CountAsync();

            var hasGmailToken = await db.Configs.AnyAsync(c => c.Key == "GmailRefreshToken" && !string.IsNullOrEmpty(c.Value));
            var hasGreenApi = await db.Configs.AnyAsync(c => c.Key == "greenApiInstanceId" && !string.IsNullOrEmpty(c.Value));
            var hasTelegram = await db.Configs.AnyAsync(c => c.Key == "telegramToken" && !string.IsNullOrEmpty(c.Value));
            var hasSheets = await db.Configs.AnyAsync(c => c.Key == "SheetsRefreshToken" && !string.IsNullOrEmpty(c.Value));
            var hasLinkedIn = await db.Configs.AnyAsync(c => c.Key == "LinkedInSessionCookie" && !string.IsNullOrEmpty(c.Value));

            return Results.Ok(new
            {
                total_emails = emails,
                pending_escalations = escalations,
                total_wa_messages = messages,
                total_drafts = drafts,
                total_keywords = keywords,
                total_leads = totalLeads,
                gmail_connected = hasGmailToken,
                wa_connected = hasGreenApi,
                telegram_connected = hasTelegram,
                sheets_connected = hasSheets,
                linkedin_connected = hasLinkedIn
            });
        });

        app.MapGet("/api/stats/escalations", async (SwitchboardDbContext db) =>
        {
            var active = await db.Escalations
                .Where(e => e.Status == "Pending" && e.Source != "WhatsApp")
                .OrderByDescending(e => e.CreatedAt)
                .Take(20)
                .ToListAsync();
            return Results.Ok(active);
        });

        // Lead conversion stats
        app.MapGet("/api/stats/leads", async (SwitchboardDbContext db) =>
        {
            var total = await db.Leads.CountAsync();
            if (total == 0)
                return Results.Ok(new { total = 0, byStatus = new object[] { }, bySource = new object[] { }, pctContacted = 0.0, pctConverted = 0.0 });

            var byStatus = await db.Leads
                .GroupBy(l => l.Status)
                .Select(g => new { status = g.Key.ToString(), count = g.Count() })
                .ToListAsync();

            var bySource = await db.Leads
                .GroupBy(l => l.Source)
                .Select(g => new { source = g.Key, count = g.Count() })
                .ToListAsync();

            var contacted = await db.Leads.CountAsync(l => l.Status != LeadStatus.New);
            var converted = await db.Leads.CountAsync(l => l.Status == LeadStatus.Converted);

            return Results.Ok(new
            {
                total,
                byStatus,
                bySource,
                pctContacted = Math.Round((double)contacted / total * 100, 1),
                pctConverted = Math.Round((double)converted / total * 100, 1)
            });
        });

        // LinkedIn manual-send queue (approved but not sent)
        app.MapGet("/api/stats/linkedin-queue", async (SwitchboardDbContext db) =>
        {
            var queue = await db.Escalations
                .Where(e => e.Source == "LinkedIn" && e.Status == "Approved")
                .OrderByDescending(e => e.CreatedAt)
                .Take(20)
                .ToListAsync();
            return Results.Ok(queue);
        });
    }
}

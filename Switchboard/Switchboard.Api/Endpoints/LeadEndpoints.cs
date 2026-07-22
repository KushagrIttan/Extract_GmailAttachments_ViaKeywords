using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Data;
using Switchboard.Api.Models;
using Switchboard.Api.Integrations;
using Microsoft.AspNetCore.SignalR;
using Switchboard.Api.Hubs;

namespace Switchboard.Api.Endpoints;

public static class LeadEndpoints
{
    public static void MapLeadEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/leads");

        // GET /api/leads — filter by status, source, channel
        group.MapGet("/", async (SwitchboardDbContext db, string? status, string? source, string? channel) =>
        {
            var query = db.Leads.AsQueryable();

            if (!string.IsNullOrEmpty(status) && Enum.TryParse<LeadStatus>(status, true, out var statusEnum))
                query = query.Where(l => l.Status == statusEnum);
            if (!string.IsNullOrEmpty(source))
                query = query.Where(l => l.Source == source);
            if (!string.IsNullOrEmpty(channel) && Enum.TryParse<LeadChannel>(channel, true, out var channelEnum))
                query = query.Where(l => l.Channel == channelEnum);

            var leads = await query.OrderByDescending(l => l.CreatedAt).ToListAsync();
            return Results.Ok(leads);
        });

        // PATCH /api/leads/{id}/status — update status, sync to Google Sheets
        group.MapPatch("/{id}/status", async (Guid id, LeadStatusUpdateRequest req, SwitchboardDbContext db, GoogleSheetsService sheetsService, IHubContext<ActivityHub> hub) =>
        {
            var lead = await db.Leads.FindAsync(id);
            if (lead == null) return Results.NotFound(new { error = "Lead not found" });

            if (!Enum.TryParse<LeadStatus>(req.Status, true, out var newStatus))
                return Results.BadRequest(new { error = "Invalid status. Valid: New, Contacted, Replied, Converted, Dead" });

            var oldStatus = lead.Status;
            lead.Status = newStatus;
            lead.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            // Sync status change back to Google Sheet
            try
            {
                await sheetsService.SyncLeadStatusAsync(id, newStatus.ToString());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LeadEndpoints] Failed to sync status to Sheets: {ex.Message}");
            }

            // Broadcast to dashboard via SignalR
            await hub.Clients.All.SendAsync("ReceiveLog", new
            {
                id = Guid.NewGuid().ToString(),
                time = DateTime.UtcNow.ToString("HH:mm:ss"),
                source = "Lead Tracker",
                message = $"📋 Lead '{lead.Name}' status: {oldStatus} → {newStatus}"
            });

            await hub.Clients.All.SendAsync("LeadStatusChanged", new { leadId = id, status = newStatus.ToString() });

            return Results.Ok(lead);
        });

        // POST /api/leads/{id}/outreach — log an outreach attempt
        group.MapPost("/{id}/outreach", async (Guid id, OutreachRequest req, SwitchboardDbContext db, IHubContext<ActivityHub> hub) =>
        {
            var lead = await db.Leads.FindAsync(id);
            if (lead == null) return Results.NotFound(new { error = "Lead not found" });

            // Update lead tracking
            lead.LastContactedAt = DateTime.UtcNow;
            if (!string.IsNullOrEmpty(req.Channel) && Enum.TryParse<LeadChannel>(req.Channel, true, out var ch))
                lead.Channel = ch;
            if (lead.Status == LeadStatus.New)
                lead.Status = LeadStatus.Contacted;
            lead.Notes = string.IsNullOrEmpty(lead.Notes)
                ? $"[{DateTime.UtcNow:yyyy-MM-dd HH:mm}] Outreach via {req.Channel}: {req.Message}"
                : $"{lead.Notes}\n[{DateTime.UtcNow:yyyy-MM-dd HH:mm}] Outreach via {req.Channel}: {req.Message}";
            lead.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            await hub.Clients.All.SendAsync("ReceiveLog", new
            {
                id = Guid.NewGuid().ToString(),
                time = DateTime.UtcNow.ToString("HH:mm:ss"),
                source = "Lead Tracker",
                message = $"📤 Outreach to '{lead.Name}' via {req.Channel}"
            });

            return Results.Ok(new { success = true, lead });
        });
    }
}

public record LeadStatusUpdateRequest(string Status);
public record OutreachRequest(string Channel, string Message);

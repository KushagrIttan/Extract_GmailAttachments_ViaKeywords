using Hangfire;
using Switchboard.Api.Data;
using Switchboard.Api.Models;
using Switchboard.Api.Integrations;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using Switchboard.Api.Hubs;

namespace Switchboard.Api.Jobs;

public class SheetsSyncJob
{
    private readonly SwitchboardDbContext _db;
    private readonly ILogger<SheetsSyncJob> _logger;
    private readonly GoogleSheetsService _sheetsService;
    private readonly IHubContext<ActivityHub> _hub;

    public SheetsSyncJob(SwitchboardDbContext db, ILogger<SheetsSyncJob> logger, GoogleSheetsService sheetsService, IHubContext<ActivityHub> hub)
    {
        _db = db;
        _logger = logger;
        _sheetsService = sheetsService;
        _hub = hub;
    }

    public async Task ExecuteAsync()
    {
        _logger.LogInformation("Starting Sheets Sync Job...");

        var refreshTokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsRefreshToken");
        if (refreshTokenConfig == null || string.IsNullOrEmpty(refreshTokenConfig.Value))
        {
            _logger.LogInformation("No Sheets Refresh Token found. Skipping.");
            return;
        }

        var spreadsheetIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsSpreadsheetId");
        if (spreadsheetIdConfig == null || string.IsNullOrEmpty(spreadsheetIdConfig.Value))
        {
            _logger.LogInformation("No spreadsheet selected. Skipping.");
            return;
        }

        try
        {
            var sheetLeads = await _sheetsService.FetchLeadsAsync();
            int created = 0, updated = 0;

            foreach (var sheetLead in sheetLeads)
            {
                // Match by Email or Phone as natural key
                Lead? existing = null;
                if (!string.IsNullOrEmpty(sheetLead.Email))
                    existing = await _db.Leads.FirstOrDefaultAsync(l => l.Email == sheetLead.Email);
                if (existing == null && !string.IsNullOrEmpty(sheetLead.Phone))
                    existing = await _db.Leads.FirstOrDefaultAsync(l => l.Phone == sheetLead.Phone);

                if (existing != null)
                {
                    // Update existing lead if sheet data has changed
                    bool changed = false;
                    if (!string.IsNullOrEmpty(sheetLead.Name) && existing.Name != sheetLead.Name) { existing.Name = sheetLead.Name; changed = true; }
                    if (!string.IsNullOrEmpty(sheetLead.Phone) && existing.Phone != sheetLead.Phone) { existing.Phone = sheetLead.Phone; changed = true; }
                    if (!string.IsNullOrEmpty(sheetLead.Source) && existing.Source != sheetLead.Source) { existing.Source = sheetLead.Source; changed = true; }
                    if (existing.SheetRowRef != sheetLead.SheetRowRef) { existing.SheetRowRef = sheetLead.SheetRowRef; changed = true; }

                    if (changed)
                    {
                        existing.UpdatedAt = DateTime.UtcNow;
                        updated++;
                    }
                }
                else
                {
                    // Skip rows with no email AND no phone — can't be matched later
                    if (string.IsNullOrEmpty(sheetLead.Email) && string.IsNullOrEmpty(sheetLead.Phone))
                        continue;

                    _db.Leads.Add(sheetLead);
                    created++;
                }
            }

            await _db.SaveChangesAsync();

            _logger.LogInformation("Sheets Sync complete: {Created} created, {Updated} updated", created, updated);

            await _hub.Clients.All.SendAsync("ReceiveLog", new
            {
                id = Guid.NewGuid().ToString(),
                time = DateTime.UtcNow.ToString("HH:mm:ss"),
                source = "Sheets Sync",
                message = $"✅ Synced leads from Google Sheets. {created} new, {updated} updated."
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync leads from Google Sheets");
        }
    }
}

using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Services;
using Google.Apis.Sheets.v4;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Switchboard.Api.Data;
using Switchboard.Api.Models;

namespace Switchboard.Api.Integrations;

public class GoogleSheetsService
{
    private readonly SwitchboardDbContext _db;
    private readonly ILogger<GoogleSheetsService> _logger;

    public GoogleSheetsService(SwitchboardDbContext db, ILogger<GoogleSheetsService> logger)
    {
        _db = db;
        _logger = logger;
    }

    private async Task<SheetsService?> CreateServiceAsync()
    {
        var refreshTokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsRefreshToken");
        var clientIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_ID");
        var clientSecretConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_SECRET");

        if (refreshTokenConfig == null || string.IsNullOrEmpty(refreshTokenConfig.Value) ||
            clientIdConfig == null || string.IsNullOrEmpty(clientIdConfig.Value) ||
            clientSecretConfig == null || string.IsNullOrEmpty(clientSecretConfig.Value))
        {
            return null;
        }

        var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
        {
            ClientSecrets = new ClientSecrets { ClientId = clientIdConfig.Value, ClientSecret = clientSecretConfig.Value },
            Scopes = new[] { SheetsService.Scope.Spreadsheets, "https://www.googleapis.com/auth/drive.file" }
        });

        var credential = new UserCredential(flow, "user", new TokenResponse { RefreshToken = refreshTokenConfig.Value });

        return new SheetsService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "Switchboard"
        });
    }

    public async Task<List<Lead>> FetchLeadsAsync()
    {
        var service = await CreateServiceAsync();
        if (service == null)
        {
            _logger.LogInformation("Google Sheets not connected. Skipping fetch.");
            return new List<Lead>();
        }

        var spreadsheetIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsSpreadsheetId");
        var sheetRangeConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsRange");
        
        if (spreadsheetIdConfig == null || string.IsNullOrEmpty(spreadsheetIdConfig.Value))
        {
            _logger.LogInformation("No spreadsheet selected. Skipping fetch.");
            return new List<Lead>();
        }

        var spreadsheetId = spreadsheetIdConfig.Value;
        var range = sheetRangeConfig?.Value ?? "Sheet1!A2:E"; // Default: columns A-E, skip header row

        try
        {
            var request = service.Spreadsheets.Values.Get(spreadsheetId, range);
            var response = await request.ExecuteAsync();

            var leads = new List<Lead>();
            if (response.Values == null) return leads;

            for (int i = 0; i < response.Values.Count; i++)
            {
                var row = response.Values[i];
                var lead = new Lead
                {
                    Name = row.Count > 0 ? row[0]?.ToString() ?? "" : "",
                    Email = row.Count > 1 ? row[1]?.ToString() ?? "" : "",
                    Phone = row.Count > 2 ? row[2]?.ToString() ?? "" : "",
                    Source = row.Count > 3 ? row[3]?.ToString() ?? "" : "",
                    SheetRowRef = i + 2 // 1-based, +1 for header row
                };

                // Parse status from sheet if present
                if (row.Count > 4 && !string.IsNullOrEmpty(row[4]?.ToString()))
                {
                    if (Enum.TryParse<LeadStatus>(row[4].ToString(), true, out var status))
                        lead.Status = status;
                }

                leads.Add(lead);
            }

            return leads;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch leads from Google Sheets");
            return new List<Lead>();
        }
    }

    public async Task SyncLeadStatusAsync(Guid leadId, string status)
    {
        var service = await CreateServiceAsync();
        if (service == null) return;

        var lead = await _db.Leads.FindAsync(leadId);
        if (lead == null || lead.SheetRowRef <= 0) return;

        var spreadsheetIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsSpreadsheetId");
        if (spreadsheetIdConfig == null || string.IsNullOrEmpty(spreadsheetIdConfig.Value)) return;

        try
        {
            // Write status to column E of the matching row
            var sheetTabConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsTabName");
            var tabName = sheetTabConfig?.Value ?? "Sheet1";
            var range = $"{tabName}!E{lead.SheetRowRef}";

            var valueRange = new Google.Apis.Sheets.v4.Data.ValueRange
            {
                Values = new List<IList<object>> { new List<object> { status } }
            };

            var updateReq = service.Spreadsheets.Values.Update(valueRange, spreadsheetIdConfig.Value, range);
            updateReq.ValueInputOption = SpreadsheetsResource.ValuesResource.UpdateRequest.ValueInputOptionEnum.RAW;
            await updateReq.ExecuteAsync();

            _logger.LogInformation("Synced lead {LeadId} status '{Status}' to Google Sheet row {Row}", leadId, status, lead.SheetRowRef);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync lead status to Google Sheet for lead {LeadId}", leadId);
        }
    }

    public async Task<object> GetConnectionStatusAsync()
    {
        var refreshTokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsRefreshToken");
        var spreadsheetIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsSpreadsheetId");
        var tabNameConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "SheetsTabName");

        return new
        {
            connected = refreshTokenConfig != null && !string.IsNullOrEmpty(refreshTokenConfig.Value),
            spreadsheetId = spreadsheetIdConfig?.Value,
            tabName = tabNameConfig?.Value ?? "Sheet1",
            hasSheet = spreadsheetIdConfig != null && !string.IsNullOrEmpty(spreadsheetIdConfig.Value)
        };
    }
}

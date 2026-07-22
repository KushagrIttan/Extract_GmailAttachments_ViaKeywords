using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Data;
using Switchboard.Api.Models;

namespace Switchboard.Api.Endpoints;
public static class ConfigEndpoints
{
    private static readonly HashSet<string> AllowedKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "isOnboarded",
        "whatsapp_voice_tone",
        "telegramToken",
        "telegramChatId",
        "GMAIL_CLIENT_ID",
        "GMAIL_CLIENT_SECRET",
        "GmailRefreshToken",
        "greenApiInstanceId",
        "greenApiToken",
        "SheetsRefreshToken",
        "SheetsSpreadsheetId",
        "SheetsTabName",
        "SheetsRange",
        "LinkedInSessionCookie",
        "LinkedInPollIntervalMinutes",
    };

    private static readonly HashSet<string> SensitiveKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "telegramToken",
        "GMAIL_CLIENT_SECRET",
        "GmailRefreshToken",
        "greenApiToken",
        "SheetsRefreshToken",
        "LinkedInSessionCookie",
    };

    public static void MapConfigEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/config");

        group.MapGet("/", async (SwitchboardDbContext db) =>
        {
            var config = await db.Configs.ToDictionaryAsync(
                c => c.Key,
                c => SensitiveKeys.Contains(c.Key) && !string.IsNullOrEmpty(c.Value) ? "•••••" : c.Value
            );
            return Results.Ok(config);
        });

        group.MapGet("/integrations-status", async (SwitchboardDbContext db) =>
        {
            var keys = await db.Configs.Select(c => c.Key).ToListAsync();
            return Results.Ok(new
            {
                telegram = keys.Contains("telegramToken"),
                gmail = keys.Contains("GmailRefreshToken"),
                sheets = keys.Contains("SheetsRefreshToken"),
                whatsapp = keys.Contains("greenApiInstanceId") && keys.Contains("greenApiToken"),
                linkedin = keys.Contains("LinkedInSessionCookie"),
            });
        });

        group.MapPost("/", async (Dictionary<string, string> input, SwitchboardDbContext db) =>
        {
            var invalidKeys = input.Keys.Where(k => !AllowedKeys.Contains(k)).ToList();
            if (invalidKeys.Any())
            {
                return Results.BadRequest(new { error = "Invalid config keys", invalidKeys });
            }

            foreach (var kvp in input)
            {
                if (kvp.Value?.Length > 5000)
                {
                    return Results.BadRequest(new { error = $"Value too long for key '{kvp.Key}' (max 5000 chars)" });
                }

                var existing = await db.Configs.FirstOrDefaultAsync(c => c.Key == kvp.Key);
                if (existing != null)
                {
                    existing.Value = kvp.Value;
                    existing.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    db.Configs.Add(new Config { Key = kvp.Key, Value = kvp.Value });
                }
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        });
    }
}

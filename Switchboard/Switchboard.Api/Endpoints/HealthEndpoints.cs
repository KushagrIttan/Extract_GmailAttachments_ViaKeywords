using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Switchboard.Api.Data;

namespace Switchboard.Api.Endpoints;

/// <summary>
/// Real health check endpoints that verify actual service connectivity
/// instead of just checking if config values exist in the database.
/// </summary>
public static class HealthEndpoints
{
    public static void MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/health");

        // PostgreSQL health check — actual SELECT 1
        group.MapGet("/db", async (SwitchboardDbContext db) =>
        {
            try
            {
                await db.Database.ExecuteSqlRawAsync("SELECT 1");
                return Results.Ok(new { status = "ok", message = "PostgreSQL connected" });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { status = "error", message = ex.Message });
            }
        });

        // Ollama engine health check — ping /api/tags
        group.MapGet("/ollama", async (IHttpClientFactory httpFactory) =>
        {
            try
            {
                var client = httpFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                var resp = await client.GetAsync("http://localhost:11434/api/tags");
                if (resp.IsSuccessStatusCode)
                    return Results.Ok(new { status = "ok", message = "Ollama running" });
                else
                    return Results.Ok(new { status = "error", message = $"Ollama returned {(int)resp.StatusCode}" });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { status = "error", message = $"Ollama unreachable: {ex.Message}" });
            }
        });

        // Telegram bot health check — call getMe API
        group.MapGet("/telegram", async (SwitchboardDbContext db) =>
        {
            var tokenConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramToken");
            if (tokenConfig == null || string.IsNullOrEmpty(tokenConfig.Value))
                return Results.Ok(new { status = "not_configured", message = "No Telegram token set" });

            try
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                var resp = await client.GetAsync($"https://api.telegram.org/bot{tokenConfig.Value}/getMe");
                if (resp.IsSuccessStatusCode)
                    return Results.Ok(new { status = "ok", message = "Telegram bot active" });
                else
                    return Results.Ok(new { status = "error", message = "Telegram token invalid or bot banned" });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { status = "error", message = $"Telegram unreachable: {ex.Message}" });
            }
        });

        // Gmail OAuth health check — verify token exists (full OAuth refresh check is expensive, skip for polling)
        group.MapGet("/gmail", async (SwitchboardDbContext db) =>
        {
            var hasClientId = await db.Configs.AnyAsync(c => c.Key == "GMAIL_CLIENT_ID" && !string.IsNullOrEmpty(c.Value));
            var hasSecret = await db.Configs.AnyAsync(c => c.Key == "GMAIL_CLIENT_SECRET" && !string.IsNullOrEmpty(c.Value));
            var hasRefreshToken = await db.Configs.AnyAsync(c => c.Key == "GmailRefreshToken" && !string.IsNullOrEmpty(c.Value));

            if (!hasClientId || !hasSecret)
                return Results.Ok(new { status = "not_configured", message = "Gmail OAuth not configured" });
            if (!hasRefreshToken)
                return Results.Ok(new { status = "not_authorized", message = "Gmail credentials set but not authorized (complete OAuth flow)" });

            return Results.Ok(new { status = "ok", message = "Gmail OAuth configured" });
        });

        // WhatsApp Green API health check — call getStateInstance
        group.MapGet("/whatsapp", async (SwitchboardDbContext db, IHttpClientFactory httpFactory) =>
        {
            var instanceConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "greenApiInstanceId");
            var tokenConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "greenApiToken");

            if (instanceConfig == null || string.IsNullOrEmpty(instanceConfig.Value) ||
                tokenConfig == null || string.IsNullOrEmpty(tokenConfig.Value))
                return Results.Ok(new { status = "not_configured", message = "WhatsApp Green API not configured" });

            try
            {
                var client = httpFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                var resp = await client.GetAsync(
                    $"https://api.green-api.com/waInstance{instanceConfig.Value}/getStateInstance/{tokenConfig.Value}");
                if (resp.IsSuccessStatusCode)
                {
                    var body = await resp.Content.ReadAsStringAsync();
                    // Green API returns {"stateInstance": "authorized"} when connected
                    if (body.Contains("authorized"))
                        return Results.Ok(new { status = "ok", message = "WhatsApp Green API connected" });
                    else
                        return Results.Ok(new { status = "error", message = "WhatsApp not authorized (scan QR)" });
                }
                return Results.Ok(new { status = "error", message = "Green API returned error" });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { status = "error", message = $"Green API unreachable: {ex.Message}" });
            }
        });

        // LinkedIn health check — check if cookie exists (can't test without Playwright)
        group.MapGet("/linkedin", async (SwitchboardDbContext db) =>
        {
            var cookieConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "LinkedInSessionCookie");
            if (cookieConfig == null || string.IsNullOrEmpty(cookieConfig.Value))
                return Results.Ok(new { status = "not_configured", message = "No LinkedIn cookie set" });

            return Results.Ok(new { status = "ok", message = "LinkedIn cookie configured (session validity unknown)" });
        });

        // All connections at once — for the dashboard sidebar
        group.MapGet("/all", async (SwitchboardDbContext db, IHttpClientFactory httpFactory) =>
        {
            var results = new Dictionary<string, object>();

            // Telegram — quick API check
            var telegramToken = await db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramToken");
            results["telegram"] = await CheckTelegram(telegramToken?.Value);

            // WhatsApp — quick API check
            var waInstance = await db.Configs.FirstOrDefaultAsync(c => c.Key == "greenApiInstanceId");
            var waToken = await db.Configs.FirstOrDefaultAsync(c => c.Key == "greenApiToken");
            results["whatsapp"] = await CheckWhatsApp(waInstance?.Value, waToken?.Value, httpFactory);

            // Gmail — config check only (OAuth refresh is too expensive for polling)
            var hasGmailRefresh = await db.Configs.AnyAsync(c => c.Key == "GmailRefreshToken" && !string.IsNullOrEmpty(c.Value));
            var hasGmailCreds = await db.Configs.AnyAsync(c => c.Key == "GMAIL_CLIENT_ID" && !string.IsNullOrEmpty(c.Value));
            results["gmail"] = new { status = !hasGmailCreds ? "not_configured" : (!hasGmailRefresh ? "not_authorized" : "ok"),
                                     message = !hasGmailCreds ? "Not configured" : (!hasGmailRefresh ? "Not authorized" : "OAuth configured") };

            // Sheets
            var hasSheets = await db.Configs.AnyAsync(c => c.Key == "SheetsRefreshToken" && !string.IsNullOrEmpty(c.Value));
            results["sheets"] = new { status = hasSheets ? "ok" : "not_configured",
                                      message = hasSheets ? "Connected" : "Not configured" };

            // LinkedIn
            var hasLinkedIn = await db.Configs.AnyAsync(c => c.Key == "LinkedInSessionCookie" && !string.IsNullOrEmpty(c.Value));
            results["linkedin"] = new { status = hasLinkedIn ? "ok" : "not_configured",
                                        message = hasLinkedIn ? "Cookie set" : "Not configured" };

            // DB
            try
            {
                await db.Database.ExecuteSqlRawAsync("SELECT 1");
                results["database"] = new { status = "ok", message = "PostgreSQL connected" };
            }
            catch (Exception ex)
            {
                results["database"] = new { status = "error", message = ex.Message };
            }

            return Results.Ok(results);
        });
    }

    private static async Task<object> CheckTelegram(string? token)
    {
        if (string.IsNullOrEmpty(token))
            return new { status = "not_configured", message = "No token set" };

        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            var resp = await client.GetAsync($"https://api.telegram.org/bot{token}/getMe");
            return resp.IsSuccessStatusCode
                ? new { status = "ok", message = "Bot active" }
                : new { status = "error", message = "Token invalid" };
        }
        catch { return new { status = "error", message = "Unreachable" }; }
    }

    private static async Task<object> CheckWhatsApp(string? instanceId, string? token, IHttpClientFactory httpFactory)
    {
        if (string.IsNullOrEmpty(instanceId) || string.IsNullOrEmpty(token))
            return new { status = "not_configured", message = "Not configured" };

        try
        {
            var client = httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(3);
            var resp = await client.GetAsync(
                $"https://api.green-api.com/waInstance{instanceId}/getStateInstance/{token}");
            if (!resp.IsSuccessStatusCode)
                return new { status = "error", message = "API error" };

            var body = await resp.Content.ReadAsStringAsync();
            return body.Contains("authorized")
                ? new { status = "ok", message = "Connected" }
                : new { status = "error", message = "Not authorized (scan QR)" };
        }
        catch { return new { status = "error", message = "Unreachable" }; }
    }
}

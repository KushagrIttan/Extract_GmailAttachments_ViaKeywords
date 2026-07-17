using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Data;
using Switchboard.Api.Models;

namespace Switchboard.Api.Endpoints;

public static class IntegrationsEndpoints
{
    public static void MapIntegrationsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/integrations");

        group.MapPost("/gmail/poll", () => 
        {
            Hangfire.RecurringJob.TriggerJob("gmail-poller");
            return Results.Ok(new { success = true, message = "Gmail poller triggered." });
        });

        group.MapPost("/gmail/configure", async (HttpContext context, SwitchboardDbContext db) =>
        {
            var req = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
            if (req == null || !req.ContainsKey("clientId") || !req.ContainsKey("clientSecret"))
                return Results.BadRequest(new { error = "Missing credentials" });
                
            var idConf = await db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_ID");
            if (idConf == null) db.Configs.Add(new Config { Key = "GMAIL_CLIENT_ID", Value = req["clientId"] });
            else idConf.Value = req["clientId"];

            var secConf = await db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_SECRET");
            if (secConf == null) db.Configs.Add(new Config { Key = "GMAIL_CLIENT_SECRET", Value = req["clientSecret"] });
            else secConf.Value = req["clientSecret"];

            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        });

        // WhatsApp (Evolution API) - uses Aspire service discovery
        group.MapPost("/whatsapp/qr", async (IHttpClientFactory clientFactory, IConfiguration config) =>
        {
            var client = clientFactory.CreateClient();
            // Aspire injects the Evolution API URL via service discovery.
            // The endpoint reference creates a config entry like "services__evolution-api__http__0"
            // We resolve it via the connection string or fall back to a known URL.
            var evoUrl = config["services:evolution-api:http:0"]
                         ?? config.GetConnectionString("evolution-api")
                         ?? "http://localhost:8080";
            var apiKey = "SwitchboardGlobalKey";

            try
            {
                // Attempt to create instance (ignores error if it already exists)
                var request = new HttpRequestMessage(HttpMethod.Post, $"{evoUrl}/instance/create");
                request.Headers.Add("apikey", apiKey);
                var body = new { instanceName = "switchboard_wa", qrcode = true, integration = "WHATSAPP-BAILEYS" };
                request.Content = new StringContent(JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json");
                await client.SendAsync(request);

                // Poll for the QR code for up to 8 seconds
                string lastContent = "";
                for(int i = 0; i < 6; i++)
                {
                    var fetchRequest = new HttpRequestMessage(HttpMethod.Get, $"{evoUrl}/instance/connect/switchboard_wa");
                    fetchRequest.Headers.Add("apikey", apiKey);
                    var fetchResponse = await client.SendAsync(fetchRequest);
                    lastContent = await fetchResponse.Content.ReadAsStringAsync();

                    if (fetchResponse.IsSuccessStatusCode)
                    {
                        var fetchJson = JsonSerializer.Deserialize<JsonElement>(lastContent);
                        if (fetchJson.TryGetProperty("base64", out var base64Element))
                        {
                            return Results.Ok(new { qr = base64Element.GetString(), status = "success" });
                        }
                    }
                    await Task.Delay(1500);
                }

                return Results.Ok(new { error = lastContent, status = "timeout", evoUrl });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, status = "error", evoUrl });
            }
        });

        // Gmail OAuth Start
        group.MapGet("/gmail/auth", async (HttpContext context, SwitchboardDbContext db) =>
        {
            var clientIdConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_ID");
            var clientId = clientIdConfig?.Value;
            
            var redirectUri = $"{context.Request.Scheme}://{context.Request.Host}/api/integrations/gmail/callback";
            var scope = "https://www.googleapis.com/auth/gmail.modify";

            if (string.IsNullOrEmpty(clientId))
            {
                return Results.BadRequest("Client ID is missing. Configure it first.");
            }

            var authUrl = $"https://accounts.google.com/o/oauth2/v2/auth?client_id={clientId}&redirect_uri={redirectUri}&response_type=code&scope={scope}&access_type=offline&prompt=consent";
            return Results.Redirect(authUrl);
        });

        // Gmail OAuth Callback — returns styled HTML that auto-closes
        group.MapGet("/gmail/callback", async (string code, HttpContext context, SwitchboardDbContext db) =>
        {
            var clientIdConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_ID");
            var clientSecretConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "GMAIL_CLIENT_SECRET");
            var clientId = clientIdConfig?.Value;
            var clientSecret = clientSecretConfig?.Value;
            var redirectUri = $"{context.Request.Scheme}://{context.Request.Host}/api/integrations/gmail/callback";

            string statusMessage;
            bool success;

            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
            {
                statusMessage = "Missing Client ID or Secret in database.";
                success = false;
            }
            else
            {
                var client = new HttpClient();
                var dict = new Dictionary<string, string>
                {
                    { "code", code },
                    { "client_id", clientId },
                    { "client_secret", clientSecret },
                    { "redirect_uri", redirectUri },
                    { "grant_type", "authorization_code" }
                };

                var req = new HttpRequestMessage(HttpMethod.Post, "https://oauth2.googleapis.com/token") { Content = new FormUrlEncodedContent(dict) };
                var res = await client.SendAsync(req);
                var content = await res.Content.ReadAsStringAsync();

                if (res.IsSuccessStatusCode)
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(content);
                    var refreshToken = json.GetProperty("refresh_token").GetString() ?? "";

                    var existingToken = await db.Configs.FirstOrDefaultAsync(c => c.Key == "GmailRefreshToken");
                    if (existingToken != null) existingToken.Value = refreshToken;
                    else db.Configs.Add(new Config { Key = "GmailRefreshToken", Value = refreshToken });
                    await db.SaveChangesAsync();

                    statusMessage = "Gmail connected successfully! Refresh token saved.";
                    success = true;
                }
                else
                {
                    statusMessage = $"OAuth failed: {content}";
                    success = false;
                }
            }

            var html = $@"
<!DOCTYPE html>
<html>
<head>
    <title>Switchboard — Gmail Auth</title>
    <style>
        body {{
            background: #1a1a2e;
            color: #e0e0e0;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }}
        .card {{
            background: #16213e;
            border: 1px solid {(success ? "#e2a832" : "#e74c3c")};
            border-radius: 8px;
            padding: 2rem 3rem;
            text-align: center;
            max-width: 400px;
        }}
        h2 {{ color: {(success ? "#e2a832" : "#e74c3c")}; margin-bottom: 1rem; }}
        p {{ color: #b0b0b0; font-size: 0.9rem; }}
        .countdown {{ color: #e2a832; font-size: 0.8rem; margin-top: 1rem; }}
    </style>
</head>
<body>
    <div class='card'>
        <h2>{(success ? "✅ CONNECTED" : "❌ FAILED")}</h2>
        <p>{statusMessage}</p>
        <p class='countdown'>This window will close in <span id='sec'>3</span>s...</p>
    </div>
    <script>
        let s = 3;
        setInterval(() => {{
            s--;
            document.getElementById('sec').textContent = s;
            if (s <= 0) window.close();
        }}, 1000);
    </script>
</body>
</html>";

            return Results.Content(html, "text/html");
        });
    }
}

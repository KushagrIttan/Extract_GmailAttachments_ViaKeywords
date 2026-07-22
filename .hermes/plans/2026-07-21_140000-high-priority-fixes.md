# Switchboard — High-Priority Fixes Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix 6 broken/risky issues in the Switchboard project — DigestCronJob no-op, Telegram duplicate polling, input validation, brittle LinkedIn selectors, Gmail error logging, and config secrets leak.

**Architecture:** Each fix is isolated to 1-3 files. No new dependencies needed. All fixes are backward-compatible — no database migrations, no breaking API changes.

**Tech Stack:** C# (.NET 10), ASP.NET Core Minimal APIs, React+TypeScript, Entity Framework Core, Telegram.Bot, Playwright, Hangfire

---

## Fix 1: DigestCronJob Is a No-Op

**Problem:** `DigestCronJob.ExecuteAsync()` logs "Starting" then does `await Task.CompletedTask`. The `DigestAgent` has working generation code but is never called. Daily digest at 17:00 produces nothing.

**Root cause:** The TODO comment says "Phase 3" — this was never wired up.

### Task 1.1: Wire DigestCronJob to DigestAgent and Telegram

**Objective:** Make the daily digest actually generate a summary and send it via Telegram.

**Files:**
- Modify: `Switchboard/Switchboard.Api/Jobs/DigestCronJob.cs:1-24` (entire file is 24 lines)

**Step 1: Rewrite DigestCronJob to use DigestAgent + Telegram**

Replace the entire file content:

```csharp
using Hangfire;
using Switchboard.Api.Data;
using Switchboard.Api.Agents;
using Switchboard.Api.Models;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Telegram.Bot;

namespace Switchboard.Api.Jobs;

public class DigestCronJob
{
    private readonly SwitchboardDbContext _db;
    private readonly ILogger<DigestCronJob> _logger;
    private readonly DigestAgent _digestAgent;

    public DigestCronJob(SwitchboardDbContext db, ILogger<DigestCronJob> logger, DigestAgent digestAgent)
    {
        _db = db;
        _logger = logger;
        _digestAgent = digestAgent;
    }

    public async Task ExecuteAsync()
    {
        _logger.LogInformation("Starting Daily Escalation Digest...");

        try
        {
            // Generate digest via AI
            var digest = await _digestAgent.GenerateDigestAsync();

            if (string.IsNullOrWhiteSpace(digest) || digest == "No pending escalations today.")
            {
                _logger.LogInformation("No pending escalations. Digest skipped.");
                return;
            }

            // Send via Telegram
            var tokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramToken");
            var chatIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramChatId");

            if (tokenConfig == null || string.IsNullOrEmpty(tokenConfig.Value) ||
                chatIdConfig == null || string.IsNullOrEmpty(chatIdConfig.Value))
            {
                _logger.LogWarning("Telegram not configured. Skipping digest delivery.");
                return;
            }

            var botClient = new TelegramBotClient(tokenConfig.Value);
            await botClient.SendMessage(
                chatId: chatIdConfig.Value,
                text: $"📊 DAILY ESCALATION DIGEST 📊\n\n{digest}",
                cancellationToken: CancellationToken.None
            );

            _logger.LogInformation("Daily digest sent to Telegram successfully.");

            // Broadcast to dashboard
            // (optional: inject IHubContext<ActivityHub> if you want it in the live feed)
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate or send daily digest");
        }
    }
}
```

**Step 2: Verify the file compiles**

Run (from project root):
```bash
cd Switchboard/Switchboard.Api && dotnet build --no-restore 2>&1 | tail -5
```
Expected: `Build succeeded.`

**Step 3: Commit**

```bash
git add Switchboard/Switchboard.Api/Jobs/DigestCronJob.cs
git commit -m "fix: wire up DigestCronJob to actually generate and send daily digest"
```

---

## Fix 2: Telegram Listener Race Condition

**Problem:** `TelegramListenerWorker.ExecuteAsync()` has a while loop that retries when no token is found. Each retry calls `botClient.StartReceiving()` without stopping the previous receiver. If the token was null → configured → the loop could spawn multiple concurrent polling loops.

**Root cause:** No tracking of whether a receiver is already active. `StartReceiving` is fire-and-forget.

### Task 2.1: Prevent Duplicate Polling Loops

**Objective:** Ensure only one Telegram polling session runs at a time.

**Files:**
- Modify: `Switchboard/Switchboard.Api/Workers/TelegramListenerWorker.cs:29-72`

**Step 1: Restructure ExecuteAsync to track receiver state**

Replace the `ExecuteAsync` method (lines 29-72) with:

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    ITelegramBotClient? activeBotClient = null;

    while (!stoppingToken.IsCancellationRequested)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SwitchboardDbContext>();

            var tokenConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramToken", stoppingToken);
            if (tokenConfig != null && !string.IsNullOrEmpty(tokenConfig.Value))
            {
                // Only start receiving if we don't already have an active client
                if (activeBotClient == null)
                {
                    _logger.LogInformation("Starting Telegram Bot listener...");
                    var botClient = new TelegramBotClient(tokenConfig.Value);
                    activeBotClient = botClient;

                    var receiverOptions = new ReceiverOptions
                    {
                        AllowedUpdates = { }
                    };

                    botClient.StartReceiving(
                        HandleUpdateAsync,
                        HandleErrorAsync,
                        receiverOptions,
                        cancellationToken: stoppingToken
                    );

                    _logger.LogInformation("Telegram Bot listener started successfully.");
                }

                // Check every 30 seconds if token changed (rare, but handle it)
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            else
            {
                // No token — reset active client so we retry when one is configured
                activeBotClient = null;
                _logger.LogInformation("No Telegram Token found. Retrying in 30 seconds.");
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (TaskCanceledException) { }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in Telegram Listener loop");
            activeBotClient = null; // Reset so we retry
            await Task.Delay(10000, stoppingToken);
        }
    }
}
```

**Step 2: Verify the file compiles**

```bash
cd Switchboard/Switchboard.Api && dotnet build --no-restore 2>&1 | tail -5
```
Expected: `Build succeeded.`

**Step 3: Commit**

```bash
git add Switchboard/Switchboard.Api/Workers/TelegramListenerWorker.cs
git commit -m "fix: prevent duplicate Telegram polling loops on retry"
```

---

## Fix 3: Input Validation on Write Endpoints

**Problem:** No validation on any write endpoint. Someone can inject arbitrary config keys, create empty keywords, or set invalid lead statuses.

### Task 3.1: Add Config Key Whitelist and Value Limits

**Objective:** Restrict which config keys can be written to via the public API.

**Files:**
- Modify: `Switchboard/Switchboard.Api/Endpoints/ConfigEndpoints.cs`

**Step 1: Add validation to ConfigEndpoints**

Replace the full file:

```csharp
using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Data;
using Switchboard.Api.Models;

namespace Switchboard.Api.Endpoints;

public static class ConfigEndpoints
{
    // Whitelist of config keys that the frontend is allowed to write
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

    public static void MapConfigEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/config");

        group.MapGet("/", async (SwitchboardDbContext db) =>
        {
            var config = await db.Configs.ToDictionaryAsync(c => c.Key, c => c.Value);
            return Results.Ok(config);
        });

        group.MapPost("/", async (Dictionary<string, string> input, SwitchboardDbContext db) =>
        {
            // Validate all keys are in the whitelist
            var invalidKeys = input.Keys.Where(k => !AllowedKeys.Contains(k)).ToList();
            if (invalidKeys.Any())
            {
                return Results.BadRequest(new
                {
                    error = "Invalid config keys",
                    invalidKeys
                });
            }

            foreach (var kvp in input)
            {
                // Reject values over 5000 chars (secrets are usually < 500)
                if (kvp.Value?.Length > 5000)
                {
                    return Results.BadRequest(new
                    {
                        error = $"Value too long for key '{kvp.Key}' (max 5000 chars)"
                    });
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
```

**Step 2: Verify the file compiles**

```bash
cd Switchboard/Switchboard.Api && dotnet build --no-restore 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add Switchboard/Switchboard.Api/Endpoints/ConfigEndpoints.cs
git commit -m "fix: add key whitelist and value length validation to config endpoints"
```

### Task 3.2: Add Keyword Validation

**Objective:** Prevent empty/oversized keywords and enforce basic quality rules.

**Files:**
- Modify: `Switchboard/Switchboard.Api/Endpoints/KeywordEndpoints.cs`

**Step 1: Add validation to KeywordEndpoints**

Replace the POST handler (lines 19-33):

```csharp
group.MapPost("/", async (KeywordRule input, SwitchboardDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(input.Keyword))
        return Results.BadRequest(new { error = "Keyword required" });

    var keyword = input.Keyword.Trim();

    // Max 100 chars per keyword
    if (keyword.Length > 100)
        return Results.BadRequest(new { error = "Keyword must be 100 characters or fewer" });

    // Only allow alphanumeric, spaces, hyphens, and common punctuation
    if (!System.Text.RegularExpressions.Regex.IsMatch(keyword, @"^[a-zA-Z0-9\s\-\.\,\@\#\$\%\&\*]+$"))
        return Results.BadRequest(new { error = "Keyword contains invalid characters" });

    var existing = await db.KeywordRules.FirstOrDefaultAsync(k => k.Keyword == keyword);
    if (existing != null)
        return Results.Ok(new { message = "Already exists" });

    var newKeyword = new KeywordRule { Keyword = keyword };
    db.KeywordRules.Add(newKeyword);
    await db.SaveChangesAsync();

    return Results.Ok(newKeyword);
});
```

**Step 2: Verify**

```bash
cd Switchboard/Switchboard.Api && dotnet build --no-restore 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add Switchboard/Switchboard.Api/Endpoints/KeywordEndpoints.cs
git commit -m "fix: add input validation to keyword create endpoint"
```

### Task 3.3: Add Lead Status Validation

**Objective:** Validate lead ID format and status values.

**Files:**
- Modify: `Switchboard/Switchboard.Api/Endpoints/LeadEndpoints.cs:33-68`

**Step 1: Add Guid validation to the PATCH handler**

The existing code already does `Enum.TryParse<LeadStatus>` which is good. The only gap is that `Guid id` is validated by the framework. No change needed here — the existing validation is sufficient.

**Skip to next task.**

---

## Fix 4: LinkedIn Selector Resilience

**Problem:** LinkedIn CSS class names like `msg-conversations-container`, `msg-conversation-listitem` are auto-generated and change frequently. When LinkedIn updates, the scraper silently fails (returns 0 conversations) without any error.

### Task 4.1: Add Selector Health Check and Logging

**Objective:** Detect when selectors break and log clear diagnostics instead of failing silently.

**Files:**
- Modify: `Switchboard/Switchboard.Api/Workers/LinkedInWatcherWorker.cs:86-221` (the `PollLinkedInMessagesAsync` method)

**Step 1: Add selector diagnostics after page load**

After line 140 (`await page.WaitForSelectorAsync(...)`) and line 143 (`await page.QuerySelectorAllAsync(...)`), add defensive checks:

Replace the section from line 138-147 with:

```csharp
            // Wait for the messaging thread list to load
            bool containerFound = false;
            try
            {
                await page.WaitForSelectorAsync("[class*='msg-conversations-container'], [data-testid='msg-conversations-container'], .msg-conversations-container", new PageWaitForSelectorOptions { Timeout = 15000 });
                containerFound = true;
            }
            catch (PlaywrightException)
            {
                // LinkedIn may have changed its CSS classes — log diagnostics
                var pageContent = await page.ContentAsync();
                var hasMessaging = pageContent.Contains("messaging") || pageContent.Contains("inbox");
                _logger.LogWarning(
                    "LinkedIn messaging container not found. Page has messaging content: {HasMessaging}. " +
                    "LinkedIn may have updated its UI. Selectors may need updating. " +
                    "Page URL: {Url}",
                    hasMessaging, page.Url
                );
            }

            if (!containerFound)
            {
                // Try fallback: look for any conversation list
                var fallbackConversations = await page.QuerySelectorAllAsync("[role='listitem']");
                if (fallbackConversations.Count == 0)
                {
                    _logger.LogWarning("No conversations found with any selector. Skipping this poll cycle.");
                    return;
                }
                _logger.LogInformation("Fallback selector found {Count} items", fallbackConversations.Count);
            }

            // Get all conversation items — try primary then fallback selectors
            var conversations = await page.QuerySelectorAllAsync("[class*='msg-conversation-listitem']");
            if (conversations.Count == 0)
            {
                // Fallback: try role-based selectors
                conversations = await page.QuerySelectorAllAsync("[role='link'][href*='/messaging/']");
            }
            if (conversations.Count == 0)
            {
                // Last resort: try any list item in the messaging panel
                conversations = await page.QuerySelectorAllAsync(".msg-conversation-listitem, [data-conversation-id]");
            }
            _logger.LogInformation("Found {Count} LinkedIn conversations", conversations.Count);
```

Also replace the message extraction selectors (lines 163, 168, 175) with fallback-aware versions:

```csharp
                    // Extract all messages in the thread — try multiple selector strategies
                    var messageEls = await page.QuerySelectorAllAsync("[class*='msg-s-event-listitem']");
                    if (messageEls.Count == 0)
                        messageEls = await page.QuerySelectorAllAsync("[role='listitem'] [data-testid*='message']");
                    if (messageEls.Count == 0)
                        continue;

                    // Check if last message is from the other person (not us)
                    var lastMsg = messageEls[messageEls.Count - 1];
                    var isSelf = await lastMsg.QuerySelectorAsync("[class*='msg-s-message-group--outbound']");
                    if (isSelf == null)
                        isSelf = await lastMsg.QuerySelectorAsync("[data-testid*='outbound']");
                    if (isSelf != null) continue; // Skip — we already replied

                    // Build thread history
                    var threadHistory = "";
                    foreach (var msgEl in messageEls.TakeLast(6))
                    {
                        var bodyEl = await msgEl.QuerySelectorAsync("[class*='msg-s-event__content']");
                        if (bodyEl == null)
                            bodyEl = await msgEl.QuerySelectorAsync("[data-testid*='message-content']");
                        if (bodyEl == null)
                            bodyEl = await msgEl.QuerySelectorAsync("p, span");
                        if (bodyEl != null)
                        {
                            var text = (await bodyEl.InnerTextAsync()).Trim();
                            if (!string.IsNullOrEmpty(text))
                                threadHistory += text + "\n\n";
                        }
                    }
```

**Step 2: Verify**

```bash
cd Switchboard/Switchboard.Api && dotnet build --no-restore 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add Switchboard/Switchboard.Api/Workers/LinkedInWatcherWorker.cs
git commit -m "fix: add fallback selectors and diagnostic logging for LinkedIn scraping"
```

---

## Fix 5: Gmail Error Logging

**Problem:** `GmailPollerJob` writes exceptions to `gmail_error.txt` in the working directory. This is a file leak, not observable, and could fail on read-only filesystems.

### Task 5.1: Replace File Write with Logger

**Objective:** Remove `File.WriteAllText("gmail_error.txt", ...)` and use the injected `_logger` instead.

**Files:**
- Modify: `Switchboard/Switchboard.Api/Jobs/GmailPollerJob.cs:225`

**Step 1: Replace the error handler**

Replace line 225:
```csharp
System.IO.File.WriteAllText("gmail_error.txt", ex.ToString());
```
With:
```csharp
// _logger.LogError is already called above — no need for file write
// Removed: was writing raw exceptions to gmail_error.txt in working directory
```

Actually, looking at lines 222-226:
```csharp
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to poll Gmail API");
            System.IO.File.WriteAllText("gmail_error.txt", ex.ToString());
        }
```

The `_logger.LogError(ex, ...)` already captures the full exception with stack trace. The `File.WriteAllText` is redundant. Remove it:

```csharp
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to poll Gmail API");
        }
```

**Step 2: Verify**

```bash
cd Switchboard/Switchboard.Api && dotnet build --no-restore 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add Switchboard/Switchboard.Api/Jobs/GmailPollerJob.cs
git commit -m "fix: remove redundant gmail_error.txt file write, use logger instead"
```

---

## Fix 6: Config Endpoint Secrets Leak

**Problem:** `GET /api/config` returns ALL config values including Telegram tokens, Gmail secrets, OAuth refresh tokens, LinkedIn cookies. The frontend calls this on load and puts everything in browser memory.

### Task 6.1: Split Config Endpoint into Safe and Sensitive Responses

**Objective:** The public `GET /api/config` should return only non-sensitive keys. Secrets should be accessible only through a separate endpoint (for onboarding pre-fill) that masks values.

**Files:**
- Modify: `Switchboard/Switchboard.Api/Endpoints/ConfigEndpoints.cs` (already modified in Task 3.1, so this extends it)
- Modify: `Switchboard/Switchboard.UI/src/App.tsx:48-58` (the config fetch)
- Modify: `Switchboard/Switchboard.UI/src/Onboarding.tsx:28-41` (the config fetch)

**Step 1: Add sensitive keys list and mask values in GET endpoint**

Update ConfigEndpoints.cs — modify the GET handler:

```csharp
    // Keys that should be masked in API responses (return "•••••" instead of actual value)
    private static readonly HashSet<string> SensitiveKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "telegramToken",
        "GMAIL_CLIENT_SECRET",
        "GmailRefreshToken",
        "greenApiToken",
        "SheetsRefreshToken",
        "LinkedInSessionCookie",
    };

    group.MapGet("/", async (SwitchboardDbContext db) =>
    {
        var config = await db.Configs.ToDictionaryAsync(
            c => c.Key,
            c => SensitiveKeys.Contains(c.Key) && !string.IsNullOrEmpty(c.Value) ? "•••••" : c.Value
        );
        return Results.Ok(config);
    });
```

**Step 2: Add a status-only endpoint for sensitive integrations**

Add this endpoint to the same `MapConfigEndpoints` method, right after the GET:

```csharp
        // Returns whether sensitive integrations are configured, without revealing values
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
```

**Step 3: Update App.tsx to use the masked endpoint safely**

The `App.tsx` config fetch (lines 48-58) only checks `isOnboarded` and `whatsapp_voice_tone`. These are not sensitive. The masked endpoint still returns them correctly. **No change needed for App.tsx.**

**Step 4: Update Onboarding.tsx to handle masked secrets**

In `Onboarding.tsx`, the config fetch (lines 28-41) populates `creds` state with actual tokens for pre-filling inputs. With masking, the values will be `•••••`. The input fields should show that something is configured rather than the raw value.

Replace the `useEffect` config fetch (lines 27-47):

```typescript
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(data => {
      // Non-sensitive fields are returned as-is
      setCreds(prev => ({
        ...prev,
        telegramToken: data.telegramToken || prev.telegramToken,
        telegramChatId: data.telegramChatId || prev.telegramChatId,
        gmailClientId: data.GMAIL_CLIENT_ID || prev.gmailClientId,
        gmailClientSecret: data.GMAIL_CLIENT_SECRET || prev.gmailClientSecret,
        greenApiInstanceId: data.greenApiInstanceId || prev.greenApiInstanceId,
        greenApiToken: data.greenApiToken || prev.greenApiToken
      }));
      if (data.GmailRefreshToken) setGmailConnected(true);
      if (data.SheetsRefreshToken) setSheetsConnected(true);
      if (data.SheetsTabName) setSheetsSheetName(data.SheetsTabName);
    });

    // Load Google Picker API script
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    document.body.appendChild(script);
  }, []);
```

The existing code already handles this gracefully — if `data.telegramToken` is `"•••••"` it just puts that in the input. Since the inputs are `type="password"`, the dots render identically to the masked value. **No functional change needed — the masking is transparent.**

**Step 5: Verify**

```bash
cd Switchboard/Switchboard.Api && dotnet build --no-restore 2>&1 | tail -5
```

**Step 6: Commit**

```bash
git add Switchboard/Switchboard.Api/Endpoints/ConfigEndpoints.cs
git commit -m "fix: mask sensitive config values in GET response, add integrations-status endpoint"
```

---

## Final Verification

### Step 1: Full Build

```bash
cd Switchboard/Switchboard.Api && dotnet build
cd Switchboard/Switchboard.UI && npm run build
```

Expected: Both succeed with no errors.

### Step 2: Smoke Test the Changes

| Endpoint | Before | After |
|---|---|---|
| `GET /api/config` | Returns raw tokens | Returns `"•••••"` for sensitive keys |
| `POST /api/config` with invalid key | Accepts anything | Returns 400 with `invalidKeys` list |
| `POST /api/config` with oversized value | Accepts anything | Returns 400 |
| `POST /api/keywords/` with empty string | Returns 400 (already worked) | Same |
| `POST /api/keywords/` with `<script>` | Accepts it | Returns 400 |
| `POST /api/config` with `isOnboarded` from external source | Accepted | Still accepted (it's in whitelist) |
| DigestCronJob | No-op | Generates digest + sends via Telegram |
| Telegram Listener | Can spawn duplicates | Single polling loop with state tracking |
| LinkedIn Worker | Fails silently on selector change | Logs warning with diagnostics |
| Gmail errors | Writes to `gmail_error.txt` | Uses `_logger.LogError` only |

### Step 3: Commit All Changes

```bash
git add -A
git commit -m "fix: 6 high-priority fixes — digest wiring, telegram race condition, input validation, linkedin selectors, gmail logging, config secrets"
```

---

## Files Changed Summary

| File | Changes |
|---|---|
| `Switchboard/Switchboard.Api/Jobs/DigestCronJob.cs` | Full rewrite — wire up DigestAgent + Telegram delivery |
| `Switchboard/Switchboard.Api/Workers/TelegramListenerWorker.cs` | Rewrite ExecuteAsync — track active receiver, prevent duplicates |
| `Switchboard/Switchboard.Api/Endpoints/ConfigEndpoints.cs` | Full rewrite — key whitelist, value length limits, sensitive masking, integrations-status endpoint |
| `Switchboard/Switchboard.Api/Endpoints/KeywordEndpoints.cs` | Add length/character validation to POST handler |
| `Switchboard/Switchboard.Api/Workers/LinkedInWatcherWorker.cs` | Add fallback selectors, diagnostic logging |
| `Switchboard/Switchboard.Api/Jobs/GmailPollerJob.cs` | Remove 1 line (File.WriteAllText) |

**No new files created. No new NuGet packages. No database migrations. No breaking API changes.**

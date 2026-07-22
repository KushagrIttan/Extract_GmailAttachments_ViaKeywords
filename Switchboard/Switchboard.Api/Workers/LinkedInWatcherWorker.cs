using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Playwright;
using Switchboard.Api.Data;
using Switchboard.Api.Agents;

namespace Switchboard.Api.Workers;

/// <summary>
/// Background worker that periodically checks LinkedIn messages for unreplied threads.
/// Uses Playwright (Chromium) to read messages — does NOT send any messages automatically.
///
/// IMPORTANT: LinkedIn has no sanctioned API for personal messaging automation.
/// Automated sending risks account suspension. Every LinkedIn reply must go through
/// Telegram approval and then be MANUALLY copy-pasted by the user in their own browser.
/// This is an intentional design decision — do NOT "fix" this to add auto-send
/// without understanding the LinkedIn ToS/ban risk.
/// </summary>
public class LinkedInWatcherWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<LinkedInWatcherWorker> _logger;
    private static readonly string BrowserStatePath = Path.Combine(Directory.GetCurrentDirectory(), ".playwright-state");

    public LinkedInWatcherWorker(IServiceProvider serviceProvider, ILogger<LinkedInWatcherWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait a bit on startup to let other services initialize
        await Task.Delay(15000, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Check if auto-send flag is set (it should NOT be, but log loudly if it is)
                using (var checkScope = _serviceProvider.CreateScope())
                {
                    var checkDb = checkScope.ServiceProvider.GetRequiredService<SwitchboardDbContext>();
                    var autoSendConfig = await checkDb.Configs.FirstOrDefaultAsync(c => c.Key == "LinkedInAutoSendEnabled", stoppingToken);
                    if (autoSendConfig?.Value?.ToLower() == "true")
                    {
                        _logger.LogCritical(
                            "⚠️⚠️⚠️ LinkedInAutoSendEnabled is set to TRUE! This is EXTREMELY DANGEROUS and risks " +
                            "LinkedIn account suspension. Auto-send is NOT implemented intentionally. " +
                            "Set this back to 'false' immediately. ⚠️⚠️⚠️");
                    }
                }

                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<SwitchboardDbContext>();

                var sessionCookie = await db.Configs.FirstOrDefaultAsync(c => c.Key == "LinkedInSessionCookie", stoppingToken);
                if (sessionCookie == null || string.IsNullOrEmpty(sessionCookie.Value))
                {
                    _logger.LogInformation("No LinkedIn session cookie found. Skipping. Configure via dashboard.");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                    continue;
                }

                var intervalConfig = await db.Configs.FirstOrDefaultAsync(c => c.Key == "LinkedInPollIntervalMinutes", stoppingToken);
                int intervalMinutes = 30;
                if (intervalConfig != null && int.TryParse(intervalConfig.Value, out var parsed))
                    intervalMinutes = Math.Max(10, parsed); // Minimum 10 minutes to avoid rate limiting

                await PollLinkedInMessagesAsync(sessionCookie.Value, db, scope.ServiceProvider, stoppingToken);

                _logger.LogInformation("LinkedIn poll complete. Next check in {Interval} minutes.", intervalMinutes);
                await Task.Delay(TimeSpan.FromMinutes(intervalMinutes), stoppingToken);
            }
            catch (TaskCanceledException) { }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in LinkedIn Watcher loop");
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
            }
        }
    }

    private async Task PollLinkedInMessagesAsync(string liAtCookie, SwitchboardDbContext db, IServiceProvider scopedProvider, CancellationToken ct)
    {
        IPlaywright? playwright = null;
        IBrowserContext? context = null;

        try
        {
            playwright = await Playwright.CreateAsync();
            
            // Use LaunchPersistentContextAsync to save session cache, cookies, and local state
            context = await playwright.Chromium.LaunchPersistentContextAsync(BrowserStatePath, new BrowserTypeLaunchPersistentContextOptions
            {
                Headless = true,
                Args = new[] 
                { 
                    "--disable-blink-features=AutomationControlled",
                    "--headless=new" 
                },
                UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                ViewportSize = new ViewportSize { Width = 1280, Height = 720 }
            });

            // Stealth script overrides to mask automated browser footprint
            await context.AddInitScriptAsync(@"
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            ");

            // Set/Refresh the LinkedIn session cookie
            await context.AddCookiesAsync(new[]
            {
                new Cookie
                {
                    Name = "li_at",
                    Value = liAtCookie,
                    Domain = ".linkedin.com",
                    Path = "/",
                    Secure = true,
                    HttpOnly = true
                }
            });

            var page = await context.NewPageAsync();

            // Navigate to homepage first to establish tracking and make session look organic
            _logger.LogInformation("Navigating to LinkedIn Homepage first to establish organic session...");
            await page.GotoAsync("https://www.linkedin.com/", new PageGotoOptions { WaitUntil = WaitUntilState.NetworkIdle, Timeout = 30000 });
            await page.WaitForTimeoutAsync(Random.Shared.Next(3000, 6000)); // Mimic reading feed

            _logger.LogInformation("Navigating to LinkedIn Messaging...");
            await page.GotoAsync("https://www.linkedin.com/messaging/", new PageGotoOptions { WaitUntil = WaitUntilState.NetworkIdle, Timeout = 30000 });

            // Wait for the messaging thread list to load — try multiple selector strategies
            bool containerFound = false;
            try
            {
                await page.WaitForSelectorAsync(
                    "[class*='msg-conversations-container'], [data-testid='msg-conversations-container'], .msg-conversations-container",
                    new PageWaitForSelectorOptions { Timeout = 15000 });
                containerFound = true;
            }
            catch (PlaywrightException)
            {
                var pageContent = await page.ContentAsync();
                var hasMessaging = pageContent.Contains("messaging") || pageContent.Contains("inbox");
                _logger.LogWarning(
                    "LinkedIn messaging container not found. Page has messaging content: {HasMessaging}. " +
                    "LinkedIn may have updated its UI. Page URL: {Url}",
                    hasMessaging, page.Url);
            }

            if (!containerFound)
            {
                _logger.LogWarning("No messaging container found. Skipping this poll cycle.");
                return;
            }

            // Get all conversation items — try primary then fallback selectors
            var conversations = await page.QuerySelectorAllAsync("[class*='msg-conversation-listitem']");
            if (conversations.Count == 0)
                conversations = await page.QuerySelectorAllAsync("[role='link'][href*='/messaging/']");
            if (conversations.Count == 0)
                conversations = await page.QuerySelectorAllAsync("[data-conversation-id], .msg-conversation-listitem");
            _logger.LogInformation("Found {Count} LinkedIn conversations", conversations.Count);

            int processedCount = 0;
            foreach (var conv in conversations.Take(10)) // Process max 10 conversations per poll
            {
                try
                {
                    // Click the conversation to load it
                    await conv.ClickAsync();
                    
                    // Randomized wait to simulate human clicking and reading
                    int clickDelay = Random.Shared.Next(2000, 4500); 
                    await page.WaitForTimeoutAsync(clickDelay);

                    // Extract sender name — try multiple selectors
                    var nameEl = await page.QuerySelectorAsync("[class*='msg-overlay-bubble-header'] [class*='truncate']");
                    if (nameEl == null)
                        nameEl = await page.QuerySelectorAsync("[data-testid='msg-overlay-bubble-header'] span");
                    if (nameEl == null)
                        nameEl = await page.QuerySelectorAsync(".msg-overlay-bubble-header span.truncate");
                    var senderName = nameEl != null ? (await nameEl.InnerTextAsync()).Trim() : "Unknown";

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
                    foreach (var msgEl in messageEls.TakeLast(6)) // Last 6 messages for context
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

                    if (string.IsNullOrWhiteSpace(threadHistory)) continue;

                    // Check if we've already created an escalation for this thread recently (avoid duplicates)
                    var recentEsc = await db.Escalations
                        .Where(e => e.Source == "LinkedIn" && e.MessagePreview.Contains(senderName) && e.CreatedAt > DateTime.UtcNow.AddHours(-2))
                        .AnyAsync(ct);
                    if (recentEsc) continue;

                    // Get thread URL from the page
                    var threadUrl = page.Url;

                    // Process through LinkedInTriageAgent
                    var agent = scopedProvider.GetRequiredService<LinkedInTriageAgent>();
                    await agent.ProcessThreadAsync(senderName, threadHistory.Trim(), threadUrl);
                    processedCount++;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to process a LinkedIn conversation");
                }
            }

            _logger.LogInformation("LinkedIn poll processed {Count} unreplied threads", processedCount);
        }
        catch (PlaywrightException ex) when (ex.Message.Contains("Executable doesn't exist"))
        {
            _logger.LogError("Playwright browsers not installed. Run 'npx playwright install chromium' to fix.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to poll LinkedIn messages");
        }
        finally
        {
            if (context != null) await context.CloseAsync();
            playwright?.Dispose();
        }
    }
}

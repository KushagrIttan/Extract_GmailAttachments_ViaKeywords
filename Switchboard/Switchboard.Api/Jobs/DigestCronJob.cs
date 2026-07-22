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
        try
        {
            _logger.LogInformation("Starting Daily Escalation Digest...");
            var digest = await _digestAgent.GenerateDigestAsync();

            if (string.IsNullOrWhiteSpace(digest) || digest == "No pending escalations today.")
            {
                _logger.LogInformation("No pending escalations. Skipping digest.");
                return;
            }

            var tokenConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramToken");
            var chatIdConfig = await _db.Configs.FirstOrDefaultAsync(c => c.Key == "telegramChatId");

            if (tokenConfig == null || string.IsNullOrEmpty(tokenConfig.Value) ||
                chatIdConfig == null || string.IsNullOrEmpty(chatIdConfig.Value))
            {
                _logger.LogWarning("Telegram token or chat ID not configured. Skipping digest.");
                return;
            }

            var botClient = new TelegramBotClient(tokenConfig.Value);
            await botClient.SendMessage(chatIdConfig.Value, $"📊 DAILY ESCALATION DIGEST 📊\n\n{digest}");

            _logger.LogInformation("Digest sent to Telegram successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send daily escalation digest");
        }
    }
}

using Hangfire;
using Switchboard.Api.Data;
using Microsoft.Extensions.Logging;

namespace Switchboard.Api.Jobs;

public class DigestCronJob
{
    private readonly SwitchboardDbContext _db;
    private readonly ILogger<DigestCronJob> _logger;

    public DigestCronJob(SwitchboardDbContext db, ILogger<DigestCronJob> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task ExecuteAsync()
    {
        _logger.LogInformation("Starting Daily Escalation Digest...");
        // TODO: In Phase 3, this will use Telegram.Bot to send messages.
        await Task.CompletedTask;
    }
}

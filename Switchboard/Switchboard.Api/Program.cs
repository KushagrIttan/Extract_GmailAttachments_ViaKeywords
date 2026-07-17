using Switchboard.Api.Data;
using Switchboard.Api.Endpoints;
using Switchboard.Api.Models;
using Switchboard.Api.Jobs;
using Switchboard.Api.Agents;
using Switchboard.Api.Hubs;
using Microsoft.EntityFrameworkCore;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.Extensions.AI;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Add EF Core DbContext with Aspire PostgreSQL
builder.AddNpgsqlDbContext<SwitchboardDbContext>("switchboard");

// Add Hangfire using the same connection string from Aspire
var connectionString = builder.Configuration.GetConnectionString("switchboard");
builder.Services.AddHangfire(config =>
    config.UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));
builder.Services.AddHangfireServer();

// Add IChatClient (Ollama)
var ollamaConnectionString = builder.Configuration.GetConnectionString("chatModel");
builder.Services.AddChatClient(new OllamaChatClient(new Uri(ollamaConnectionString ?? "http://localhost:11434"), "hf.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF:Q4_K_M"));

// Add Agents
builder.Services.AddScoped<TriageAgent>();
builder.Services.AddScoped<DraftingAgent>();
builder.Services.AddScoped<DigestAgent>();
builder.Services.AddHostedService<Switchboard.Api.Workers.TelegramListenerWorker>();

builder.Services.AddHttpClient();
builder.Services.AddSignalR();

builder.Services.AddOpenApi();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<SwitchboardDbContext>();
    db.Database.Migrate();
}

app.MapDefaultEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseHangfireDashboard("/hangfire");

// Schedule recurring jobs
RecurringJob.AddOrUpdate<GmailPollerJob>("gmail-poller", job => job.ExecuteAsync(), Cron.Minutely);
RecurringJob.AddOrUpdate<DigestCronJob>("digest-cron", job => job.ExecuteAsync(), "0 17 * * *"); // 17:00 Daily
RecurringJob.AddOrUpdate<CorpusBuilderJob>("corpus-builder", job => job.ExecuteAsync(), Cron.Daily); // Runs every 24 hours

// Map Endpoints
app.MapConfigEndpoints();
app.MapKeywordEndpoints();
app.MapStatsEndpoints();
app.MapWebhookEndpoints();
app.MapIntegrationsEndpoints();
app.MapHub<ActivityHub>("/hub/activity");

app.Run();

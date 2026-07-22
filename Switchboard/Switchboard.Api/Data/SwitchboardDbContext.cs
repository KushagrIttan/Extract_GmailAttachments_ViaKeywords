using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Models;

namespace Switchboard.Api.Data;

public class SwitchboardDbContext : DbContext
{
    public SwitchboardDbContext(DbContextOptions<SwitchboardDbContext> options) : base(options) { }

    public DbSet<Config> Configs { get; set; }
    public DbSet<KeywordRule> KeywordRules { get; set; }
    public DbSet<Escalation> Escalations { get; set; }
    public DbSet<WaMessage> WaMessages { get; set; }
    public DbSet<EmailDraft> EmailDrafts { get; set; }
    public DbSet<EmailResult> EmailResults { get; set; }
    public DbSet<AgentRunLog> AgentRunLogs { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<Lead> Leads { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Ensure table names match Supabase/Postgres conventions
        modelBuilder.Entity<Config>().ToTable("config");
        modelBuilder.Entity<KeywordRule>().ToTable("keywords");
        modelBuilder.Entity<Escalation>().ToTable("escalations");
        modelBuilder.Entity<WaMessage>().ToTable("wa_messages");
        modelBuilder.Entity<EmailDraft>().ToTable("email_drafts");
        modelBuilder.Entity<EmailResult>().ToTable("email_results");
        modelBuilder.Entity<AgentRunLog>().ToTable("agent_run_logs");
        modelBuilder.Entity<User>().ToTable("users");
        modelBuilder.Entity<Lead>().ToTable("leads");

        // Store enums as strings for readability in Postgres
        modelBuilder.Entity<Lead>()
            .Property(l => l.Status)
            .HasConversion<string>();
        modelBuilder.Entity<Lead>()
            .Property(l => l.Channel)
            .HasConversion<string>();
    }
}

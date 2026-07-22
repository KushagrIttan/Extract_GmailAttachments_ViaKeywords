using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Switchboard.Api.Models;

public enum LeadStatus
{
    New,
    Contacted,
    Replied,
    Converted,
    Dead
}

public enum LeadChannel
{
    WhatsApp,
    Email,
    LinkedIn
}

public class Lead
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    
    public LeadStatus Status { get; set; } = LeadStatus.New;
    
    public DateTime? LastContactedAt { get; set; }
    
    public LeadChannel Channel { get; set; } = LeadChannel.Email;
    
    public string Notes { get; set; } = string.Empty;
    
    /// <summary>
    /// Row index in the Google Sheet (1-based, excluding header). Used for bidirectional sync.
    /// </summary>
    public int SheetRowRef { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

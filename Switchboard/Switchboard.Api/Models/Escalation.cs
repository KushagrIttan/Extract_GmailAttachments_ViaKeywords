using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Switchboard.Api.Models;

public class Escalation
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    public string Source { get; set; } = string.Empty; // e.g. "WhatsApp", "Gmail"
    
    [Required]
    public string MessagePreview { get; set; } = string.Empty;
    
    public string FullMessagePayload { get; set; } = string.Empty; // JSON
    
    public string Status { get; set; } = "Pending"; // Pending, Resolved, Approved
    
    /// <summary>
    /// Discriminator for which channel this escalation belongs to (WhatsApp, Gmail, LinkedIn).
    /// Defaults from Source for backwards compatibility with existing data.
    /// </summary>
    public string? Channel { get; set; }
    
    /// <summary>
    /// For LinkedIn approved escalations: the URL to the LinkedIn thread for manual send.
    /// </summary>
    public string? ThreadUrl { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
}

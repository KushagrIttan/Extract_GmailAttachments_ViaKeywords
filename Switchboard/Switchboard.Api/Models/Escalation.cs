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
    
    public string Status { get; set; } = "Pending"; // Pending, Resolved
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
}

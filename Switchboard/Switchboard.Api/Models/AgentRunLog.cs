using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Switchboard.Api.Models;

public class AgentRunLog
{
    [Key]
    public int Id { get; set; }
    
    public string AgentName { get; set; } = string.Empty;
    public string InputPayload { get; set; } = string.Empty;
    public string OutputPayload { get; set; } = string.Empty;
    
    public bool FallbackTriggered { get; set; } = false;
    public int DurationMs { get; set; }
    public int TokenCount { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

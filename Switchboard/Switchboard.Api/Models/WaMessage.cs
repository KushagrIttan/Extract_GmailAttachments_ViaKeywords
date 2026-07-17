using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Switchboard.Api.Models;

public class WaMessage
{
    [Key]
    public int Id { get; set; }
    
    public string RemoteJid { get; set; } = string.Empty;
    public string PushName { get; set; } = string.Empty;
    public string MessageText { get; set; } = string.Empty;
    public string MessageId { get; set; } = string.Empty;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

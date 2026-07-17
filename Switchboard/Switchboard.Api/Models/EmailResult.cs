using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Switchboard.Api.Models;

public class EmailResult
{
    [Key]
    public int Id { get; set; }
    
    public string MessageId { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Sender { get; set; } = string.Empty;
    
    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
    public string DownloadedAttachments { get; set; } = string.Empty;
}

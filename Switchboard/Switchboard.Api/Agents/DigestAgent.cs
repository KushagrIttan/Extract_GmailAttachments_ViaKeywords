using Microsoft.Extensions.AI;
using Switchboard.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Switchboard.Api.Agents;

public class DigestAgent
{
    private readonly IChatClient _chatClient;
    private readonly SwitchboardDbContext _db;

    public DigestAgent(IChatClient chatClient, SwitchboardDbContext db)
    {
        _chatClient = chatClient;
        _db = db;
    }

    public async Task<string> GenerateDigestAsync()
    {
        var pendingEscalations = await _db.Escalations.Where(e => e.Status == "Pending").ToListAsync();
        if (!pendingEscalations.Any()) return "No pending escalations today.";

        var prompt = $"Summarize the following {pendingEscalations.Count} pending escalations:\n";
        foreach(var e in pendingEscalations) prompt += $"- {e.MessagePreview}\n";
        
        var response = await _chatClient.GetResponseAsync(
            new List<ChatMessage> { new ChatMessage(ChatRole.System, "You are a Digest Agent. Keep it brief."), new ChatMessage(ChatRole.User, prompt) });
            
        return response.Text ?? "Failed to generate digest.";
    }
}

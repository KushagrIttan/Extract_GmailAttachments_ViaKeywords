using Microsoft.Extensions.AI;
using Switchboard.Api.Data;
using Switchboard.Api.Models;

namespace Switchboard.Api.Agents;

public class DraftingAgent
{
    private readonly IChatClient _chatClient;
    private readonly SwitchboardDbContext _db;

    public DraftingAgent(IChatClient chatClient, SwitchboardDbContext db)
    {
        _chatClient = chatClient;
        _db = db;
    }

    public async Task<string> DraftReplyAsync(string emailBody)
    {
        var systemPrompt = "You are an Email Drafting Agent. Draft a polite, concise reply acknowledging the following email.";
        
        var response = await _chatClient.GetResponseAsync(
            new List<ChatMessage> { new ChatMessage(ChatRole.System, systemPrompt), new ChatMessage(ChatRole.User, emailBody) });
            
        return response.Text ?? "Thank you for reaching out. We will get back to you soon.";
    }
}

using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Data;
using Switchboard.Api.Models;

namespace Switchboard.Api.Endpoints;

public static class ConfigEndpoints
{
    public static void MapConfigEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/config");

        group.MapGet("/", async (SwitchboardDbContext db) =>
        {
            var config = await db.Configs.ToDictionaryAsync(c => c.Key, c => c.Value);
            return Results.Ok(config);
        });

        group.MapPost("/", async (Dictionary<string, string> input, SwitchboardDbContext db) =>
        {
            foreach (var kvp in input)
            {
                var existing = await db.Configs.FirstOrDefaultAsync(c => c.Key == kvp.Key);
                if (existing != null)
                {
                    existing.Value = kvp.Value;
                    existing.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    db.Configs.Add(new Config { Key = kvp.Key, Value = kvp.Value });
                }
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        });
    }
}

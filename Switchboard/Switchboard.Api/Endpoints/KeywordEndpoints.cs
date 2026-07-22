using Microsoft.EntityFrameworkCore;
using Switchboard.Api.Data;
using Switchboard.Api.Models;

namespace Switchboard.Api.Endpoints;

public static class KeywordEndpoints
{
    public static void MapKeywordEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/keywords");

        group.MapGet("/", async (SwitchboardDbContext db) =>
        {
            var keywords = await db.KeywordRules.OrderByDescending(k => k.CreatedAt).ToListAsync();
            return Results.Ok(keywords);
        });

        group.MapPost("/", async (KeywordRule input, SwitchboardDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Keyword))
                return Results.BadRequest(new { error = "Keyword required" });

            var keyword = input.Keyword.Trim();

            if (keyword.Length > 100)
                return Results.BadRequest(new { error = "Keyword must be 100 characters or fewer" });

            if (!System.Text.RegularExpressions.Regex.IsMatch(keyword, @"^[a-zA-Z0-9\s\-\.,@#\$%&*]+$"))
                return Results.BadRequest(new { error = "Keyword contains invalid characters" });

            var existing = await db.KeywordRules.FirstOrDefaultAsync(k => k.Keyword == keyword);
            if (existing != null)
                return Results.Ok(new { message = "Already exists" });

            var newKeyword = new KeywordRule { Keyword = keyword };
            db.KeywordRules.Add(newKeyword);
            await db.SaveChangesAsync();

            return Results.Ok(newKeyword);
        });

        group.MapDelete("/{id}", async (int id, SwitchboardDbContext db) =>
        {
            var keyword = await db.KeywordRules.FindAsync(id);
            if (keyword != null)
            {
                db.KeywordRules.Remove(keyword);
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { success = true });
        });
    }
}

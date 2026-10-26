using Backend.Controllers;
using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Tests;

public class UsersControllerTests
{
    private const string Password = "original-password";
    private static readonly Guid CurrentSession = Guid.NewGuid();
    private static readonly Guid OtherSession = Guid.NewGuid();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("wrong-password")]
    public async Task PasswordChange_IsRefusedWithoutTheCurrentPassword(string? currentPassword)
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.UpdateCurrentUser(new UpdateUserDto { Password = "attacker-chosen", CurrentPassword = currentPassword });

        Assert.IsType<BadRequestObjectResult>(result.Result);
        var user = await context.Users.AsNoTracking().SingleAsync(u => u.Id == 1);
        Assert.True(BCrypt.Net.BCrypt.Verify(Password, user.PasswordHash));
        Assert.Equal(2, await ActiveSessionCountAsync(context));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("wrong-password")]
    public async Task EmailChange_IsRefusedWithoutTheCurrentPassword(string? currentPassword)
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.UpdateCurrentUser(new UpdateUserDto { Email = "attacker@example.com", CurrentPassword = currentPassword });

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("alice@example.com", (await context.Users.AsNoTracking().SingleAsync(u => u.Id == 1)).Email);
    }

    [Fact]
    public async Task PasswordChange_WithTheCurrentPassword_SignsOutOtherDevicesOnly()
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.UpdateCurrentUser(new UpdateUserDto { Password = "brand-new-password", CurrentPassword = Password });

        Assert.IsType<OkObjectResult>(result.Result);
        var user = await context.Users.AsNoTracking().SingleAsync(u => u.Id == 1);
        Assert.True(BCrypt.Net.BCrypt.Verify("brand-new-password", user.PasswordHash));
        var sessions = await context.RefreshSessions.AsNoTracking().ToListAsync();
        Assert.Null(sessions.Single(s => s.Id == CurrentSession).RevokedAt);
        Assert.NotNull(sessions.Single(s => s.Id == OtherSession).RevokedAt);
    }

    [Fact]
    public async Task EmailChange_WithTheCurrentPassword_IsAllowed()
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.UpdateCurrentUser(new UpdateUserDto { Email = "alice@new.example.com", CurrentPassword = Password });

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("alice@new.example.com", (await context.Users.AsNoTracking().SingleAsync(u => u.Id == 1)).Email);
        Assert.Equal(2, await ActiveSessionCountAsync(context));
    }

    [Fact]
    public async Task EmailChange_RefusesAnEmailAnotherAccountUses_InAnyCase()
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.UpdateCurrentUser(new UpdateUserDto { Email = "BOB@Example.com", CurrentPassword = Password });

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task NameChange_NeedsNoPassword()
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.UpdateCurrentUser(new UpdateUserDto { FullName = "Alice A." });

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("Alice A.", (await context.Users.AsNoTracking().SingleAsync(u => u.Id == 1)).FullName);
    }

    [Fact]
    public async Task ResendingTheUnchangedEmail_NeedsNoPassword()
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.UpdateCurrentUser(new UpdateUserDto { Email = "alice@example.com", FullName = "Alice" });

        Assert.IsType<OkObjectResult>(result.Result);
    }

    private static Task<int> ActiveSessionCountAsync(AppDbContext context)
    {
        return context.RefreshSessions.CountAsync(s => s.UserId == 1 && s.RevokedAt == null);
    }

    private static UsersController CreateController(AppDbContext context)
    {
        return new UsersController(context)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim(ClaimTypes.NameIdentifier, "1"),
                        new Claim(ClaimTypes.Sid, CurrentSession.ToString()),
                    }, "test"))
                }
            }
        };
    }

    private static async Task<AppDbContext> CreateContextAsync()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"flashpad-users-tests-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={dbPath}")
            .Options;

        var context = new AppDbContext(options);
        await context.Database.EnsureCreatedAsync();
        context.Users.Add(new User { Id = 1, Username = "alice", Email = "alice@example.com", PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password), CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
        context.Users.Add(new User { Id = 2, Username = "bob", Email = "bob@example.com", PasswordHash = "x", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
        foreach (var id in new[] { CurrentSession, OtherSession })
        {
            context.RefreshSessions.Add(new RefreshSession { Id = id, UserId = 1, TokenHash = id.ToString("N"), CreatedAt = DateTime.UtcNow, ExpiresAt = DateTime.UtcNow.AddDays(1) });
        }
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        return context;
    }
}

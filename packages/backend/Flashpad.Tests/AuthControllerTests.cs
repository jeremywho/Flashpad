using Backend.Controllers;
using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Backend.Tests;

public class AuthControllerTests
{
    private const string Password = "correct horse battery";

    [Theory]
    [InlineData("betatest")]
    [InlineData("BetaTest")]
    [InlineData("jeremy+betatest@weebu.com")]
    [InlineData("Jeremy+BetaTest@Weebu.com")]
    [InlineData("  jeremy+betatest@weebu.com ")]
    public async Task Login_AcceptsUsernameOrEmail(string loginName)
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.Login(new LoginDto { Username = loginName, Password = Password });

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<AuthResponseDto>(ok.Value);
        Assert.Equal("betatest", response.User.Username);
    }

    [Fact]
    public async Task Login_PrefersTheUsernameWhenItEqualsAnotherAccountsEmail()
    {
        await using var context = await CreateContextAsync();
        context.Users.Add(new User
        {
            Username = "jeremy+betatest@weebu.com",
            Email = "other@example.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();
        var controller = CreateController(context);

        var result = await controller.Login(new LoginDto { Username = "jeremy+betatest@weebu.com", Password = Password });

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("other@example.com", Assert.IsType<AuthResponseDto>(ok.Value).User.Email);
    }

    [Theory]
    [InlineData("betatest", "wrong password")]
    [InlineData("jeremy+betatest@weebu.com", "wrong password")]
    [InlineData("nobody@weebu.com", Password)]
    public async Task Login_RejectsBadCredentials(string loginName, string password)
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context);

        var result = await controller.Login(new LoginDto { Username = loginName, Password = password });

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
    }

    private static AuthController CreateController(AppDbContext context)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JwtSettings:SecretKey"] = "test-secret-key-that-is-long-enough-for-hmac-sha256",
                ["JwtSettings:Issuer"] = "FlashpadAPI",
                ["JwtSettings:Audience"] = "FlashpadClients"
            })
            .Build();
        return new AuthController(context, new AuthService(configuration));
    }

    private static async Task<AppDbContext> CreateContextAsync()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"flashpad-auth-tests-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={dbPath}")
            .Options;

        var context = new AppDbContext(options);
        await context.Database.EnsureCreatedAsync();

        context.Users.Add(new User
        {
            Username = "betatest",
            Email = "jeremy+betatest@weebu.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();
        return context;
    }
}

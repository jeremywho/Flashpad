using System.Security.Claims;
using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BCrypt.Net;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IAuthService _authService;
    private const int RefreshTokenLifetimeDays = 30;

    public AuthController(AppDbContext context, IAuthService authService)
    {
        _context = context;
        _authService = authService;
    }

    private static UserResponseDto MapUser(User user)
    {
        return new UserResponseDto
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            FullName = user.FullName,
            CreatedAt = user.CreatedAt,
            UpdatedAt = user.UpdatedAt
        };
    }

    private async Task<AuthResponseDto> CreateAuthResponseAsync(User user)
    {
        var refreshToken = _authService.GenerateRefreshToken();
        var refreshSession = new RefreshSession
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = _authService.HashRefreshToken(refreshToken),
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenLifetimeDays)
        };

        _context.RefreshSessions.Add(refreshSession);
        await _context.SaveChangesAsync();

        return new AuthResponseDto
        {
            AccessToken = _authService.GenerateAccessToken(user, refreshSession.Id),
            RefreshToken = refreshToken,
            User = MapUser(user)
        };
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponseDto>> Register(RegisterDto dto)
    {
        var usernameNormalized = dto.Username.ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.Username == usernameNormalized))
        {
            return BadRequest(new { message = "Username already exists" });
        }

        if (await _context.Users.AnyAsync(u => u.Email.ToLower() == dto.Email.ToLower()))
        {
            return BadRequest(new { message = "Email already exists" });
        }

        var user = new User
        {
            Username = usernameNormalized,
            Email = dto.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            FullName = dto.FullName,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return Ok(await CreateAuthResponseAsync(user));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponseDto>> Login(LoginDto dto)
    {
        var usernameNormalized = dto.Username.ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == usernameNormalized);

        if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
        {
            return Unauthorized(new { message = "Invalid username or password" });
        }

        return Ok(await CreateAuthResponseAsync(user));
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponseDto>> Refresh([FromBody] RefreshTokenRequestDto dto)
    {
        var refreshTokenHash = _authService.HashRefreshToken(dto.RefreshToken);
        var existingSession = await _context.RefreshSessions
            .Include(session => session.User)
            .FirstOrDefaultAsync(session => session.TokenHash == refreshTokenHash);

        if (existingSession == null || existingSession.RevokedAt != null || existingSession.ExpiresAt <= DateTime.UtcNow)
        {
            return Unauthorized(new { message = "Invalid refresh token" });
        }

        var replacementRefreshToken = _authService.GenerateRefreshToken();
        var replacementSession = new RefreshSession
        {
            Id = Guid.NewGuid(),
            UserId = existingSession.UserId,
            TokenHash = _authService.HashRefreshToken(replacementRefreshToken),
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenLifetimeDays)
        };

        existingSession.RevokedAt = DateTime.UtcNow;
        existingSession.ReplacedBySessionId = replacementSession.Id;

        _context.RefreshSessions.Add(replacementSession);
        await _context.SaveChangesAsync();

        return Ok(new AuthResponseDto
        {
            AccessToken = _authService.GenerateAccessToken(existingSession.User, replacementSession.Id),
            RefreshToken = replacementRefreshToken,
            User = MapUser(existingSession.User)
        });
    }

    [HttpPost("logout")]
    public async Task<ActionResult> Logout([FromBody] RefreshTokenRequestDto dto)
    {
        var refreshTokenHash = _authService.HashRefreshToken(dto.RefreshToken);
        var existingSession = await _context.RefreshSessions
            .FirstOrDefaultAsync(session => session.TokenHash == refreshTokenHash);

        if (existingSession != null && existingSession.RevokedAt == null)
        {
            existingSession.RevokedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        return NoContent();
    }
}

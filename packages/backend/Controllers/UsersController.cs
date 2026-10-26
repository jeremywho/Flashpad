using Backend.Data;
using Backend.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _context;

    public UsersController(AppDbContext context)
    {
        _context = context;
    }

    private Guid? GetCurrentSessionId()
    {
        var sid = User.FindFirst("sid")?.Value ?? User.FindFirst(ClaimTypes.Sid)?.Value;
        return Guid.TryParse(sid, out var id) ? id : null;
    }

    private int GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim))
        {
            throw new UnauthorizedAccessException("User ID not found in token");
        }
        return int.Parse(userIdClaim);
    }

    [HttpGet("me")]
    public async Task<ActionResult<UserResponseDto>> GetCurrentUser()
    {
        var userId = GetCurrentUserId();
        var user = await _context.Users.FindAsync(userId);

        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        return Ok(new UserResponseDto
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            FullName = user.FullName,
            CreatedAt = user.CreatedAt,
            UpdatedAt = user.UpdatedAt
        });
    }

    [HttpPut("me")]
    public async Task<ActionResult<UserResponseDto>> UpdateCurrentUser(UpdateUserDto dto)
    {
        var userId = GetCurrentUserId();
        var user = await _context.Users.FindAsync(userId);

        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        var changingEmail = !string.IsNullOrEmpty(dto.Email) && dto.Email != user.Email;
        var changingPassword = !string.IsNullOrEmpty(dto.Password);

        // The email is a sign-in name and the password is the sign-in secret, so a
        // signed-in session alone is not enough to change either.
        if ((changingEmail || changingPassword)
            && (string.IsNullOrEmpty(dto.CurrentPassword) || !BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash)))
        {
            return BadRequest(new { message = "Current password is incorrect" });
        }

        if (changingEmail)
        {
            var emailNormalized = dto.Email!.ToLower();
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == emailNormalized && u.Id != userId))
            {
                return BadRequest(new { message = "Email already in use" });
            }
            user.Email = dto.Email;
        }

        if (!string.IsNullOrEmpty(dto.FullName))
        {
            user.FullName = dto.FullName;
        }

        if (changingPassword)
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);
            var currentSessionId = GetCurrentSessionId();
            var now = DateTime.UtcNow;
            await _context.RefreshSessions
                .Where(s => s.UserId == userId && s.RevokedAt == null && s.Id != currentSessionId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now));
        }

        user.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new UserResponseDto
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            FullName = user.FullName,
            CreatedAt = user.CreatedAt,
            UpdatedAt = user.UpdatedAt
        });
    }
}

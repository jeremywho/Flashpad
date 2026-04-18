using Backend.Models;

namespace Backend.Services;

public interface IAuthService
{
    string GenerateAccessToken(User user, Guid sessionId);
    string GenerateRefreshToken();
    string HashRefreshToken(string refreshToken);
    int? ValidateJwtToken(string token);
}

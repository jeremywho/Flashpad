using Backend.Models;

namespace Backend.Services;

public interface IAuthService
{
    string GenerateJwtToken(User user);
    int? ValidateJwtToken(string token);
}

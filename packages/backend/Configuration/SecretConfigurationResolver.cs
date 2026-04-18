using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Backend.Configuration;

public sealed record SecretConfigurationValues(string JwtSecretKey, string H4ApiKey);

public static class SecretConfigurationResolver
{
    public static SecretConfigurationValues Resolve(IConfiguration configuration, IHostEnvironment environment)
    {
        var jwtSecretKey = ResolveJwtSecretKey(configuration, environment);
        var h4ApiKey = ResolveH4ApiKey(configuration, environment);

        return new SecretConfigurationValues(jwtSecretKey, h4ApiKey);
    }

    public static IReadOnlyDictionary<string, string?> ToConfigurationOverrides(SecretConfigurationValues values)
    {
        return new Dictionary<string, string?>
        {
            ["JwtSettings:SecretKey"] = values.JwtSecretKey,
            ["H4:ApiKey"] = values.H4ApiKey
        };
    }

    private static string ResolveJwtSecretKey(IConfiguration configuration, IHostEnvironment environment)
    {
        var externalSecret = ReadExternalSecret("JwtSettings__SecretKey");

        if (environment.IsProduction())
        {
            return externalSecret ?? throw new InvalidOperationException(
                "Production startup requires JwtSettings__SecretKey to be supplied via environment variables or deployment-managed secrets.");
        }

        return externalSecret
            ?? configuration["JwtSettings:SecretKey"]
            ?? throw new InvalidOperationException(
                "JWT SecretKey not configured. Set JwtSettings__SecretKey for local development or deployment.");
    }

    private static string ResolveH4ApiKey(IConfiguration configuration, IHostEnvironment environment)
    {
        var externalSecret = ReadExternalSecret("H4__ApiKey");

        if (environment.IsProduction())
        {
            return externalSecret ?? throw new InvalidOperationException(
                "Production startup requires H4__ApiKey to be supplied via environment variables or deployment-managed secrets.");
        }

        return externalSecret ?? configuration["H4:ApiKey"] ?? string.Empty;
    }

    private static string? ReadExternalSecret(string variableName)
    {
        var value = Environment.GetEnvironmentVariable(variableName);
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}

using Backend.Configuration;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Backend.Tests;

public class SecretConfigurationResolverTests
{
    [Fact]
    public void Resolve_UsesExternalSecretsInProduction()
    {
        using var environmentVariables = new EnvironmentVariableScope(new Dictionary<string, string?>
        {
            ["JwtSettings__SecretKey"] = "env-jwt-secret",
            ["H4__ApiKey"] = "env-h4-api-key"
        });

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JwtSettings:SecretKey"] = "json-jwt-secret",
                ["H4:ApiKey"] = "json-h4-api-key"
            })
            .Build();

        var environment = new TestHostEnvironment { EnvironmentName = Environments.Production };

        var values = SecretConfigurationResolver.Resolve(configuration, environment);

        Assert.Equal("env-jwt-secret", values.JwtSecretKey);
        Assert.Equal("env-h4-api-key", values.H4ApiKey);
    }

    [Fact]
    public void Resolve_IgnoresJsonSecretsWhenProductionJwtSecretMissing()
    {
        using var environmentVariables = new EnvironmentVariableScope(new Dictionary<string, string?>
        {
            ["JwtSettings__SecretKey"] = null,
            ["H4__ApiKey"] = "env-h4-api-key"
        });

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JwtSettings:SecretKey"] = "json-jwt-secret",
                ["H4:ApiKey"] = "json-h4-api-key"
            })
            .Build();

        var environment = new TestHostEnvironment { EnvironmentName = Environments.Production };

        var exception = Assert.Throws<InvalidOperationException>(() =>
            SecretConfigurationResolver.Resolve(configuration, environment));

        Assert.Contains("JwtSettings__SecretKey", exception.Message);
    }

    [Fact]
    public void Resolve_AllowsDevelopmentConfigFallback()
    {
        using var environmentVariables = new EnvironmentVariableScope(new Dictionary<string, string?>
        {
            ["JwtSettings__SecretKey"] = null,
            ["H4__ApiKey"] = null
        });

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JwtSettings:SecretKey"] = "json-jwt-secret",
                ["H4:ApiKey"] = "json-h4-api-key"
            })
            .Build();

        var environment = new TestHostEnvironment { EnvironmentName = Environments.Development };

        var values = SecretConfigurationResolver.Resolve(configuration, environment);

        Assert.Equal("json-jwt-secret", values.JwtSecretKey);
        Assert.Equal("json-h4-api-key", values.H4ApiKey);
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Flashpad.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }

    private sealed class EnvironmentVariableScope : IDisposable
    {
        private readonly Dictionary<string, string?> _originalValues = new();

        public EnvironmentVariableScope(IReadOnlyDictionary<string, string?> values)
        {
            foreach (var (key, value) in values)
            {
                _originalValues[key] = Environment.GetEnvironmentVariable(key);
                Environment.SetEnvironmentVariable(key, value);
            }
        }

        public void Dispose()
        {
            foreach (var (key, value) in _originalValues)
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }
}

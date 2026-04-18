using Backend.Controllers;
using Backend.DTOs;
using Backend.Observability;
using H4.Sdk;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Backend.Tests;

public class ClientLogsControllerTests
{
    [Fact]
    public void IngestLogs_RejectsOversizedPayloads()
    {
        var controller = CreateController();
        controller.ControllerContext.HttpContext.Request.ContentLength = ClientLogSanitizer.MaxRequestBytes + 1L;

        var result = controller.IngestLogs(new ClientLogBatchDto
        {
            Logs = new List<ClientLogEntryDto>
            {
                new()
                {
                    Level = "Info",
                    Message = "payload",
                    Source = "web"
                }
            }
        });

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, status.StatusCode);
    }

    [Fact]
    public void IngestLogs_UsesServerStampedIdentityAndSanitizesMetadata()
    {
        var logger = new RecordingH4Logger();
        var controller = CreateController(logger);

        var result = controller.IngestLogs(new ClientLogBatchDto
        {
            Logs = new List<ClientLogEntryDto>
            {
                new()
                {
                    Level = "Warning",
                    Message = "client warning",
                    Source = "mobile",
                    DeviceId = "client-device-7",
                    Timestamp = "2026-04-12T19:30:00Z",
                    Metadata = new Dictionary<string, object?>
                    {
                        ["safe"] = "value",
                        ["count"] = 3,
                        ["userId"] = "client-user",
                        ["authorization"] = "Bearer secret"
                    }
                }
            }
        });

        Assert.IsType<AcceptedResult>(result);
        var entry = Assert.Single(logger.Entries);
        Assert.Equal("Warning", entry.Level);
        Assert.Equal("[mobile] client warning", entry.Message);

        var metadata = Assert.IsType<Dictionary<string, object?>>(entry.Metadata);
        Assert.Equal("42", metadata["serverUserId"]);
        Assert.Equal("req-123", metadata["serverRequestId"]);
        Assert.Equal("mobile", metadata["clientSource"]);
        Assert.Equal("client-device-7", metadata["clientDeviceId"]);

        var clientMetadata = Assert.IsType<Dictionary<string, object?>>(metadata["clientMetadata"]);
        Assert.Equal("value", clientMetadata["safe"]);
        Assert.Equal(3, clientMetadata["count"]);
        Assert.False(clientMetadata.ContainsKey("userId"));
        Assert.False(clientMetadata.ContainsKey("authorization"));
    }

    [Fact]
    public void IngestLogs_RejectsInvalidMetadataValues()
    {
        var controller = CreateController();

        var result = controller.IngestLogs(new ClientLogBatchDto
        {
            Logs = new List<ClientLogEntryDto>
            {
                new()
                {
                    Level = "Info",
                    Message = "bad metadata",
                    Source = "web",
                    Metadata = new Dictionary<string, object?>
                    {
                        ["nested"] = new { foo = "bar" }
                    }
                }
            }
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("Unsupported metadata value type", GetErrorMessage(badRequest.Value));
    }

    private static ClientLogsController CreateController(RecordingH4Logger? logger = null)
    {
        var controller = new ClientLogsController(logger ?? new RecordingH4Logger());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                TraceIdentifier = "req-123",
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, "42")
                }, "test"))
            }
        };

        return controller;
    }

    private sealed class RecordingH4Logger : IH4Logger
    {
        public List<(string Level, string Message, object? Metadata)> Entries { get; } = new();

        public void Debug(string message, object? metadata = null) => Entries.Add(("Debug", message, metadata));
        public void Info(string message, object? metadata = null) => Entries.Add(("Info", message, metadata));
        public void Warning(string message, object? metadata = null) => Entries.Add(("Warning", message, metadata));
        public void Error(string message, object? metadata = null) => Entries.Add(("Error", message, metadata));
        public void Fatal(string message, object? metadata = null) => Entries.Add(("Fatal", message, metadata));
        public H4Trace StartTrace(string name) => throw new NotSupportedException();
        public Task FlushAsync() => Task.CompletedTask;
    }

    private static string GetErrorMessage(object? value)
    {
        if (value is null)
        {
            return string.Empty;
        }

        var property = value.GetType().GetProperty("message");
        return property?.GetValue(value)?.ToString() ?? string.Empty;
    }
}

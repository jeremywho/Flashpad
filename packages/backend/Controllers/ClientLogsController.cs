using H4.Sdk;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

public class ClientLogEntry
{
    public string Level { get; set; } = "Info";
    public string Message { get; set; } = "";
    public string Source { get; set; } = "unknown";
    public string DeviceId { get; set; } = "unknown";
    public string Timestamp { get; set; } = "";
    public Dictionary<string, object>? Metadata { get; set; }
}

public class ClientLogBatchDto
{
    public List<ClientLogEntry> Logs { get; set; } = new();
}

[ApiController]
[Route("api/client-logs")]
[Authorize]
public class ClientLogsController : ControllerBase
{
    private readonly IH4Logger _h4;

    public ClientLogsController(IH4Logger h4)
    {
        _h4 = h4;
    }

    [HttpPost]
    public IActionResult IngestLogs([FromBody] ClientLogBatchDto batch)
    {
        if (batch.Logs.Count == 0)
            return BadRequest(new { message = "No logs provided" });

        if (batch.Logs.Count > 100)
            return BadRequest(new { message = "Too many logs in batch (max 100)" });

        foreach (var entry in batch.Logs)
        {
            var metadata = entry.Metadata ?? new Dictionary<string, object>();
            metadata["clientSource"] = entry.Source;
            metadata["deviceId"] = entry.DeviceId;
            if (!string.IsNullOrEmpty(entry.Timestamp))
                metadata["clientTimestamp"] = entry.Timestamp;

            var message = $"[{entry.Source}] {entry.Message}";

            switch (entry.Level.ToLower())
            {
                case "debug":
                    _h4.Debug(message, metadata);
                    break;
                case "info":
                    _h4.Info(message, metadata);
                    break;
                case "warning":
                    _h4.Warning(message, metadata);
                    break;
                case "error":
                    _h4.Error(message, metadata);
                    break;
                case "fatal":
                    _h4.Fatal(message, metadata);
                    break;
                default:
                    _h4.Info(message, metadata);
                    break;
            }
        }

        return Accepted();
    }
}

using Backend.DTOs;
using Backend.Observability;
using H4.Sdk;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

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
    [RequestSizeLimit(ClientLogSanitizer.MaxRequestBytes)]
    public IActionResult IngestLogs([FromBody] ClientLogBatchDto batch)
    {
        if (Request.ContentLength is > ClientLogSanitizer.MaxRequestBytes)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge, new { message = $"Client log payload too large (max {ClientLogSanitizer.MaxRequestBytes} bytes)" });
        }

        if (batch is null || batch.Logs is null || batch.Logs.Count == 0)
        {
            return BadRequest(new { message = "No logs provided" });
        }

        if (!ClientLogSanitizer.TryNormalizeBatch(batch, User, HttpContext, out var logs, out var error))
        {
            return BadRequest(new { message = error });
        }

        foreach (var entry in logs)
        {
            switch (entry.Level.ToLowerInvariant())
            {
                case "debug":
                    _h4.Debug(entry.Message, entry.Metadata);
                    break;
                case "info":
                    _h4.Info(entry.Message, entry.Metadata);
                    break;
                case "warning":
                    _h4.Warning(entry.Message, entry.Metadata);
                    break;
                case "error":
                    _h4.Error(entry.Message, entry.Metadata);
                    break;
                case "fatal":
                    _h4.Fatal(entry.Message, entry.Metadata);
                    break;
            }
        }

        return Accepted();
    }
}

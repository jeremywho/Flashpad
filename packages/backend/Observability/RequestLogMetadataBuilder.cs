using System.Security.Claims;

namespace Backend.Observability;

public static class RequestLogMetadataBuilder
{
    public static Dictionary<string, object> Build(HttpContext context, long durationMs, int statusCode, Exception? error)
    {
        var metadata = new Dictionary<string, object>
        {
            ["method"] = context.Request.Method,
            ["path"] = context.Request.Path.Value ?? string.Empty,
            ["statusCode"] = statusCode,
            ["durationMs"] = durationMs
        };

        var userId = context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrWhiteSpace(userId))
        {
            metadata["userId"] = userId;
        }

        if (context.Request.Query.Count > 0)
        {
            metadata["queryParameterCount"] = context.Request.Query.Count;
            metadata["hasSensitiveQueryParameters"] = context.Request.Query.Keys.Any(key =>
                string.Equals(key, "access_token", StringComparison.OrdinalIgnoreCase));
        }

        if (context.Request.Path.StartsWithSegments("/hubs"))
        {
            metadata["requestType"] = "hub";
        }

        if (error != null)
        {
            metadata["error"] = error.Message;
        }

        return metadata;
    }
}

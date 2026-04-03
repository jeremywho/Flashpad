using System.Diagnostics;
using System.Security.Claims;
using H4.Sdk;

namespace Backend.Middleware;

public class H4RequestLoggingMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IH4Logger h4)
    {
        var path = context.Request.Path.Value ?? "";

        // Pass through non-API routes without logging
        if (!path.StartsWith("/api/") && !path.StartsWith("/hubs/"))
        {
            await next(context);
            return;
        }

        // Skip SignalR negotiation noise
        if (path.Contains("/negotiate"))
        {
            await next(context);
            return;
        }

        var sw = Stopwatch.StartNew();
        Exception? error = null;

        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            error = ex;
            throw;
        }
        finally
        {
            sw.Stop();

            var userId = context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var method = context.Request.Method;
            var statusCode = error != null ? 500 : context.Response.StatusCode;

            var metadata = new Dictionary<string, object>
            {
                ["method"] = method,
                ["path"] = path,
                ["statusCode"] = statusCode,
                ["durationMs"] = sw.ElapsedMilliseconds,
            };

            if (userId != null)
                metadata["userId"] = userId;

            var query = context.Request.QueryString.Value;
            if (!string.IsNullOrEmpty(query))
                metadata["query"] = query;

            if (error != null)
                metadata["error"] = error.Message;

            var msg = $"{method} {path} → {statusCode} ({sw.ElapsedMilliseconds}ms)";

            if (statusCode >= 500)
                h4.Error(msg, metadata);
            else if (statusCode >= 400)
                h4.Warning(msg, metadata);
            else
                h4.Info(msg, metadata);
        }
    }
}

using System.Diagnostics;
using Backend.Observability;
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

            var method = context.Request.Method;
            var statusCode = error != null ? 500 : context.Response.StatusCode;
            var metadata = RequestLogMetadataBuilder.Build(context, sw.ElapsedMilliseconds, statusCode, error);

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

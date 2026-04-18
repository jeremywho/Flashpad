using Backend.DTOs;
using System.Globalization;
using System.Security.Claims;
using System.Text.Json;

namespace Backend.Observability;

public sealed record SanitizedClientLog(string Level, string Message, IReadOnlyDictionary<string, object?> Metadata);

public static class ClientLogSanitizer
{
    public const int MaxRequestBytes = 256 * 1024;
    public const int MaxBatchSize = 100;
    public const int MaxMetadataEntries = 20;
    public const int MaxMetadataKeyLength = 64;
    public const int MaxMetadataValueLength = 256;

    private static readonly HashSet<string> AllowedLevels = new(StringComparer.OrdinalIgnoreCase)
    {
        "debug",
        "info",
        "warning",
        "error",
        "fatal"
    };

    private static readonly string[] DisallowedMetadataKeys =
    {
        "authorization",
        "bearer",
        "deviceId",
        "password",
        "refreshToken",
        "secret",
        "token",
        "userId"
    };

    public static bool TryNormalizeBatch(
        ClientLogBatchDto batch,
        ClaimsPrincipal user,
        HttpContext context,
        out List<SanitizedClientLog> logs,
        out string error)
    {
        logs = new List<SanitizedClientLog>();
        error = string.Empty;

        if (batch.Logs.Count > MaxBatchSize)
        {
            error = $"Too many logs in batch (max {MaxBatchSize})";
            return false;
        }

        var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var serverIngestedAtUtc = DateTime.UtcNow;
        var serverRequestId = context.TraceIdentifier;

        foreach (var entry in batch.Logs)
        {
            if (!TryNormalizeLevel(entry.Level, out var level))
            {
                error = "Invalid log level";
                return false;
            }

            if (!TryNormalizeRequiredString(entry.Message, 4096, "message", out var message, out error))
            {
                return false;
            }

            if (!TryNormalizeRequiredString(entry.Source, 64, "source", out var source, out error))
            {
                return false;
            }

            if (!TryNormalizeOptionalString(entry.DeviceId, 100, "deviceId", out var deviceId, out error))
            {
                return false;
            }

            if (!TryNormalizeOptionalTimestamp(entry.Timestamp, out var clientTimestampUtc, out error))
            {
                return false;
            }

            var metadata = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["serverIngestedAtUtc"] = serverIngestedAtUtc,
                ["serverRequestId"] = serverRequestId,
                ["clientSource"] = source
            };

            if (!string.IsNullOrWhiteSpace(userId))
            {
                metadata["serverUserId"] = userId;
            }

            if (!string.IsNullOrWhiteSpace(deviceId))
            {
                metadata["clientDeviceId"] = deviceId;
            }

            if (clientTimestampUtc.HasValue)
            {
                metadata["clientTimestampUtc"] = clientTimestampUtc.Value;
            }

            if (entry.Metadata is not null && entry.Metadata.Count > 0)
            {
                if (entry.Metadata.Count > MaxMetadataEntries)
                {
                    error = $"Too many metadata entries (max {MaxMetadataEntries})";
                    return false;
                }

                var sanitizedMetadata = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                foreach (var (key, value) in entry.Metadata)
                {
                    if (!TryNormalizeMetadataKey(key, out var normalizedKey, out error))
                    {
                        return false;
                    }

                    if (IsDisallowedMetadataKey(normalizedKey))
                    {
                        continue;
                    }

                    if (!TryNormalizeMetadataValue(value, out var normalizedValue, out error))
                    {
                        return false;
                    }

                    sanitizedMetadata[normalizedKey] = normalizedValue;
                }

                if (sanitizedMetadata.Count > 0)
                {
                    metadata["clientMetadata"] = sanitizedMetadata;
                }
            }

            logs.Add(new SanitizedClientLog(
                level,
                $"[{source}] {message}",
                metadata));
        }

        return true;
    }

    private static bool TryNormalizeLevel(string? level, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(level))
        {
            return false;
        }

        var trimmed = level.Trim();
        if (!AllowedLevels.Contains(trimmed))
        {
            return false;
        }

        normalized = trimmed;
        return true;
    }

    private static bool TryNormalizeRequiredString(string? value, int maxLength, string fieldName, out string normalized, out string error)
    {
        normalized = string.Empty;
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(value))
        {
            error = $"Missing {fieldName}";
            return false;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            error = $"{fieldName} exceeds {maxLength} characters";
            return false;
        }

        normalized = trimmed;
        return true;
    }

    private static bool TryNormalizeOptionalString(string? value, int maxLength, string fieldName, out string? normalized, out string error)
    {
        normalized = null;
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            error = $"{fieldName} exceeds {maxLength} characters";
            return false;
        }

        normalized = trimmed;
        return true;
    }

    private static bool TryNormalizeOptionalTimestamp(string? timestamp, out DateTimeOffset? normalized, out string error)
    {
        normalized = null;
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(timestamp))
        {
            return true;
        }

        if (!DateTimeOffset.TryParse(
                timestamp,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            error = "Timestamp must be an ISO 8601 value";
            return false;
        }

        normalized = parsed;
        return true;
    }

    private static bool TryNormalizeMetadataKey(string key, out string normalized, out string error)
    {
        normalized = string.Empty;
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(key))
        {
            error = "Metadata keys cannot be empty";
            return false;
        }

        var trimmed = key.Trim();
        if (trimmed.Length > MaxMetadataKeyLength)
        {
            error = $"Metadata key '{trimmed}' exceeds {MaxMetadataKeyLength} characters";
            return false;
        }

        normalized = trimmed;
        return true;
    }

    private static bool TryNormalizeMetadataValue(object? value, out object? normalized, out string error)
    {
        normalized = null;
        error = string.Empty;

        switch (value)
        {
            case null:
                return true;
            case string stringValue:
                if (stringValue.Length > MaxMetadataValueLength)
                {
                    error = $"Metadata string values exceed {MaxMetadataValueLength} characters";
                    return false;
                }

                normalized = stringValue;
                return true;
            case JsonElement element:
                return TryNormalizeJsonElement(element, out normalized, out error);
            case bool or byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal or Guid or DateTime or DateTimeOffset:
                normalized = value;
                return true;
            default:
                error = $"Unsupported metadata value type '{value.GetType().Name}'";
                return false;
        }
    }

    private static bool TryNormalizeJsonElement(JsonElement element, out object? normalized, out string error)
    {
        normalized = null;
        error = string.Empty;

        switch (element.ValueKind)
        {
            case JsonValueKind.String:
                var stringValue = element.GetString();
                if (stringValue != null && stringValue.Length > MaxMetadataValueLength)
                {
                    error = $"Metadata string values exceed {MaxMetadataValueLength} characters";
                    return false;
                }

                normalized = stringValue;
                return true;
            case JsonValueKind.Number:
                if (element.TryGetInt64(out var longValue))
                {
                    normalized = longValue;
                    return true;
                }

                if (element.TryGetDecimal(out var decimalValue))
                {
                    normalized = decimalValue;
                    return true;
                }

                error = "Metadata numbers are not supported";
                return false;
            case JsonValueKind.True:
                normalized = true;
                return true;
            case JsonValueKind.False:
                normalized = false;
                return true;
            case JsonValueKind.Null:
                return true;
            default:
                error = "Metadata values must be scalar";
                return false;
        }
    }

    private static bool IsDisallowedMetadataKey(string key)
    {
        return DisallowedMetadataKeys.Any(disallowed =>
            key.Contains(disallowed, StringComparison.OrdinalIgnoreCase));
    }
}

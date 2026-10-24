using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Backend.Data;

// SQLite stores DateTime as text with no zone, so EF reads every value back as
// DateTimeKind.Unspecified and the API then serializes it without a trailing "Z".
// Every timestamp is written from DateTime.UtcNow, so reads are re-tagged as UTC.
public sealed class UtcDateTimeConverter : ValueConverter<DateTime, DateTime>
{
    public UtcDateTimeConverter()
        : base(
            value => value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : value,
            value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
    {
    }
}

public sealed class NullableUtcDateTimeConverter : ValueConverter<DateTime?, DateTime?>
{
    public NullableUtcDateTimeConverter()
        : base(
            value => value.HasValue && value.Value.Kind == DateTimeKind.Local ? value.Value.ToUniversalTime() : value,
            value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : value)
    {
    }
}

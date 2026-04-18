using System.ComponentModel.DataAnnotations;

namespace Backend.DTOs;

public class ClientLogEntryDto
{
    [Required]
    [StringLength(16)]
    public string Level { get; set; } = "Info";

    [Required]
    [StringLength(4096)]
    public string Message { get; set; } = string.Empty;

    [Required]
    [StringLength(64)]
    public string Source { get; set; } = "unknown";

    [StringLength(100)]
    public string? DeviceId { get; set; }

    [StringLength(64)]
    public string? Timestamp { get; set; }

    public Dictionary<string, object?>? Metadata { get; set; }
}

public class ClientLogBatchDto
{
    [Required]
    [MinLength(1)]
    [MaxLength(100)]
    public List<ClientLogEntryDto> Logs { get; set; } = new();
}

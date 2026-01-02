using System.ComponentModel.DataAnnotations;
using Backend.Models;

namespace Backend.DTOs;

public class CreateNoteDto
{
    [Required]
    public string Content { get; set; } = string.Empty;

    public Guid? CategoryId { get; set; }

    [StringLength(100)]
    public string? DeviceId { get; set; }
}

public class UpdateNoteDto
{
    [Required]
    public string Content { get; set; } = string.Empty;

    public Guid? CategoryId { get; set; }

    [StringLength(100)]
    public string? DeviceId { get; set; }

    public int? BaseVersion { get; set; }
}

public class MoveNoteDto
{
    public Guid? CategoryId { get; set; }
}

public class NoteResponseDto
{
    public Guid Id { get; set; }
    public string Content { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? CategoryColor { get; set; }
    public NoteStatus Status { get; set; }
    public int Version { get; set; }
    public string? DeviceId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class NoteListResponseDto
{
    public List<NoteResponseDto> Notes { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

public class NoteHistoryResponseDto
{
    public Guid Id { get; set; }
    public Guid NoteId { get; set; }
    public string Content { get; set; } = string.Empty;
    public int Version { get; set; }
    public string? DeviceId { get; set; }
    public DateTime CreatedAt { get; set; }
}

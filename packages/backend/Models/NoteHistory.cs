using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

public class NoteHistory
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid NoteId { get; set; }

    [ForeignKey("NoteId")]
    public Note? Note { get; set; }

    [Required]
    public string Content { get; set; } = string.Empty;

    [Required]
    public int Version { get; set; }

    [StringLength(100)]
    public string? DeviceId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

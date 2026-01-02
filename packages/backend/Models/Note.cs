using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

public enum NoteStatus
{
    Inbox = 0,
    Archived = 1,
    Trash = 2
}

public class Note
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    [Required]
    public string Content { get; set; } = string.Empty;

    public Guid? CategoryId { get; set; }

    [ForeignKey("CategoryId")]
    public Category? Category { get; set; }

    [Required]
    public NoteStatus Status { get; set; } = NoteStatus.Inbox;

    [Required]
    public int Version { get; set; } = 1;

    [StringLength(100)]
    public string? DeviceId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public bool IsDeleted { get; set; } = false;

    public DateTime? DeletedAt { get; set; }

    public ICollection<NoteHistory> History { get; set; } = new List<NoteHistory>();
}

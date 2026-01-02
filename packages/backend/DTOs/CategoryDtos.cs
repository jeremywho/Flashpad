using System.ComponentModel.DataAnnotations;

namespace Backend.DTOs;

public class CreateCategoryDto
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(7)]
    public string Color { get; set; } = "#6366F1";

    [StringLength(50)]
    public string? Icon { get; set; }
}

public class UpdateCategoryDto
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(7)]
    public string Color { get; set; } = "#6366F1";

    [StringLength(50)]
    public string? Icon { get; set; }

    public int? SortOrder { get; set; }
}

public class ReorderCategoriesDto
{
    [Required]
    public List<Guid> CategoryIds { get; set; } = new();
}

public class CategoryResponseDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public string? Icon { get; set; }
    public int SortOrder { get; set; }
    public int NoteCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

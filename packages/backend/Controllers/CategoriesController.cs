using Backend.Data;
using Backend.DTOs;
using Backend.Hubs;
using Backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CategoriesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly INotesHubService _hubService;

    public CategoriesController(AppDbContext context, INotesHubService hubService)
    {
        _context = context;
        _hubService = hubService;
    }

    private int GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim))
        {
            throw new UnauthorizedAccessException("User ID not found in token");
        }
        return int.Parse(userIdClaim);
    }

    [HttpGet]
    public async Task<ActionResult<List<CategoryResponseDto>>> GetCategories()
    {
        var userId = GetCurrentUserId();

        var categories = await _context.Categories
            .Where(c => c.UserId == userId)
            .OrderBy(c => c.SortOrder)
            .Select(c => new CategoryResponseDto
            {
                Id = c.Id,
                Name = c.Name,
                Color = c.Color,
                Icon = c.Icon,
                SortOrder = c.SortOrder,
                NoteCount = c.Notes.Count(n => !n.IsDeleted && n.Status != NoteStatus.Trash),
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt
            })
            .ToListAsync();

        return Ok(categories);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<CategoryResponseDto>> GetCategory(Guid id)
    {
        var userId = GetCurrentUserId();

        var category = await _context.Categories
            .Where(c => c.Id == id && c.UserId == userId)
            .Select(c => new CategoryResponseDto
            {
                Id = c.Id,
                Name = c.Name,
                Color = c.Color,
                Icon = c.Icon,
                SortOrder = c.SortOrder,
                NoteCount = c.Notes.Count(n => !n.IsDeleted && n.Status != NoteStatus.Trash),
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt
            })
            .FirstOrDefaultAsync();

        if (category == null)
        {
            return NotFound(new { message = "Category not found" });
        }

        return Ok(category);
    }

    [HttpPost]
    public async Task<ActionResult<CategoryResponseDto>> CreateCategory(CreateCategoryDto dto)
    {
        var userId = GetCurrentUserId();

        var existingCategory = await _context.Categories
            .AnyAsync(c => c.UserId == userId && c.Name.ToLower() == dto.Name.ToLower());

        if (existingCategory)
        {
            return BadRequest(new { message = "Category with this name already exists" });
        }

        var maxSortOrder = await _context.Categories
            .Where(c => c.UserId == userId)
            .MaxAsync(c => (int?)c.SortOrder) ?? -1;

        var category = new Category
        {
            UserId = userId,
            Name = dto.Name,
            Color = dto.Color,
            Icon = dto.Icon,
            SortOrder = maxSortOrder + 1,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Categories.Add(category);
        await _context.SaveChangesAsync();

        var response = new CategoryResponseDto
        {
            Id = category.Id,
            Name = category.Name,
            Color = category.Color,
            Icon = category.Icon,
            SortOrder = category.SortOrder,
            NoteCount = 0,
            CreatedAt = category.CreatedAt,
            UpdatedAt = category.UpdatedAt
        };

        await _hubService.NotifyCategoryCreated(userId, response);

        return CreatedAtAction(nameof(GetCategory), new { id = category.Id }, response);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<CategoryResponseDto>> UpdateCategory(Guid id, UpdateCategoryDto dto)
    {
        var userId = GetCurrentUserId();

        var category = await _context.Categories
            .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

        if (category == null)
        {
            return NotFound(new { message = "Category not found" });
        }

        var duplicateName = await _context.Categories
            .AnyAsync(c => c.UserId == userId && c.Id != id && c.Name.ToLower() == dto.Name.ToLower());

        if (duplicateName)
        {
            return BadRequest(new { message = "Category with this name already exists" });
        }

        category.Name = dto.Name;
        category.Color = dto.Color;
        category.Icon = dto.Icon;
        if (dto.SortOrder.HasValue)
        {
            category.SortOrder = dto.SortOrder.Value;
        }
        category.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var noteCount = await _context.Notes
            .CountAsync(n => n.CategoryId == id && !n.IsDeleted && n.Status != NoteStatus.Trash);

        var response = new CategoryResponseDto
        {
            Id = category.Id,
            Name = category.Name,
            Color = category.Color,
            Icon = category.Icon,
            SortOrder = category.SortOrder,
            NoteCount = noteCount,
            CreatedAt = category.CreatedAt,
            UpdatedAt = category.UpdatedAt
        };

        await _hubService.NotifyCategoryUpdated(userId, response);

        return Ok(response);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteCategory(Guid id)
    {
        var userId = GetCurrentUserId();

        var category = await _context.Categories
            .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

        if (category == null)
        {
            return NotFound(new { message = "Category not found" });
        }

        // Notes in this category will have their CategoryId set to null (configured in DbContext)
        _context.Categories.Remove(category);
        await _context.SaveChangesAsync();

        await _hubService.NotifyCategoryDeleted(userId, id);

        return NoContent();
    }

    [HttpPost("reorder")]
    public async Task<ActionResult<List<CategoryResponseDto>>> ReorderCategories(ReorderCategoriesDto dto)
    {
        var userId = GetCurrentUserId();

        var categories = await _context.Categories
            .Where(c => c.UserId == userId && dto.CategoryIds.Contains(c.Id))
            .ToListAsync();

        if (categories.Count != dto.CategoryIds.Count)
        {
            return BadRequest(new { message = "Some categories not found" });
        }

        for (int i = 0; i < dto.CategoryIds.Count; i++)
        {
            var category = categories.First(c => c.Id == dto.CategoryIds[i]);
            category.SortOrder = i;
            category.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        var result = await _context.Categories
            .Where(c => c.UserId == userId)
            .OrderBy(c => c.SortOrder)
            .Select(c => new CategoryResponseDto
            {
                Id = c.Id,
                Name = c.Name,
                Color = c.Color,
                Icon = c.Icon,
                SortOrder = c.SortOrder,
                NoteCount = c.Notes.Count(n => !n.IsDeleted && n.Status != NoteStatus.Trash),
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt
            })
            .ToListAsync();

        return Ok(result);
    }
}

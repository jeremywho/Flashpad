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
public class NotesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly INotesHubService _hubService;
    private const int MaxHistoryVersions = 10;

    public NotesController(AppDbContext context, INotesHubService hubService)
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
    public async Task<ActionResult<NoteListResponseDto>> GetNotes(
        [FromQuery] NoteStatus? status = null,
        [FromQuery] Guid? categoryId = null,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var userId = GetCurrentUserId();

        var query = _context.Notes
            .Include(n => n.Category)
            .Where(n => n.UserId == userId && !n.IsDeleted);

        if (status.HasValue)
        {
            query = query.Where(n => n.Status == status.Value);
        }

        if (categoryId.HasValue)
        {
            query = query.Where(n => n.CategoryId == categoryId.Value);
        }
        else if (status.HasValue && status.Value == NoteStatus.Inbox)
        {
            // Inbox only shows uncategorized notes
            query = query.Where(n => n.CategoryId == null);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(n => n.Content.ToLower().Contains(search.ToLower()));
        }

        var totalCount = await query.CountAsync();

        var notes = await query
            .OrderByDescending(n => n.UpdatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new NoteResponseDto
            {
                Id = n.Id,
                Content = n.Content,
                CategoryId = n.CategoryId,
                CategoryName = n.Category != null ? n.Category.Name : null,
                CategoryColor = n.Category != null ? n.Category.Color : null,
                Status = n.Status,
                Version = n.Version,
                DeviceId = n.DeviceId,
                CreatedAt = n.CreatedAt,
                UpdatedAt = n.UpdatedAt
            })
            .ToListAsync();

        return Ok(new NoteListResponseDto
        {
            Notes = notes,
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<NoteResponseDto>> GetNote(Guid id)
    {
        var userId = GetCurrentUserId();

        var note = await _context.Notes
            .Include(n => n.Category)
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (note == null)
        {
            return NotFound(new { message = "Note not found" });
        }

        return Ok(new NoteResponseDto
        {
            Id = note.Id,
            Content = note.Content,
            CategoryId = note.CategoryId,
            CategoryName = note.Category?.Name,
            CategoryColor = note.Category?.Color,
            Status = note.Status,
            Version = note.Version,
            DeviceId = note.DeviceId,
            CreatedAt = note.CreatedAt,
            UpdatedAt = note.UpdatedAt
        });
    }

    [HttpPost]
    public async Task<ActionResult<NoteResponseDto>> CreateNote(CreateNoteDto dto)
    {
        var userId = GetCurrentUserId();

        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _context.Categories
                .AnyAsync(c => c.Id == dto.CategoryId.Value && c.UserId == userId);
            if (!categoryExists)
            {
                return BadRequest(new { message = "Category not found" });
            }
        }

        var note = new Note
        {
            UserId = userId,
            Content = dto.Content,
            CategoryId = dto.CategoryId,
            DeviceId = dto.DeviceId,
            Status = NoteStatus.Inbox,
            Version = 1,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Notes.Add(note);
        await _context.SaveChangesAsync();

        await _context.Entry(note).Reference(n => n.Category).LoadAsync();

        var response = new NoteResponseDto
        {
            Id = note.Id,
            Content = note.Content,
            CategoryId = note.CategoryId,
            CategoryName = note.Category?.Name,
            CategoryColor = note.Category?.Color,
            Status = note.Status,
            Version = note.Version,
            DeviceId = note.DeviceId,
            CreatedAt = note.CreatedAt,
            UpdatedAt = note.UpdatedAt
        };

        await _hubService.NotifyNoteCreated(userId, response);

        return CreatedAtAction(nameof(GetNote), new { id = note.Id }, response);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<NoteResponseDto>> UpdateNote(Guid id, UpdateNoteDto dto)
    {
        var userId = GetCurrentUserId();

        var note = await _context.Notes
            .Include(n => n.Category)
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (note == null)
        {
            return NotFound(new { message = "Note not found" });
        }

        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _context.Categories
                .AnyAsync(c => c.Id == dto.CategoryId.Value && c.UserId == userId);
            if (!categoryExists)
            {
                return BadRequest(new { message = "Category not found" });
            }
        }

        // Save current version to history before updating
        var history = new NoteHistory
        {
            NoteId = note.Id,
            Content = note.Content,
            Version = note.Version,
            DeviceId = note.DeviceId,
            CreatedAt = DateTime.UtcNow
        };
        _context.NoteHistories.Add(history);

        // Clean up old history (keep only last MaxHistoryVersions)
        var oldHistories = await _context.NoteHistories
            .Where(h => h.NoteId == note.Id)
            .OrderByDescending(h => h.Version)
            .Skip(MaxHistoryVersions)
            .ToListAsync();
        _context.NoteHistories.RemoveRange(oldHistories);

        // Update note
        note.Content = dto.Content;
        note.CategoryId = dto.CategoryId;
        note.DeviceId = dto.DeviceId;
        note.Version++;
        note.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _context.Entry(note).Reference(n => n.Category).LoadAsync();

        var response = new NoteResponseDto
        {
            Id = note.Id,
            Content = note.Content,
            CategoryId = note.CategoryId,
            CategoryName = note.Category?.Name,
            CategoryColor = note.Category?.Color,
            Status = note.Status,
            Version = note.Version,
            DeviceId = note.DeviceId,
            CreatedAt = note.CreatedAt,
            UpdatedAt = note.UpdatedAt
        };

        await _hubService.NotifyNoteUpdated(userId, response);

        return Ok(response);
    }

    [HttpPost("{id}/archive")]
    public async Task<ActionResult<NoteResponseDto>> ArchiveNote(Guid id)
    {
        var userId = GetCurrentUserId();

        var note = await _context.Notes
            .Include(n => n.Category)
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (note == null)
        {
            return NotFound(new { message = "Note not found" });
        }

        note.Status = NoteStatus.Archived;
        note.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var response = new NoteResponseDto
        {
            Id = note.Id,
            Content = note.Content,
            CategoryId = note.CategoryId,
            CategoryName = note.Category?.Name,
            CategoryColor = note.Category?.Color,
            Status = note.Status,
            Version = note.Version,
            DeviceId = note.DeviceId,
            CreatedAt = note.CreatedAt,
            UpdatedAt = note.UpdatedAt
        };

        await _hubService.NotifyNoteStatusChanged(userId, response);

        return Ok(response);
    }

    [HttpPost("{id}/restore")]
    public async Task<ActionResult<NoteResponseDto>> RestoreNote(Guid id)
    {
        var userId = GetCurrentUserId();

        var note = await _context.Notes
            .Include(n => n.Category)
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (note == null)
        {
            return NotFound(new { message = "Note not found" });
        }

        note.Status = NoteStatus.Inbox;
        note.IsDeleted = false;
        note.DeletedAt = null;
        note.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var response = new NoteResponseDto
        {
            Id = note.Id,
            Content = note.Content,
            CategoryId = note.CategoryId,
            CategoryName = note.Category?.Name,
            CategoryColor = note.Category?.Color,
            Status = note.Status,
            Version = note.Version,
            DeviceId = note.DeviceId,
            CreatedAt = note.CreatedAt,
            UpdatedAt = note.UpdatedAt
        };

        await _hubService.NotifyNoteStatusChanged(userId, response);

        return Ok(response);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> TrashNote(Guid id)
    {
        var userId = GetCurrentUserId();

        var note = await _context.Notes
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (note == null)
        {
            return NotFound(new { message = "Note not found" });
        }

        note.Status = NoteStatus.Trash;
        note.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _hubService.NotifyNoteDeleted(userId, id);

        return NoContent();
    }

    [HttpDelete("{id}/permanent")]
    public async Task<ActionResult> DeleteNotePermanently(Guid id)
    {
        var userId = GetCurrentUserId();

        var note = await _context.Notes
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (note == null)
        {
            return NotFound(new { message = "Note not found" });
        }

        _context.Notes.Remove(note);
        await _context.SaveChangesAsync();

        await _hubService.NotifyNoteDeleted(userId, id);

        return NoContent();
    }

    [HttpPost("empty-trash")]
    public async Task<ActionResult> EmptyTrash()
    {
        var userId = GetCurrentUserId();

        var trashedNotes = await _context.Notes
            .Where(n => n.UserId == userId && n.Status == NoteStatus.Trash)
            .ToListAsync();

        var noteIds = trashedNotes.Select(n => n.Id).ToList();

        _context.Notes.RemoveRange(trashedNotes);
        await _context.SaveChangesAsync();

        foreach (var noteId in noteIds)
        {
            await _hubService.NotifyNoteDeleted(userId, noteId);
        }

        return Ok(new { message = $"Deleted {trashedNotes.Count} notes" });
    }

    [HttpPost("{id}/move")]
    public async Task<ActionResult<NoteResponseDto>> MoveNote(Guid id, MoveNoteDto dto)
    {
        var userId = GetCurrentUserId();

        var note = await _context.Notes
            .Include(n => n.Category)
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (note == null)
        {
            return NotFound(new { message = "Note not found" });
        }

        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _context.Categories
                .AnyAsync(c => c.Id == dto.CategoryId.Value && c.UserId == userId);
            if (!categoryExists)
            {
                return BadRequest(new { message = "Category not found" });
            }
        }

        note.CategoryId = dto.CategoryId;
        note.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _context.Entry(note).Reference(n => n.Category).LoadAsync();

        var response = new NoteResponseDto
        {
            Id = note.Id,
            Content = note.Content,
            CategoryId = note.CategoryId,
            CategoryName = note.Category?.Name,
            CategoryColor = note.Category?.Color,
            Status = note.Status,
            Version = note.Version,
            DeviceId = note.DeviceId,
            CreatedAt = note.CreatedAt,
            UpdatedAt = note.UpdatedAt
        };

        await _hubService.NotifyNoteUpdated(userId, response);

        return Ok(response);
    }

    [HttpGet("{id}/history")]
    public async Task<ActionResult<List<NoteHistoryResponseDto>>> GetNoteHistory(Guid id)
    {
        var userId = GetCurrentUserId();

        var noteExists = await _context.Notes
            .AnyAsync(n => n.Id == id && n.UserId == userId);

        if (!noteExists)
        {
            return NotFound(new { message = "Note not found" });
        }

        var history = await _context.NoteHistories
            .Where(h => h.NoteId == id)
            .OrderByDescending(h => h.Version)
            .Select(h => new NoteHistoryResponseDto
            {
                Id = h.Id,
                NoteId = h.NoteId,
                Content = h.Content,
                Version = h.Version,
                DeviceId = h.DeviceId,
                CreatedAt = h.CreatedAt
            })
            .ToListAsync();

        return Ok(history);
    }
}

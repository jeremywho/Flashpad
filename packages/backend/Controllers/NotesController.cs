using Backend.Data;
using Backend.DTOs;
using Backend.Hubs;
using Backend.Models;
using H4.Sdk;
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
    private const int MaxPageSize = 1000;
    private readonly AppDbContext _context;
    private readonly INotesHubService _hubService;
    private readonly IH4Logger _h4;
    private const int MaxHistoryVersions = 10;

    public NotesController(AppDbContext context, INotesHubService hubService, IH4Logger h4)
    {
        _context = context;
        _hubService = hubService;
        _h4 = h4;
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
        if (page < 1)
        {
            return BadRequest(new { message = "Page must be greater than or equal to 1" });
        }

        if (pageSize < 1)
        {
            return BadRequest(new { message = "Page size must be greater than or equal to 1" });
        }

        if (pageSize > MaxPageSize)
        {
            pageSize = MaxPageSize;
        }

        var skip = (long)(page - 1) * pageSize;
        if (skip > int.MaxValue)
        {
            return BadRequest(new { message = "Requested page is too large" });
        }

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
            .Skip((int)skip)
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

        _h4.Info("Notes listed", new
        {
            userId,
            status = status?.ToString(),
            categoryId,
            hasSearch = !string.IsNullOrWhiteSpace(search),
            page,
            pageSize,
            totalCount,
            returnedCount = notes.Count
        });

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
            _h4.Warning("Note not found", new { userId, noteId = id });
            return NotFound(new { message = "Note not found" });
        }

        _h4.Debug("Note fetched", new { userId, noteId = id, version = note.Version });

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

        _h4.Info("Note created", new { userId, noteId = note.Id, version = note.Version, categoryId = note.CategoryId });
        await _hubService.NotifyNoteCreated(userId, response, dto.DeviceId);

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

        // Optimistic concurrency: reject stale writes
        if (dto.BaseVersion.HasValue && dto.BaseVersion.Value != note.Version)
        {
            _h4.Warning("Note update conflict", new { userId, noteId = note.Id, clientVersion = dto.BaseVersion.Value, serverVersion = note.Version });
            return Conflict(new { message = "Note was modified by another device", serverVersion = note.Version, clientVersion = dto.BaseVersion.Value });
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

        _h4.Info("Note updated", new { userId, noteId = note.Id, version = note.Version, categoryId = note.CategoryId });
        await _hubService.NotifyNoteUpdated(userId, response, dto.DeviceId);

        return Ok(response);
    }

    [HttpPost("{id}/archive")]
    public async Task<ActionResult<NoteResponseDto>> ArchiveNote(Guid id, [FromQuery] string? deviceId = null)
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

        _h4.Info("Note archived", new { userId, noteId = note.Id });
        await _hubService.NotifyNoteStatusChanged(userId, response, deviceId);

        return Ok(response);
    }

    [HttpPost("{id}/restore")]
    public async Task<ActionResult<NoteResponseDto>> RestoreNote(Guid id, [FromQuery] string? deviceId = null)
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

        _h4.Info("Note restored", new { userId, noteId = note.Id });
        await _hubService.NotifyNoteStatusChanged(userId, response, deviceId);

        return Ok(response);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> TrashNote(Guid id, [FromQuery] string? deviceId = null)
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

        _h4.Info("Note trashed", new { userId, noteId = note.Id });
        await _hubService.NotifyNoteDeleted(userId, id, deviceId);

        return NoContent();
    }

    [HttpDelete("{id}/permanent")]
    public async Task<ActionResult> DeleteNotePermanently(Guid id, [FromQuery] string? deviceId = null)
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

        _h4.Info("Note permanently deleted", new { userId, noteId = note.Id });
        await _hubService.NotifyNoteDeleted(userId, id, deviceId);

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

        _h4.Info("Trash emptied", new { userId, deletedCount = trashedNotes.Count });

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

        var previousCategoryId = note.CategoryId;
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

        _h4.Info("Note moved", new { userId, noteId = note.Id, fromCategoryId = previousCategoryId, toCategoryId = dto.CategoryId });
        await _hubService.NotifyNoteUpdated(userId, response, note.DeviceId);

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

using Backend.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace Backend.Hubs;

[Authorize]
public class NotesHub : Hub
{
    private int GetCurrentUserId()
    {
        var userIdClaim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim))
        {
            throw new HubException("User ID not found in token");
        }
        return int.Parse(userIdClaim);
    }

    public override async Task OnConnectedAsync()
    {
        var userId = GetCurrentUserId();
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetCurrentUserId();
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user_{userId}");
        await base.OnDisconnectedAsync(exception);
    }

    // Client can call this to join their user group explicitly
    public async Task JoinUserGroup()
    {
        var userId = GetCurrentUserId();
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
    }
}

// Service to broadcast note changes from controllers
public interface INotesHubService
{
    Task NotifyNoteCreated(int userId, NoteResponseDto note);
    Task NotifyNoteUpdated(int userId, NoteResponseDto note);
    Task NotifyNoteDeleted(int userId, Guid noteId);
    Task NotifyNoteStatusChanged(int userId, NoteResponseDto note);
    Task NotifyCategoryCreated(int userId, CategoryResponseDto category);
    Task NotifyCategoryUpdated(int userId, CategoryResponseDto category);
    Task NotifyCategoryDeleted(int userId, Guid categoryId);
}

public class NotesHubService : INotesHubService
{
    private readonly IHubContext<NotesHub> _hubContext;

    public NotesHubService(IHubContext<NotesHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task NotifyNoteCreated(int userId, NoteResponseDto note)
    {
        await _hubContext.Clients.Group($"user_{userId}").SendAsync("NoteCreated", note);
    }

    public async Task NotifyNoteUpdated(int userId, NoteResponseDto note)
    {
        await _hubContext.Clients.Group($"user_{userId}").SendAsync("NoteUpdated", note);
    }

    public async Task NotifyNoteDeleted(int userId, Guid noteId)
    {
        await _hubContext.Clients.Group($"user_{userId}").SendAsync("NoteDeleted", noteId);
    }

    public async Task NotifyNoteStatusChanged(int userId, NoteResponseDto note)
    {
        await _hubContext.Clients.Group($"user_{userId}").SendAsync("NoteStatusChanged", note);
    }

    public async Task NotifyCategoryCreated(int userId, CategoryResponseDto category)
    {
        await _hubContext.Clients.Group($"user_{userId}").SendAsync("CategoryCreated", category);
    }

    public async Task NotifyCategoryUpdated(int userId, CategoryResponseDto category)
    {
        await _hubContext.Clients.Group($"user_{userId}").SendAsync("CategoryUpdated", category);
    }

    public async Task NotifyCategoryDeleted(int userId, Guid categoryId)
    {
        await _hubContext.Clients.Group($"user_{userId}").SendAsync("CategoryDeleted", categoryId);
    }
}

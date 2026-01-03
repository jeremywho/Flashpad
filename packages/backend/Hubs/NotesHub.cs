using Backend.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Security.Claims;

namespace Backend.Hubs;

// Presence info for a connected device
public class DevicePresence
{
    public string ConnectionId { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public string DeviceName { get; set; } = string.Empty;
    public DateTime ConnectedAt { get; set; }
    public DateTime LastSeen { get; set; }
}

// Static presence tracker (in production, use Redis or similar for distributed scenarios)
public static class PresenceTracker
{
    // userId -> list of connected devices
    private static readonly ConcurrentDictionary<int, ConcurrentDictionary<string, DevicePresence>> _userDevices = new();

    public static void AddDevice(int userId, string connectionId, string deviceId, string deviceName)
    {
        var devices = _userDevices.GetOrAdd(userId, _ => new ConcurrentDictionary<string, DevicePresence>());
        devices[connectionId] = new DevicePresence
        {
            ConnectionId = connectionId,
            DeviceId = deviceId,
            DeviceName = deviceName,
            ConnectedAt = DateTime.UtcNow,
            LastSeen = DateTime.UtcNow
        };
    }

    public static DevicePresence? RemoveDevice(int userId, string connectionId)
    {
        if (_userDevices.TryGetValue(userId, out var devices))
        {
            devices.TryRemove(connectionId, out var removed);
            return removed;
        }
        return null;
    }

    public static List<DevicePresence> GetUserDevices(int userId)
    {
        if (_userDevices.TryGetValue(userId, out var devices))
        {
            return devices.Values.ToList();
        }
        return new List<DevicePresence>();
    }

    public static void UpdateLastSeen(int userId, string connectionId)
    {
        if (_userDevices.TryGetValue(userId, out var devices))
        {
            if (devices.TryGetValue(connectionId, out var device))
            {
                device.LastSeen = DateTime.UtcNow;
            }
        }
    }
}

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

        // Remove from presence and notify others
        var removed = PresenceTracker.RemoveDevice(userId, Context.ConnectionId);
        if (removed != null)
        {
            var devices = PresenceTracker.GetUserDevices(userId);
            await Clients.Group($"user_{userId}").SendAsync("DeviceDisconnected", new
            {
                removed.DeviceId,
                removed.DeviceName,
                removed.ConnectedAt
            });
            await Clients.Group($"user_{userId}").SendAsync("PresenceUpdated", devices.Select(d => new
            {
                d.DeviceId,
                d.DeviceName,
                d.ConnectedAt,
                d.LastSeen
            }));
        }

        await base.OnDisconnectedAsync(exception);
    }

    // Client can call this to join their user group explicitly
    public async Task JoinUserGroup()
    {
        var userId = GetCurrentUserId();
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
    }

    // Client registers their device for presence tracking
    public async Task RegisterDevice(string deviceId, string deviceName)
    {
        var userId = GetCurrentUserId();
        PresenceTracker.AddDevice(userId, Context.ConnectionId, deviceId, deviceName);

        var devices = PresenceTracker.GetUserDevices(userId);

        // Notify all user's devices about the new connection
        await Clients.Group($"user_{userId}").SendAsync("DeviceConnected", new
        {
            DeviceId = deviceId,
            DeviceName = deviceName,
            ConnectedAt = DateTime.UtcNow
        });

        // Send full presence list to the newly connected device
        await Clients.Caller.SendAsync("PresenceUpdated", devices.Select(d => new
        {
            d.DeviceId,
            d.DeviceName,
            d.ConnectedAt,
            d.LastSeen
        }));
    }

    // Client can request current presence list
    public async Task GetPresence()
    {
        var userId = GetCurrentUserId();
        var devices = PresenceTracker.GetUserDevices(userId);
        await Clients.Caller.SendAsync("PresenceUpdated", devices.Select(d => new
        {
            d.DeviceId,
            d.DeviceName,
            d.ConnectedAt,
            d.LastSeen
        }));
    }

    // Client sends heartbeat to update last seen
    public void Heartbeat()
    {
        var userId = GetCurrentUserId();
        PresenceTracker.UpdateLastSeen(userId, Context.ConnectionId);
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

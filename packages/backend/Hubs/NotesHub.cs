using Backend.DTOs;
using H4.Sdk;
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

    public static List<string> GetConnectionIdsForDevice(int userId, string deviceId)
    {
        if (_userDevices.TryGetValue(userId, out var devices))
        {
            return devices.Values
                .Where(d => d.DeviceId == deviceId)
                .Select(d => d.ConnectionId)
                .ToList();
        }
        return new List<string>();
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
public class NotesHub(IH4Logger h4) : Hub
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
        var existingDevices = PresenceTracker.GetUserDevices(userId);
        h4.Info("SignalR connected", new { userId, existingDeviceCount = existingDevices.Count });
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
            h4.Info("SignalR disconnected", new { userId, remainingDeviceCount = devices.Count, reason = exception?.Message });
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
        else
        {
            h4.Warning("SignalR disconnected (no device registration)", new { userId, reason = exception?.Message });
        }

        await base.OnDisconnectedAsync(exception);
    }

    // Client can call this to join their user group explicitly
    public async Task JoinUserGroup()
    {
        var userId = GetCurrentUserId();
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
        h4.Debug("JoinUserGroup", new { userId });
    }

    // Client registers their device for presence tracking
    public async Task RegisterDevice(string deviceId, string deviceName)
    {
        var userId = GetCurrentUserId();
        PresenceTracker.AddDevice(userId, Context.ConnectionId, deviceId, deviceName);

        var devices = PresenceTracker.GetUserDevices(userId);
        h4.Info("Device registered", new { userId, totalDevices = devices.Count });

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
        h4.Debug("GetPresence", new { userId, deviceCount = devices.Count });
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
        var devices = PresenceTracker.GetUserDevices(userId);
        h4.Debug("Heartbeat", new { userId, totalDevices = devices.Count });
    }
}

// Service to broadcast note changes from controllers
// senderDeviceId is used to exclude the originating device from broadcasts
public interface INotesHubService
{
    Task NotifyNoteCreated(int userId, NoteResponseDto note, string? senderDeviceId = null);
    Task NotifyNoteUpdated(int userId, NoteResponseDto note, string? senderDeviceId = null);
    Task NotifyNoteDeleted(int userId, Guid noteId, string? senderDeviceId = null);
    Task NotifyNoteStatusChanged(int userId, NoteResponseDto note, string? senderDeviceId = null);
    Task NotifyCategoryCreated(int userId, CategoryResponseDto category);
    Task NotifyCategoryUpdated(int userId, CategoryResponseDto category);
    Task NotifyCategoryDeleted(int userId, Guid categoryId);
}

public class NotesHubService(IHubContext<NotesHub> hubContext, IH4Logger h4) : INotesHubService
{
    private IClientProxy GetTargetClients(int userId, string? senderDeviceId)
    {
        var group = $"user_{userId}";
        if (senderDeviceId != null)
        {
            var excludeIds = PresenceTracker.GetConnectionIdsForDevice(userId, senderDeviceId);
            if (excludeIds.Count > 0)
            {
                return hubContext.Clients.GroupExcept(group, excludeIds);
            }
        }
        return hubContext.Clients.Group(group);
    }

    public async Task NotifyNoteCreated(int userId, NoteResponseDto note, string? senderDeviceId = null)
    {
        var devices = PresenceTracker.GetUserDevices(userId);
        h4.Info("Broadcasting NoteCreated", new { userId, noteId = note.Id, version = note.Version, connectedDevices = devices.Count, excludedOriginDevice = senderDeviceId != null });
        await GetTargetClients(userId, senderDeviceId).SendAsync("NoteCreated", note);
    }

    public async Task NotifyNoteUpdated(int userId, NoteResponseDto note, string? senderDeviceId = null)
    {
        var devices = PresenceTracker.GetUserDevices(userId);
        h4.Info("Broadcasting NoteUpdated", new { userId, noteId = note.Id, version = note.Version, connectedDevices = devices.Count, excludedOriginDevice = senderDeviceId != null });
        await GetTargetClients(userId, senderDeviceId).SendAsync("NoteUpdated", note);
    }

    public async Task NotifyNoteDeleted(int userId, Guid noteId, string? senderDeviceId = null)
    {
        var devices = PresenceTracker.GetUserDevices(userId);
        h4.Info("Broadcasting NoteDeleted", new { userId, noteId, connectedDevices = devices.Count, excludedOriginDevice = senderDeviceId != null });
        await GetTargetClients(userId, senderDeviceId).SendAsync("NoteDeleted", noteId);
    }

    public async Task NotifyNoteStatusChanged(int userId, NoteResponseDto note, string? senderDeviceId = null)
    {
        var devices = PresenceTracker.GetUserDevices(userId);
        h4.Info("Broadcasting NoteStatusChanged", new { userId, noteId = note.Id, status = note.Status.ToString(), connectedDevices = devices.Count, excludedOriginDevice = senderDeviceId != null });
        await GetTargetClients(userId, senderDeviceId).SendAsync("NoteStatusChanged", note);
    }

    public async Task NotifyCategoryCreated(int userId, CategoryResponseDto category)
    {
        h4.Info("Broadcasting CategoryCreated", new { userId, categoryId = category.Id });
        await hubContext.Clients.Group($"user_{userId}").SendAsync("CategoryCreated", category);
    }

    public async Task NotifyCategoryUpdated(int userId, CategoryResponseDto category)
    {
        h4.Info("Broadcasting CategoryUpdated", new { userId, categoryId = category.Id });
        await hubContext.Clients.Group($"user_{userId}").SendAsync("CategoryUpdated", category);
    }

    public async Task NotifyCategoryDeleted(int userId, Guid categoryId)
    {
        h4.Info("Broadcasting CategoryDeleted", new { userId, categoryId });
        await hubContext.Clients.Group($"user_{userId}").SendAsync("CategoryDeleted", categoryId);
    }
}

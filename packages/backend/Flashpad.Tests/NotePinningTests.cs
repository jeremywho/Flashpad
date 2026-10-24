using Backend.Controllers;
using Backend.Data;
using Backend.DTOs;
using Backend.Hubs;
using Backend.Models;
using H4.Sdk;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Tests;

public class NotePinningTests
{
    private static readonly DateTime Edited = new(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task Pin_SetsPinnedAtWithoutTouchingVersionOrUpdatedAt()
    {
        await using var context = await CreateContextAsync();
        var hub = new RecordingNotesHubService();
        var controller = CreateController(context, hub);
        var noteId = await SeedNoteAsync(context, userId: 1);

        var result = await controller.PinNote(noteId, deviceId: "desk");

        var note = Assert.IsType<NoteResponseDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.NotNull(note.PinnedAt);
        Assert.Equal(3, note.Version);
        Assert.Equal(Edited, note.UpdatedAt);
        var stored = await context.Notes.AsNoTracking().SingleAsync(n => n.Id == noteId);
        Assert.NotNull(stored.PinnedAt);
        Assert.Equal(3, stored.Version);
        Assert.Equal((noteId, "desk"), Assert.Single(hub.Updated));
    }

    [Fact]
    public async Task Pin_KeepsTheOriginalPinTimeWhenPinnedAgain()
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context, new RecordingNotesHubService());
        var noteId = await SeedNoteAsync(context, userId: 1, pinnedAt: Edited.AddDays(-5));

        var result = await controller.PinNote(noteId);

        var note = Assert.IsType<NoteResponseDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(Edited.AddDays(-5), note.PinnedAt);
    }

    [Fact]
    public async Task Unpin_ClearsPinnedAt()
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context, new RecordingNotesHubService());
        var noteId = await SeedNoteAsync(context, userId: 1, pinnedAt: Edited);

        var result = await controller.UnpinNote(noteId);

        var note = Assert.IsType<NoteResponseDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Null(note.PinnedAt);
        Assert.Null((await context.Notes.AsNoTracking().SingleAsync(n => n.Id == noteId)).PinnedAt);
    }

    [Fact]
    public async Task Pin_ReturnsNotFoundForAnotherUsersNote()
    {
        await using var context = await CreateContextAsync();
        var hub = new RecordingNotesHubService();
        var controller = CreateController(context, hub);
        var noteId = await SeedNoteAsync(context, userId: 2);

        var result = await controller.PinNote(noteId);

        Assert.IsType<NotFoundObjectResult>(result.Result);
        Assert.Null((await context.Notes.AsNoTracking().SingleAsync(n => n.Id == noteId)).PinnedAt);
        Assert.Empty(hub.Updated);
    }

    [Fact]
    public async Task GetNotes_FiltersByPinnedAndReturnsPinnedAt()
    {
        await using var context = await CreateContextAsync();
        var controller = CreateController(context, new RecordingNotesHubService());
        var pinnedId = await SeedNoteAsync(context, userId: 1, pinnedAt: Edited);
        var unpinnedId = await SeedNoteAsync(context, userId: 1);

        var pinned = await ListAsync(controller, pinned: true);
        var unpinned = await ListAsync(controller, pinned: false);
        var all = await ListAsync(controller, pinned: null);

        Assert.Equal(pinnedId, Assert.Single(pinned).Id);
        Assert.Equal(Edited, Assert.Single(pinned).PinnedAt);
        Assert.Equal(unpinnedId, Assert.Single(unpinned).Id);
        Assert.Equal(2, all.Count);
    }

    private static async Task<List<NoteResponseDto>> ListAsync(NotesController controller, bool? pinned)
    {
        var result = await controller.GetNotes(pinned: pinned);
        return Assert.IsType<NoteListResponseDto>(Assert.IsType<OkObjectResult>(result.Result).Value).Notes;
    }

    private static async Task<Guid> SeedNoteAsync(AppDbContext context, int userId, DateTime? pinnedAt = null)
    {
        var note = new Note
        {
            UserId = userId,
            Content = "pin me",
            Status = NoteStatus.Inbox,
            Version = 3,
            CreatedAt = Edited.AddDays(-1),
            UpdatedAt = Edited,
            PinnedAt = pinnedAt
        };
        context.Notes.Add(note);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        return note.Id;
    }

    private static NotesController CreateController(AppDbContext context, INotesHubService hub)
    {
        var controller = new NotesController(context, hub, new SilentH4Logger());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, "1")
                }, "test"))
            }
        };
        return controller;
    }

    private static async Task<AppDbContext> CreateContextAsync()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"flashpad-pin-tests-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={dbPath}")
            .Options;

        var context = new AppDbContext(options);
        await context.Database.EnsureCreatedAsync();
        foreach (var (id, name) in new[] { (1, "alice"), (2, "bob") })
        {
            context.Users.Add(new User
            {
                Id = id,
                Username = name,
                Email = $"{name}@example.com",
                PasswordHash = "hash",
                CreatedAt = Edited,
                UpdatedAt = Edited
            });
        }
        await context.SaveChangesAsync();
        return context;
    }

    private sealed class RecordingNotesHubService : INotesHubService
    {
        public List<(Guid NoteId, string? DeviceId)> Updated { get; } = new();

        public Task NotifyNoteUpdated(int userId, NoteResponseDto note, string? senderDeviceId = null)
        {
            Updated.Add((note.Id, senderDeviceId));
            return Task.CompletedTask;
        }

        public Task NotifyCategoryCreated(int userId, CategoryResponseDto category) => Task.CompletedTask;
        public Task NotifyCategoryDeleted(int userId, Guid categoryId) => Task.CompletedTask;
        public Task NotifyCategoryUpdated(int userId, CategoryResponseDto category) => Task.CompletedTask;
        public Task NotifyNoteCreated(int userId, NoteResponseDto note, string? senderDeviceId = null) => Task.CompletedTask;
        public Task NotifyNoteDeleted(int userId, Guid noteId, string? senderDeviceId = null) => Task.CompletedTask;
        public Task NotifyNoteStatusChanged(int userId, NoteResponseDto note, string? senderDeviceId = null) => Task.CompletedTask;
    }

    private sealed class SilentH4Logger : IH4Logger
    {
        public void Debug(string message, object? metadata = null) { }
        public void Info(string message, object? metadata = null) { }
        public void Warning(string message, object? metadata = null) { }
        public void Error(string message, object? metadata = null) { }
        public void Fatal(string message, object? metadata = null) { }
        public H4Trace StartTrace(string name) => throw new NotSupportedException();
        public Task FlushAsync() => Task.CompletedTask;
    }
}

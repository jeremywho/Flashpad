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

public class NotesControllerTests
{
    [Theory]
    [InlineData(0, 50, "Page must be greater than or equal to 1")]
    [InlineData(1, 0, "Page size must be greater than or equal to 1")]
    public async Task GetNotes_RejectsInvalidPagingArguments(int page, int pageSize, string expectedMessage)
    {
        var dbPath = CreateTempDbPath();
        await using var context = await CreateContextAsync(dbPath);
        var controller = CreateController(context);

        var result = await controller.GetNotes(page: page, pageSize: pageSize);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Contains(expectedMessage, GetErrorMessage(badRequest.Value));
    }

    [Fact]
    public async Task GetNotes_ClampsOversizedPageSize()
    {
        var dbPath = CreateTempDbPath();
        await using var context = await CreateContextAsync(dbPath, seedNote: true);
        var controller = CreateController(context);

        var result = await controller.GetNotes(page: 1, pageSize: 5000);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<NoteListResponseDto>(ok.Value);
        Assert.Equal(1000, response.PageSize);
        Assert.Single(response.Notes);
    }

    [Fact]
    public async Task GetNotes_RejectsOverflowingPageOffset()
    {
        var dbPath = CreateTempDbPath();
        await using var context = await CreateContextAsync(dbPath, seedNote: true);
        var controller = CreateController(context);

        var result = await controller.GetNotes(page: int.MaxValue, pageSize: 1000);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Contains("Requested page is too large", GetErrorMessage(badRequest.Value));
    }

    private static NotesController CreateController(AppDbContext context)
    {
        var controller = new NotesController(context, new NoopNotesHubService(), new RecordingH4Logger());
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

    private static async Task<AppDbContext> CreateContextAsync(string dbPath, bool seedNote = false)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={dbPath}")
            .Options;

        var context = new AppDbContext(options);
        await context.Database.EnsureCreatedAsync();

        context.Users.Add(new User
        {
            Id = 1,
            Username = "alice",
            Email = "alice@example.com",
            PasswordHash = "hash",
            CreatedAt = DateTime.UtcNow.AddDays(-1),
            UpdatedAt = DateTime.UtcNow.AddDays(-1)
        });

        if (seedNote)
        {
            context.Notes.Add(new Note
            {
                UserId = 1,
                Content = "hello world",
                Status = NoteStatus.Inbox,
                Version = 1,
                CreatedAt = DateTime.UtcNow.AddHours(-1),
                UpdatedAt = DateTime.UtcNow
            });
        }

        await context.SaveChangesAsync();
        return context;
    }

    private static string CreateTempDbPath()
    {
        return Path.Combine(Path.GetTempPath(), $"flashpad-notes-tests-{Guid.NewGuid():N}.db");
    }

    private sealed class NoopNotesHubService : INotesHubService
    {
        public Task NotifyCategoryCreated(int userId, CategoryResponseDto category) => Task.CompletedTask;
        public Task NotifyCategoryDeleted(int userId, Guid categoryId) => Task.CompletedTask;
        public Task NotifyCategoryUpdated(int userId, CategoryResponseDto category) => Task.CompletedTask;
        public Task NotifyNoteCreated(int userId, NoteResponseDto note, string? senderDeviceId = null) => Task.CompletedTask;
        public Task NotifyNoteDeleted(int userId, Guid noteId, string? senderDeviceId = null) => Task.CompletedTask;
        public Task NotifyNoteStatusChanged(int userId, NoteResponseDto note, string? senderDeviceId = null) => Task.CompletedTask;
        public Task NotifyNoteUpdated(int userId, NoteResponseDto note, string? senderDeviceId = null) => Task.CompletedTask;
    }

    private sealed class RecordingH4Logger : IH4Logger
    {
        public void Debug(string message, object? metadata = null) { }
        public void Info(string message, object? metadata = null) { }
        public void Warning(string message, object? metadata = null) { }
        public void Error(string message, object? metadata = null) { }
        public void Fatal(string message, object? metadata = null) { }
        public H4Trace StartTrace(string name) => throw new NotSupportedException();
        public Task FlushAsync() => Task.CompletedTask;
    }

    private static string GetErrorMessage(object? value)
    {
        if (value is null)
        {
            return string.Empty;
        }

        var property = value.GetType().GetProperty("message");
        return property?.GetValue(value)?.ToString() ?? string.Empty;
    }
}

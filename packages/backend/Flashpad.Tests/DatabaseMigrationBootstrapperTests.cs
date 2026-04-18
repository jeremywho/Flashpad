using Backend.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;

namespace Backend.Tests;

public class DatabaseMigrationBootstrapperTests
{
    [Fact]
    public async Task MigrateAsync_UpgradesLegacyEnsureCreatedDatabase()
    {
        var dbPath = CreateTempDbPath();
        await using (var seedContext = CreateContext(dbPath))
        {
            await seedContext.Database.EnsureCreatedAsync();
            await seedContext.Database.ExecuteSqlRawAsync("""DROP TABLE "RefreshSessions";""");
        }

        await using var context = CreateContext(dbPath);
        await DatabaseMigrationBootstrapper.MigrateAsync(context);

        var tables = await GetTableNamesAsync(context);
        Assert.Contains("RefreshSessions", tables);
        Assert.Contains(context.Database.GetAppliedMigrations(), migration => migration.Contains("InitialCreate"));
    }

    [Fact]
    public async Task MigrateAsync_CreatesFreshDatabase()
    {
        var dbPath = CreateTempDbPath();
        await using var context = CreateContext(dbPath);

        await DatabaseMigrationBootstrapper.MigrateAsync(context);

        var tables = await GetTableNamesAsync(context);
        Assert.Contains("Users", tables);
        Assert.Contains("RefreshSessions", tables);
        Assert.Contains("Notes", tables);
        Assert.Contains("Categories", tables);
        Assert.Contains("NoteHistories", tables);
    }

    private static AppDbContext CreateContext(string dbPath)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={dbPath}")
            .Options;

        return new AppDbContext(options);
    }

    private static async Task<HashSet<string>> GetTableNamesAsync(AppDbContext context)
    {
        await context.Database.OpenConnectionAsync();
        try
        {
            using var command = context.Database.GetDbConnection().CreateCommand();
            command.CommandText = """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%';
                """;

            using var reader = await command.ExecuteReaderAsync();
            var tables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            while (await reader.ReadAsync())
            {
                tables.Add(reader.GetString(0));
            }

            return tables;
        }
        finally
        {
            await context.Database.CloseConnectionAsync();
        }
    }

    private static string CreateTempDbPath()
    {
        return Path.Combine(Path.GetTempPath(), $"flashpad-backend-{Guid.NewGuid():N}.db");
    }
}

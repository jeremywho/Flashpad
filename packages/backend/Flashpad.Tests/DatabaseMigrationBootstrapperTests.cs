using Backend.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
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
            var initialCreate = seedContext.Database.GetMigrations().First();
            await seedContext.GetService<IMigrator>().MigrateAsync(initialCreate);
            await seedContext.Database.ExecuteSqlRawAsync("""DROP TABLE "__EFMigrationsHistory";""");
            await seedContext.Database.ExecuteSqlRawAsync("""DROP TABLE "RefreshSessions";""");
        }

        await using var context = CreateContext(dbPath);
        await DatabaseMigrationBootstrapper.MigrateAsync(context);

        var tables = await GetTableNamesAsync(context);
        Assert.Contains("RefreshSessions", tables);
        Assert.Equal(context.Database.GetMigrations(), context.Database.GetAppliedMigrations());
        Assert.Contains("PinnedAt", await GetColumnNamesAsync(context, "Notes"));
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

    private static async Task<HashSet<string>> GetColumnNamesAsync(AppDbContext context, string table)
    {
        await context.Database.OpenConnectionAsync();
        try
        {
            using var command = context.Database.GetDbConnection().CreateCommand();
            command.CommandText = $"SELECT name FROM pragma_table_info('{table}');";

            using var reader = await command.ExecuteReaderAsync();
            var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            while (await reader.ReadAsync())
            {
                columns.Add(reader.GetString(0));
            }

            return columns;
        }
        finally
        {
            await context.Database.CloseConnectionAsync();
        }
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

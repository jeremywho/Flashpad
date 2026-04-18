using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using System.Globalization;

namespace Backend.Data;

public static class DatabaseMigrationBootstrapper
{
    public static async Task MigrateAsync(AppDbContext context, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (!context.Database.IsSqlite())
        {
            throw new InvalidOperationException("Flashpad backend migrations currently support SQLite only.");
        }

        await EnsureLegacyDatabaseCanMigrateAsync(context, cancellationToken);
        await context.Database.MigrateAsync(cancellationToken);
    }

    private static async Task EnsureLegacyDatabaseCanMigrateAsync(AppDbContext context, CancellationToken cancellationToken)
    {
        await context.Database.OpenConnectionAsync(cancellationToken);
        try
        {
            await EnsureMigrationsHistoryTableAsync(context, cancellationToken);

            if (await HasAppliedMigrationsAsync(context, cancellationToken))
            {
                return;
            }

            var tables = await GetSqliteTableNamesAsync(context, cancellationToken);
            var userTables = tables
                .Where(table => !string.Equals(table, "__EFMigrationsHistory", StringComparison.OrdinalIgnoreCase))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            if (userTables.Count == 0)
            {
                return;
            }

            var requiredLegacyTables = new[]
            {
                "Categories",
                "NoteHistories",
                "Notes",
                "Users"
            };

            var missingLegacyTables = requiredLegacyTables
                .Where(table => !userTables.Contains(table))
                .ToArray();

            if (missingLegacyTables.Length > 0)
            {
                throw new InvalidOperationException(
                    $"Database exists without migrations history but is missing expected tables: {string.Join(", ", missingLegacyTables)}.");
            }

            if (!userTables.Contains("RefreshSessions"))
            {
                await EnsureRefreshSessionsTableAsync(context, cancellationToken);
            }

            var firstMigration = context.Database.GetMigrations().FirstOrDefault();
            if (string.IsNullOrWhiteSpace(firstMigration))
            {
                throw new InvalidOperationException("No EF migrations are available to initialize the database.");
            }

            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT OR IGNORE INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
                VALUES ({firstMigration}, {"10.0.0"});
                """, cancellationToken);
        }
        finally
        {
            await context.Database.CloseConnectionAsync();
        }
    }

    private static async Task EnsureMigrationsHistoryTableAsync(AppDbContext context, CancellationToken cancellationToken)
    {
        await context.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
                "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
                "ProductVersion" TEXT NOT NULL
            );
            """, cancellationToken);
    }

    private static async Task EnsureRefreshSessionsTableAsync(AppDbContext context, CancellationToken cancellationToken)
    {
        await context.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "RefreshSessions" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_RefreshSessions" PRIMARY KEY,
                "UserId" INTEGER NOT NULL,
                "TokenHash" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                "ExpiresAt" TEXT NOT NULL,
                "RevokedAt" TEXT NULL,
                "ReplacedBySessionId" TEXT NULL,
                CONSTRAINT "FK_RefreshSessions_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
            );
            """, cancellationToken);

        await context.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_RefreshSessions_TokenHash"
            ON "RefreshSessions" ("TokenHash");
            """, cancellationToken);

        await context.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_RefreshSessions_UserId"
            ON "RefreshSessions" ("UserId");
            """, cancellationToken);
    }

    private static async Task<bool> HasAppliedMigrationsAsync(AppDbContext context, CancellationToken cancellationToken)
    {
        using var command = context.Database.GetDbConnection().CreateCommand();
        command.CommandText = """
            SELECT COUNT(*)
            FROM "__EFMigrationsHistory";
            """;

        var result = await command.ExecuteScalarAsync(cancellationToken);
        var count = Convert.ToInt64(result ?? 0, CultureInfo.InvariantCulture);
        return count > 0;
    }

    private static async Task<HashSet<string>> GetSqliteTableNamesAsync(AppDbContext context, CancellationToken cancellationToken)
    {
        using var command = context.Database.GetDbConnection().CreateCommand();
        command.CommandText = """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name NOT LIKE 'sqlite_%';
            """;

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var tables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        while (await reader.ReadAsync(cancellationToken))
        {
            tables.Add(reader.GetString(0));
        }

        return tables;
    }
}

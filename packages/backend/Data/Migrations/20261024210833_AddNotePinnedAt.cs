using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Flashpad.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNotePinnedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PinnedAt",
                table: "Notes",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PinnedAt",
                table: "Notes");
        }
    }
}

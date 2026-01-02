# Backend API

.NET 9 Web API with SQLite, Entity Framework Core, and JWT authentication.

## Structure

```
backend/
├── Controllers/       # API controllers
│   ├── AuthController.cs
│   └── UsersController.cs
├── Data/             # Database context
│   └── AppDbContext.cs
├── DTOs/             # Data transfer objects
│   └── UserDtos.cs
├── Models/           # Entity models
│   └── User.cs
├── Services/         # Business logic
│   ├── IAuthService.cs
│   └── AuthService.cs
├── Program.cs        # Application entry point
└── appsettings.json  # Configuration
```

## Running

```bash
# Development
dotnet run

# With hot reload
dotnet watch run

# Build for production
dotnet build --configuration Release
```

## API Endpoints

### Public Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Protected Endpoints (Require JWT token)
- `GET /api/users/me` - Get current user
- `PUT /api/users/me` - Update current user

## Configuration

Edit `appsettings.json`:

- **ConnectionStrings**: Database connection
- **JwtSettings**: JWT configuration (secret key, issuer, audience)

**Security Note**: Change the JWT secret key in production!

## Database Migrations

This template uses `EnsureCreated()` for simplicity. For production, use migrations:

```bash
# Install EF tools
dotnet tool install --global dotnet-ef

# Create migration
dotnet ef migrations add InitialCreate

# Update database
dotnet ef database update
```

## Switching Databases

### SQL Server
```bash
dotnet add package Microsoft.EntityFrameworkCore.SqlServer
```

Update `Program.cs`:
```csharp
options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"))
```

### PostgreSQL
```bash
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
```

Update `Program.cs`:
```csharp
options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
```

## Adding New Endpoints

1. Create a new controller in `Controllers/`
2. Add business logic in `Services/` if needed
3. Define DTOs in `DTOs/` for request/response
4. Update models in `Models/` if database changes are needed

## Security Features

- Password hashing with BCrypt
- JWT token authentication
- CORS enabled for development
- Input validation with data annotations
- Unique constraints on username and email

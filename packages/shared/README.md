# Shared Package

Shared TypeScript types and API client used by both Electron and React Native apps.

## Structure

```
shared/
├── src/
│   ├── types.ts       # Shared type definitions
│   ├── api-client.ts  # API client class
│   └── index.ts       # Main export
├── dist/              # Compiled JavaScript (generated)
├── package.json
└── tsconfig.json
```

## Building

```bash
# Build once
npm run build

# Watch mode (rebuild on changes)
npm run watch
```

## Usage

The shared package is used by both Electron and React Native apps:

```typescript
import { ApiClient, User, LoginDto, RegisterDto } from '@flashpad/shared';

// Create API client
const api = new ApiClient('http://localhost:5000');

// Login
const response = await api.login({ username, password });
api.setToken(response.token);

// Get current user
const user = await api.getCurrentUser();

// Update user
const updated = await api.updateCurrentUser({ email: 'new@email.com' });

// Logout
api.logout();
```

## Types

### User
```typescript
interface User {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  createdAt: string;
  updatedAt: string;
}
```

### DTOs
- `RegisterDto`: Registration data
- `LoginDto`: Login credentials
- `UpdateUserDto`: User update data
- `AuthResponse`: Authentication response with token
- `ApiError`: Error response

## Adding New Types

1. Define types in `src/types.ts`
2. Export from `src/index.ts`
3. Rebuild: `npm run build`
4. Types are automatically available in Electron and React Native

## Adding New API Methods

1. Add method to `ApiClient` class in `src/api-client.ts`
2. Rebuild: `npm run build`
3. Use in apps:
   ```typescript
   const result = await api.yourNewMethod();
   ```

## Development

When actively developing the shared package:

```bash
# In shared package directory
npm run watch
```

This will automatically rebuild when you make changes to the shared code.

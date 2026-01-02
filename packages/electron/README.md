# Electron Desktop App

Cross-platform desktop application built with Electron, React, Vite, and TypeScript.

## Structure

```
electron/
├── electron/          # Electron main process
│   ├── main.ts       # Main process entry
│   └── preload.ts    # Preload script
├── src/              # React application
│   ├── pages/        # Page components
│   ├── App.tsx       # Main app component
│   ├── AuthContext.tsx
│   └── main.tsx      # React entry point
├── index.html        # HTML template
├── vite.config.ts    # Vite configuration
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Features

- ⚡ **Vite**: Fast development with Hot Module Replacement
- 🔐 **Authentication**: JWT-based user authentication
- 🔄 **Auto-Updates**: Automatic updates via electron-updater
- 🎨 **React Router**: Client-side routing
- 💾 **Local Storage**: Persistent user sessions

## Auto-Updates

The app checks for updates on launch using electron-updater and GitHub Releases.

### Setup Auto-Updates

1. Update `package.json` with your GitHub repo:
   ```json
   "build": {
     "publish": {
       "provider": "github",
       "owner": "your-username",
       "repo": "your-repo"
     }
   }
   ```

2. Build the app:
   ```bash
   npm run build
   ```

3. Create a GitHub release and upload the build artifacts from `release/`

4. The app will auto-update when users launch it

## Building

### All Platforms
```bash
npm run build
```

### Specific Platform
```bash
# macOS only
electron-builder --mac

# Windows only
electron-builder --win

# Linux only
electron-builder --linux
```

## Customization

### App Name & ID
Update in `package.json`:
```json
{
  "name": "your-app-name",
  "build": {
    "appId": "com.yourcompany.yourapp"
  }
}
```

### Window Size
Edit `electron/main.ts`:
```typescript
mainWindow = new BrowserWindow({
  width: 1200,  // Change width
  height: 800,  // Change height
  // ...
});
```

### Backend URL
Update in `src/AuthContext.tsx`:
```typescript
const API_URL = 'http://your-backend-url';
```

## Adding New Pages

1. Create component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation link where needed

## Icons

Replace these files with your own icons:
- `build/icon.icns` (macOS)
- `build/icon.ico` (Windows)
- `build/icon.png` (Linux)

## Code Signing (Production)

For distribution, you'll need to sign your app:

### macOS
- Requires Apple Developer account
- Configure in `package.json`:
  ```json
  "mac": {
    "identity": "Your Name",
    "hardenedRuntime": true,
    "entitlements": "build/entitlements.mac.plist"
  }
  ```

### Windows
- Obtain a code signing certificate
- Configure in `package.json`:
  ```json
  "win": {
    "certificateFile": "path/to/cert.pfx",
    "certificatePassword": "your-password"
  }
  ```

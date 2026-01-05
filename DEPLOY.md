# Flashpad Deployment Guide

## Electron App Releases

### How Releases Work

Releases are triggered **only** when you push a version tag. Regular commits do not trigger releases.

```yaml
# From .github/workflows/release.yml
on:
  push:
    tags:
      - 'v*.*.*'
```

### Creating a Release

1. Update the version in `packages/electron/package.json`
2. Commit your changes
3. Create and push a version tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

This will automatically:
- Build for Windows (.exe installer + portable)
- Build for macOS (.dmg for Apple Silicon)
- Build for Linux (.AppImage + .deb)
- Create a GitHub Release with all artifacts
- Upload auto-update manifest files

### Release Artifacts

| Platform | Files |
|----------|-------|
| Windows | `Flashpad-Setup-X.X.X.exe` (installer), `Flashpad-X.X.X.exe` (portable) |
| macOS | `Flashpad-X.X.X-arm64.dmg` |
| Linux | `Flashpad-X.X.X-x86_64.AppImage`, `Flashpad-X.X.X-amd64.deb` |

### Auto-Updates

The Electron app checks for updates on launch. When a new release is available:
1. Update downloads automatically in the background
2. User is notified when download completes
3. Update installs when the app is quit

## Server Deployment

### Infrastructure

| Domain | Purpose |
|--------|---------|
| `api.flashpad.cc` | Backend API + SignalR WebSocket |
| `flashpad.cc` | Web application (React SPA) |

### Server Setup

The server runs Ubuntu 24.04 with:
- .NET 9 ASP.NET Runtime
- Caddy as reverse proxy
- systemd for process management

#### Initial Setup

Upload and run the setup script:

```bash
scp deploy/setup-server.sh jeremy@flashpad.cc:~/
ssh jeremy@flashpad.cc
sudo bash ~/setup-server.sh
```

This creates:
- `/var/www/flashpad/api/` - Backend API
- `/var/www/flashpad/web/` - Web app static files
- `/var/www/flashpad/backups/` - Database backups

### Deploying Updates

Deployment uses passwordless sudo for specific commands (configured in `/etc/sudoers.d/flashpad-deploy`).

#### Backend

```bash
# Build
cd packages/backend
dotnet publish -c Release -o publish

# Copy to temp directory
ssh jeremy@flashpad.cc "mkdir -p /tmp/flashpad-deploy"
scp -r publish/* jeremy@flashpad.cc:/tmp/flashpad-deploy/

# Deploy and restart
ssh jeremy@flashpad.cc "sudo /bin/systemctl stop flashpad-api && \
  sudo /bin/cp -r /tmp/flashpad-deploy/* /var/www/flashpad/api/ && \
  sudo /bin/chown -R www-data:www-data /var/www/flashpad/ && \
  sudo /bin/systemctl start flashpad-api && \
  rm -rf /tmp/flashpad-deploy"
```

#### Web App

```bash
# Build
cd packages/web
npm run build

# Copy to temp directory
ssh jeremy@flashpad.cc "mkdir -p /tmp/flashpad-deploy-web"
scp -r dist/* jeremy@flashpad.cc:/tmp/flashpad-deploy-web/

# Deploy
ssh jeremy@flashpad.cc "sudo /bin/cp -r /tmp/flashpad-deploy-web/* /var/www/flashpad/web/ && \
  sudo /bin/chown -R www-data:www-data /var/www/flashpad/web/ && \
  rm -rf /tmp/flashpad-deploy-web"
```

#### Passwordless Sudo Setup

The following commands are configured for passwordless sudo in `/etc/sudoers.d/flashpad-deploy`:

```
jeremy ALL=(ALL) NOPASSWD: /bin/systemctl stop flashpad-api
jeremy ALL=(ALL) NOPASSWD: /bin/systemctl start flashpad-api
jeremy ALL=(ALL) NOPASSWD: /bin/systemctl restart flashpad-api
jeremy ALL=(ALL) NOPASSWD: /bin/cp -r /tmp/flashpad-deploy/* /var/www/flashpad/api/
jeremy ALL=(ALL) NOPASSWD: /bin/cp -r /tmp/flashpad-deploy-web/* /var/www/flashpad/web/
jeremy ALL=(ALL) NOPASSWD: /bin/chown -R www-data\:www-data /var/www/flashpad/*
```

### Server Management

```bash
# Check API status
ssh jeremy@flashpad.cc "sudo systemctl status flashpad-api"

# View API logs
ssh jeremy@flashpad.cc "sudo journalctl -u flashpad-api -f"

# Restart API
ssh jeremy@flashpad.cc "sudo systemctl restart flashpad-api"

# Manual database backup
ssh jeremy@flashpad.cc "sudo /var/www/flashpad/backup.sh"
```

### Caddy Configuration

Located at `/etc/caddy/Caddyfile`:

```caddyfile
api.flashpad.cc {
    reverse_proxy localhost:5000
}

flashpad.cc {
    root * /var/www/flashpad/web
    file_server
    try_files {path} /index.html
}
```

Reload after changes: `sudo systemctl reload caddy`

## Environment Configuration

### Development vs Production

| Package | Dev Config | Prod Config |
|---------|------------|-------------|
| Web | `.env.development` | `.env.production` |
| Electron | `.env.development` | `.env.production` |
| Mobile | `src/config.ts` → `USE_PRODUCTION = false` | `USE_PRODUCTION = true` |
| Backend | `appsettings.json` | `appsettings.Production.json` |

### Running Locally Against Production

```bash
# Electron app pointing to production API
npm run electron:prod

# Web app pointing to production API
npm run web:prod
```

### API URLs

| Environment | URL |
|-------------|-----|
| Local Development | `http://localhost:5000` |
| Production | `https://api.flashpad.cc` |
| Android Emulator (local) | `http://10.0.2.2:5000` |

## Database

### Location

- **Development**: `packages/backend/flashpad.db`
- **Production**: `/var/www/flashpad/api/flashpad.db`

### Backups

Automatic daily backups run at 2 AM via cron. Backups are stored in `/var/www/flashpad/backups/` and kept for 7 days.

Manual backup:
```bash
ssh jeremy@flashpad.cc "sudo /var/www/flashpad/backup.sh"
```

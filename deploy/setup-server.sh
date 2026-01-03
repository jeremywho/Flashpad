#!/bin/bash
# Flashpad Server Setup Script
# Run this on the server as: sudo bash setup-server.sh

set -e

echo "=== Flashpad Server Setup ==="

# 1. Install .NET 9 ASP.NET Runtime
echo ""
echo "Step 1: Installing .NET 9 Runtime..."

apt-get update
apt-get install -y wget

# Use official dotnet-install script for .NET 9
wget https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh
chmod +x /tmp/dotnet-install.sh

# Install ASP.NET Core runtime 9.0 system-wide
/tmp/dotnet-install.sh --channel 9.0 --runtime aspnetcore --install-dir /usr/share/dotnet
rm /tmp/dotnet-install.sh

# Create symlink if it doesn't exist
if [ ! -f /usr/bin/dotnet ]; then
    ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet
fi

echo "Verifying .NET installation..."
dotnet --list-runtimes

# 2. Create directory structure
echo ""
echo "Step 2: Creating directory structure..."
mkdir -p /var/www/flashpad/api
mkdir -p /var/www/flashpad/web
mkdir -p /var/www/flashpad/backups

# 3. Move deployed files from home directory if they exist
echo ""
echo "Step 3: Moving deployed files..."
if [ -d "/home/jeremy/flashpad-deploy/api" ]; then
    cp -r /home/jeremy/flashpad-deploy/api/* /var/www/flashpad/api/
    echo "Copied API files"
fi
if [ -d "/home/jeremy/flashpad-deploy/web" ]; then
    cp -r /home/jeremy/flashpad-deploy/web/* /var/www/flashpad/web/
    echo "Copied web files"
fi

# 4. Set ownership
echo ""
echo "Step 4: Setting directory permissions..."
chown -R www-data:www-data /var/www/flashpad

# 5. Create systemd service
echo ""
echo "Step 5: Creating systemd service..."
cat > /etc/systemd/system/flashpad-api.service << 'EOF'
[Unit]
Description=Flashpad API
After=network.target

[Service]
WorkingDirectory=/var/www/flashpad/api
ExecStart=/usr/bin/dotnet Flashpad.dll
Restart=always
RestartSec=10
SyslogIdentifier=flashpad-api
User=www-data
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://localhost:5000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable flashpad-api

# 6. Update Caddy configuration
echo ""
echo "Step 6: Updating Caddy configuration..."
cat > /etc/caddy/Caddyfile << 'EOF'
# API with WebSocket support for SignalR
api.flashpad.cc {
    reverse_proxy localhost:5000
}

# Web application
flashpad.cc {
    root * /var/www/flashpad/web
    file_server

    # SPA fallback - serve index.html for client-side routing
    try_files {path} /index.html
}

# Redirect www to non-www
www.flashpad.cc {
    redir https://flashpad.cc{uri} permanent
}

# Netdata monitoring (password protected)
monitor.flashpad.cc {
    basic_auth {
        jeremy $2a$14$DHrvos7WdPlx0.hjA4mjruxreM7A7HpXuO1wz6IXhN/m5hsr/YVPS
    }
    reverse_proxy localhost:19999
}
EOF

# 7. Reload Caddy
echo ""
echo "Step 7: Reloading Caddy..."
systemctl reload caddy

# 8. Create backup script
echo ""
echo "Step 8: Creating backup script..."
cat > /var/www/flashpad/backup.sh << 'EOF'
#!/bin/bash
# Flashpad database backup script
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/www/flashpad/backups
DB_PATH=/var/www/flashpad/api/flashpad.db

# Create backup
cp "$DB_PATH" "$BACKUP_DIR/flashpad_$DATE.db"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "flashpad_*.db" -mtime +7 -delete

echo "Backup created: flashpad_$DATE.db"
EOF

chmod +x /var/www/flashpad/backup.sh

# 9. Add daily backup cron job
echo ""
echo "Step 9: Setting up daily backup cron job..."
(crontab -l 2>/dev/null | grep -v "flashpad/backup.sh"; echo "0 2 * * * /var/www/flashpad/backup.sh") | crontab -

# 10. Start the API service
echo ""
echo "Step 10: Starting Flashpad API..."
systemctl start flashpad-api

echo ""
echo "=== Server Setup Complete ==="
echo ""
echo "Checking service status..."
systemctl status flashpad-api --no-pager
echo ""
echo "You can check logs with: journalctl -u flashpad-api -f"
echo ""

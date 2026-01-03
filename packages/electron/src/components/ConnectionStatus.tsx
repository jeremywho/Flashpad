import { useState } from 'react';
import { ConnectionState, DevicePresence } from '@shared/index';
import { SyncStatus } from '../services/syncManager';

interface ConnectionStatusProps {
  connectionState: ConnectionState;
  syncStatus: SyncStatus;
  pendingCount: number;
  connectedDevices?: DevicePresence[];
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export default function ConnectionStatus({
  connectionState,
  syncStatus,
  pendingCount,
  connectedDevices = [],
}: ConnectionStatusProps) {
  const [showDevices, setShowDevices] = useState(false);

  // Show syncing status if actively syncing
  if (syncStatus === 'syncing') {
    return (
      <div className="connection-status syncing">
        <span className="connection-status-dot" />
        <span className="connection-status-label">
          Syncing{pendingCount > 0 ? ` (${pendingCount})` : '...'}
        </span>
      </div>
    );
  }

  // Show pending count if there are unsent changes
  if (pendingCount > 0) {
    return (
      <div className="connection-status pending">
        <span className="connection-status-dot" />
        <span className="connection-status-label">
          {pendingCount} pending change{pendingCount !== 1 ? 's' : ''}
        </span>
      </div>
    );
  }

  // Show connection state issues
  if (connectionState !== 'connected') {
    const getStatusInfo = () => {
      switch (connectionState) {
        case 'connecting':
          return { label: 'Connecting...', className: 'connecting' };
        case 'reconnecting':
          return { label: 'Reconnecting...', className: 'reconnecting' };
        case 'disconnected':
          return { label: 'Offline', className: 'disconnected' };
        default:
          return { label: 'Unknown', className: '' };
      }
    };

    const { label, className } = getStatusInfo();

    return (
      <div className={`connection-status ${className}`}>
        <span className="connection-status-dot" />
        <span className="connection-status-label">{label}</span>
      </div>
    );
  }

  // Show connected devices when online
  if (connectedDevices.length > 0) {
    return (
      <div className="connection-status connected">
        <button
          className="connection-status-button"
          onClick={() => setShowDevices(!showDevices)}
          title="Connected devices"
        >
          <span className="connection-status-dot" />
          <span className="connection-status-label">
            {connectedDevices.length} device{connectedDevices.length !== 1 ? 's' : ''} online
          </span>
        </button>
        {showDevices && (
          <div className="connection-status-dropdown">
            <div className="connection-status-dropdown-header">Connected Devices</div>
            {connectedDevices.map((device) => (
              <div key={device.deviceId} className="connection-status-device">
                <span className="connection-status-device-name">{device.deviceName}</span>
                <span className="connection-status-device-time">
                  {formatRelativeTime(device.connectedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Connected but no presence info
  return null;
}

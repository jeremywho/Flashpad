import { ConnectionState } from '@shared/index';
import { SyncStatus } from '../services/syncManager';

interface ConnectionStatusProps {
  connectionState: ConnectionState;
  syncStatus: SyncStatus;
  pendingCount: number;
}

export default function ConnectionStatus({
  connectionState,
  syncStatus,
  pendingCount,
}: ConnectionStatusProps) {
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

  // Everything is good, don't show anything
  return null;
}

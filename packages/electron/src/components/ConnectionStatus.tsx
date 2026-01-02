import { ConnectionState } from '@shared/index';

interface ConnectionStatusProps {
  state: ConnectionState;
}

export default function ConnectionStatus({ state }: ConnectionStatusProps) {
  if (state === 'connected') {
    return null; // Don't show anything when connected
  }

  const getStatusInfo = () => {
    switch (state) {
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

import * as signalR from '@microsoft/signalr';
import { Note, Category } from './types';
import { h4 } from './h4-client';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface DevicePresence {
  deviceId: string;
  deviceName: string;
  connectedAt: string;
  lastSeen: string;
}

export interface SignalRClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  deviceId?: string;
  deviceName?: string;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onNoteCreated?: (note: Note) => void;
  onNoteUpdated?: (note: Note) => void;
  onNoteDeleted?: (noteId: string) => void;
  onNoteStatusChanged?: (note: Note) => void;
  onCategoryCreated?: (category: Category) => void;
  onCategoryUpdated?: (category: Category) => void;
  onCategoryDeleted?: (categoryId: string) => void;
  onPresenceUpdated?: (devices: DevicePresence[]) => void;
  onDeviceConnected?: (device: DevicePresence) => void;
  onDeviceDisconnected?: (device: DevicePresence) => void;
  onAuthError?: () => void;
  onReconnected?: () => void;
}

export class SignalRClient {
  private connection: signalR.HubConnection | null = null;
  private options: SignalRClientOptions;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private startPromise: Promise<void> | null = null;

  constructor(options: SignalRClientOptions) {
    this.options = options;
  }

  /**
   * Update callbacks without reconnecting. Useful for React re-renders.
   * Immediately notifies the new callback of the current connection state.
   */
  updateCallbacks(callbacks: Partial<SignalRClientOptions>): void {
    Object.assign(this.options, callbacks);
    // Immediately notify the new callback of the current state
    // This handles the case where the connection is already established
    // but the React component re-rendered and has a new callback
    if (callbacks.onConnectionStateChange) {
      callbacks.onConnectionStateChange(this.connectionState);
    }
  }

  private setConnectionState(state: ConnectionState) {
    const previous = this.connectionState;
    this.connectionState = state;
    h4.info('SignalR state changed', {
      from: previous,
      to: state,
      deviceId: this.options.deviceId,
      reconnectAttempts: this.reconnectAttempts,
    });
    this.options.onConnectionStateChange?.(state);
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async start(): Promise<void> {
    const token = this.options.getToken();
    if (!token) {
      h4.warning('SignalR start skipped: no token', { deviceId: this.options.deviceId });
      return;
    }

    // If already connected, no-op
    if (this.connectionState === 'connected' && this.connection) {
      h4.debug('SignalR start skipped: already connected', { deviceId: this.options.deviceId });
      return;
    }

    // If already starting, return the existing promise to prevent duplicate connections
    if (this.startPromise && this.connectionState === 'connecting') {
      h4.debug('SignalR start skipped: already connecting', { deviceId: this.options.deviceId });
      return this.startPromise;
    }

    // If there's an existing connection, stop it first
    if (this.connection) {
      h4.info('SignalR stopping existing connection before restart', { deviceId: this.options.deviceId });
      await this.stop();
    }

    this.setConnectionState('connecting');
    this.startPromise = this.doStart();
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.options.baseUrl}/hubs/notes`, {
        accessTokenFactory: () => this.options.getToken() ?? '',
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Exponential backoff: 0s, 2s, 4s, 8s, 16s, then cap at 30s
          if (retryContext.previousRetryCount >= this.maxReconnectAttempts) {
            return null; // Stop reconnecting
          }
          const delay = Math.min(Math.pow(2, retryContext.previousRetryCount) * 1000, 30000);
          return delay;
        },
      })
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Register event handlers
    this.connection.on('NoteCreated', (note: Note) => {
      h4.info('SignalR received: NoteCreated', { noteId: note.id, version: note.version, categoryId: note.categoryId, status: note.status, deviceId: note.deviceId });
      this.options.onNoteCreated?.(note);
    });

    this.connection.on('NoteUpdated', (note: Note) => {
      h4.info('SignalR received: NoteUpdated', { noteId: note.id, version: note.version, categoryId: note.categoryId, status: note.status, deviceId: note.deviceId });
      this.options.onNoteUpdated?.(note);
    });

    this.connection.on('NoteDeleted', (noteId: string) => {
      h4.info('SignalR received: NoteDeleted', { noteId });
      this.options.onNoteDeleted?.(noteId);
    });

    this.connection.on('NoteStatusChanged', (note: Note) => {
      h4.info('SignalR received: NoteStatusChanged', { noteId: note.id, status: note.status, version: note.version, deviceId: note.deviceId });
      this.options.onNoteStatusChanged?.(note);
    });

    this.connection.on('CategoryCreated', (category: Category) => {
      h4.info('SignalR received: CategoryCreated', { categoryId: category.id, name: category.name });
      this.options.onCategoryCreated?.(category);
    });

    this.connection.on('CategoryUpdated', (category: Category) => {
      h4.info('SignalR received: CategoryUpdated', { categoryId: category.id, name: category.name });
      this.options.onCategoryUpdated?.(category);
    });

    this.connection.on('CategoryDeleted', (categoryId: string) => {
      h4.info('SignalR received: CategoryDeleted', { categoryId });
      this.options.onCategoryDeleted?.(categoryId);
    });

    // Presence event handlers
    this.connection.on('PresenceUpdated', (devices: DevicePresence[]) => {
      h4.info('SignalR received: PresenceUpdated', { deviceCount: devices.length, devices: devices.map(d => d.deviceId).join(',') });
      this.options.onPresenceUpdated?.(devices);
    });

    this.connection.on('DeviceConnected', (device: DevicePresence) => {
      h4.info('SignalR received: DeviceConnected', { connectedDeviceId: device.deviceId, deviceName: device.deviceName });
      this.options.onDeviceConnected?.(device);
    });

    this.connection.on('DeviceDisconnected', (device: DevicePresence) => {
      h4.warning('SignalR received: DeviceDisconnected', { disconnectedDeviceId: device.deviceId, deviceName: device.deviceName });
      this.options.onDeviceDisconnected?.(device);
    });

    // Handle connection state changes
    this.connection.onreconnecting((error) => {
      h4.warning('SignalR reconnecting', {
        attempt: this.reconnectAttempts + 1,
        maxAttempts: this.maxReconnectAttempts,
        error: error?.message,
        deviceId: this.options.deviceId,
      });
      this.setConnectionState('reconnecting');
      this.reconnectAttempts++;
    });

    this.connection.onreconnected((connectionId) => {
      h4.info('SignalR reconnected', {
        connectionId,
        attemptsUsed: this.reconnectAttempts,
        deviceId: this.options.deviceId,
      });
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;

      // Re-register device after reconnection
      if (this.options.deviceId && this.options.deviceName) {
        this.registerDevice(this.options.deviceId, this.options.deviceName);
      }

      // Notify consumer to catch up on events missed during disconnection
      this.options.onReconnected?.();
    });

    this.connection.onclose((error) => {
      h4.warning('SignalR connection closed', {
        hadError: !!error,
        error: error?.message,
        deviceId: this.options.deviceId,
        reconnectAttempts: this.reconnectAttempts,
      });
      this.setConnectionState('disconnected');
      if (error) {
        console.error('SignalR connection closed with error:', error);
        // Detect auth-related closure (401/403 from server)
        const msg = error.message?.toLowerCase() ?? '';
        if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')) {
          this.options.onAuthError?.();
        }
      }
    });

    try {
      await this.connection.start();
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      h4.info('SignalR connected successfully', { deviceId: this.options.deviceId, deviceName: this.options.deviceName });

      // Register device for presence tracking if device info provided
      if (this.options.deviceId && this.options.deviceName) {
        await this.registerDevice(this.options.deviceId, this.options.deviceName);
      }
    } catch (error) {
      h4.error('SignalR failed to connect', { error: (error as Error).message, deviceId: this.options.deviceId });
      this.setConnectionState('disconnected');
      throw error;
    } finally {
      this.startPromise = null;
    }
  }

  async registerDevice(deviceId: string, deviceName: string): Promise<void> {
    if (!this.connection || this.connectionState !== 'connected') {
      h4.warning('SignalR cannot register device: not connected', { deviceId, connectionState: this.connectionState });
      return;
    }
    try {
      await this.connection.invoke('RegisterDevice', deviceId, deviceName);
      h4.info('SignalR device registered', { deviceId, deviceName });
    } catch (error) {
      h4.error('SignalR failed to register device', { deviceId, error: (error as Error).message });
    }
  }

  async getPresence(): Promise<void> {
    if (!this.connection || this.connectionState !== 'connected') {
      console.warn('SignalR: Cannot get presence - not connected');
      return;
    }
    try {
      await this.connection.invoke('GetPresence');
    } catch (error) {
      console.error('SignalR: Failed to get presence:', error);
    }
  }

  async stop(): Promise<void> {
    this.startPromise = null;
    if (this.connection) {
      h4.info('SignalR stopping connection', { deviceId: this.options.deviceId });
      try {
        await this.connection.stop();
      } catch (error) {
        h4.error('SignalR error stopping connection', { error: (error as Error).message });
      }
      this.connection = null;
      this.setConnectionState('disconnected');
    }
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }
}

/**
 * Singleton manager for SignalR connections.
 * Ensures only one connection per baseUrl exists across React re-renders.
 */
class SignalRManagerClass {
  private instances = new Map<string, SignalRClient>();

  /**
   * Get or create a SignalR client for the given baseUrl.
   * If a client already exists, updates its callbacks and returns it.
   */
  getInstance(options: SignalRClientOptions): SignalRClient {
    const key = options.baseUrl;
    let client = this.instances.get(key);

    if (client) {
      // Update callbacks without reconnecting
      client.updateCallbacks(options);
    } else {
      client = new SignalRClient(options);
      this.instances.set(key, client);
    }

    return client;
  }

  /**
   * Remove and stop a client instance (e.g., on logout).
   */
  async removeInstance(baseUrl: string): Promise<void> {
    const client = this.instances.get(baseUrl);
    if (client) {
      await client.stop();
      this.instances.delete(baseUrl);
    }
  }

  /**
   * Stop and remove all instances.
   */
  async clear(): Promise<void> {
    for (const client of this.instances.values()) {
      await client.stop();
    }
    this.instances.clear();
  }
}

export const SignalRManager = new SignalRManagerClass();

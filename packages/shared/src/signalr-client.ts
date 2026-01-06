import * as signalR from '@microsoft/signalr';
import { Note, Category } from './types';

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
   */
  updateCallbacks(callbacks: Partial<SignalRClientOptions>): void {
    Object.assign(this.options, callbacks);
  }

  private setConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.options.onConnectionStateChange?.(state);
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async start(): Promise<void> {
    const token = this.options.getToken();
    if (!token) {
      console.log('SignalR: No token available, skipping connection');
      return;
    }

    // If already connected, no-op
    if (this.connectionState === 'connected' && this.connection) {
      return;
    }

    // If already starting, return the existing promise to prevent duplicate connections
    if (this.startPromise && this.connectionState === 'connecting') {
      return this.startPromise;
    }

    // If there's an existing connection, stop it first
    if (this.connection) {
      await this.stop();
    }

    this.setConnectionState('connecting');
    this.startPromise = this.doStart();
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    const token = this.options.getToken()!;

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.options.baseUrl}/hubs/notes`, {
        accessTokenFactory: () => token,
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
      this.options.onNoteCreated?.(note);
    });

    this.connection.on('NoteUpdated', (note: Note) => {
      this.options.onNoteUpdated?.(note);
    });

    this.connection.on('NoteDeleted', (noteId: string) => {
      this.options.onNoteDeleted?.(noteId);
    });

    this.connection.on('NoteStatusChanged', (note: Note) => {
      this.options.onNoteStatusChanged?.(note);
    });

    this.connection.on('CategoryCreated', (category: Category) => {
      this.options.onCategoryCreated?.(category);
    });

    this.connection.on('CategoryUpdated', (category: Category) => {
      this.options.onCategoryUpdated?.(category);
    });

    this.connection.on('CategoryDeleted', (categoryId: string) => {
      this.options.onCategoryDeleted?.(categoryId);
    });

    // Presence event handlers
    this.connection.on('PresenceUpdated', (devices: DevicePresence[]) => {
      this.options.onPresenceUpdated?.(devices);
    });

    this.connection.on('DeviceConnected', (device: DevicePresence) => {
      this.options.onDeviceConnected?.(device);
    });

    this.connection.on('DeviceDisconnected', (device: DevicePresence) => {
      this.options.onDeviceDisconnected?.(device);
    });

    // Handle connection state changes
    this.connection.onreconnecting(() => {
      this.setConnectionState('reconnecting');
      this.reconnectAttempts++;
    });

    this.connection.onreconnected(() => {
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
    });

    this.connection.onclose((error) => {
      this.setConnectionState('disconnected');
      if (error) {
        console.error('SignalR connection closed with error:', error);
      }
    });

    try {
      await this.connection.start();
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      console.log('SignalR: Connected successfully');

      // Register device for presence tracking if device info provided
      if (this.options.deviceId && this.options.deviceName) {
        await this.registerDevice(this.options.deviceId, this.options.deviceName);
      }
    } catch (error) {
      this.setConnectionState('disconnected');
      console.error('SignalR: Failed to connect:', error);
      throw error;
    } finally {
      this.startPromise = null;
    }
  }

  async registerDevice(deviceId: string, deviceName: string): Promise<void> {
    if (!this.connection || this.connectionState !== 'connected') {
      console.warn('SignalR: Cannot register device - not connected');
      return;
    }
    try {
      await this.connection.invoke('RegisterDevice', deviceId, deviceName);
    } catch (error) {
      console.error('SignalR: Failed to register device:', error);
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
      try {
        await this.connection.stop();
      } catch (error) {
        console.error('SignalR: Error stopping connection:', error);
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

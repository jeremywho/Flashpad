import * as signalR from '@microsoft/signalr';
import { Note, Category } from './types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface SignalRClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onNoteCreated?: (note: Note) => void;
  onNoteUpdated?: (note: Note) => void;
  onNoteDeleted?: (noteId: string) => void;
  onNoteStatusChanged?: (note: Note) => void;
  onCategoryCreated?: (category: Category) => void;
  onCategoryUpdated?: (category: Category) => void;
  onCategoryDeleted?: (categoryId: string) => void;
}

export class SignalRClient {
  private connection: signalR.HubConnection | null = null;
  private options: SignalRClientOptions;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(options: SignalRClientOptions) {
    this.options = options;
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

    if (this.connection) {
      await this.stop();
    }

    this.setConnectionState('connecting');

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
    } catch (error) {
      this.setConnectionState('disconnected');
      console.error('SignalR: Failed to connect:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
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

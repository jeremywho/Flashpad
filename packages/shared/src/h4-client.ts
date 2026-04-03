/**
 * Client-side H4 logger.
 * Buffers log entries and sends them in batches to /api/client-logs on the backend,
 * which forwards them to the H4 observability platform.
 */

export interface H4ClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  source: string; // 'electron' | 'web'
  deviceId: string;
  flushIntervalMs?: number;
  bufferSize?: number;
}

interface LogEntry {
  level: string;
  message: string;
  source: string;
  deviceId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

class H4ClientLogger {
  private options: H4ClientOptions | null = null;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  init(options: H4ClientOptions): void {
    this.options = options;
    const interval = options.flushIntervalMs ?? 5000;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => this.flush(), interval);
    // Flush any logs buffered before init
    this.flush();
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('Debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('Info', message, metadata);
  }

  warning(message: string, metadata?: Record<string, unknown>): void {
    this.log('Warning', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('Error', message, metadata);
  }

  private log(level: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      source: this.options?.source ?? 'unknown',
      deviceId: this.options?.deviceId ?? 'unknown',
      timestamp: new Date().toISOString(),
      metadata,
    };
    this.buffer.push(entry);

    // Auto-flush if buffer is full
    if (this.buffer.length >= (this.options?.bufferSize ?? 20)) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (!this.options || this.buffer.length === 0 || this.flushing) return;

    this.flushing = true;
    const batch = [...this.buffer];
    this.buffer = [];

    try {
      const token = this.options.getToken();
      if (!token) {
        // No token, put logs back
        this.buffer.unshift(...batch);
        return;
      }

      const response = await fetch(`${this.options.baseUrl}/api/client-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ logs: batch }),
      });

      if (!response.ok) {
        // Non-retryable errors (auth, bad request) - drop the logs
        if (response.status === 401 || response.status === 400) {
          console.warn(`[h4-client] Dropping ${batch.length} logs: HTTP ${response.status}`);
          return;
        }
        // Retryable - put them back
        this.buffer.unshift(...batch);
      }
    } catch {
      // Network error - put logs back for retry
      this.buffer.unshift(...batch);
      // Cap buffer to prevent unbounded growth while offline
      if (this.buffer.length > 200) {
        this.buffer = this.buffer.slice(-200);
      }
    } finally {
      this.flushing = false;
    }
  }
}

/** Singleton client-side H4 logger. Call h4.init() before use. */
export const h4 = new H4ClientLogger();

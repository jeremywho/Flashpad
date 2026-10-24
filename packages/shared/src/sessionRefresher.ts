import { HttpError } from './types';

export const REFRESH_BUFFER_MS = 60 * 1000;
const RETRY_BASE_MS = 5 * 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;

export function isRefreshRejected(error: unknown): boolean {
  return error instanceof HttpError
    && error.status >= 400
    && error.status < 500
    && error.status !== 408
    && error.status !== 429;
}

export function refreshRetryDelayMs(consecutiveFailures: number): number {
  const exponent = Math.max(consecutiveFailures - 1, 0);
  return Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
}

export interface SessionRefresherOptions {
  getAccessTokenExpiryMs: () => number | null;
  refresh: () => Promise<void>;
  onRejected: () => void;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class SessionRefresher {
  private timer: unknown = null;
  private inFlight: Promise<boolean> | null = null;
  private consecutiveFailures = 0;
  private running = false;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: SessionRefresherOptions) {
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer
      ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    this.running = true;
    this.consecutiveFailures = 0;
    this.scheduleFromExpiry();
  }

  stop(): void {
    this.running = false;
    this.cancelTimer();
  }

  refreshNow(): Promise<boolean> {
    if (!this.running) return Promise.resolve(false);
    if (this.inFlight) return this.inFlight;
    this.cancelTimer();
    this.inFlight = this.attempt().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  refreshIfDue(): void {
    if (!this.running || this.inFlight) return;
    if (this.consecutiveFailures > 0 || this.msUntilDue() <= 0) {
      void this.refreshNow();
    }
  }

  private msUntilDue(): number {
    const expiryMs = this.options.getAccessTokenExpiryMs();
    if (expiryMs === null) return 0;
    return expiryMs - REFRESH_BUFFER_MS - this.now();
  }

  private scheduleFromExpiry(): void {
    this.schedule(Math.max(this.msUntilDue(), 0));
  }

  private schedule(delayMs: number): void {
    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.refreshNow();
    }, delayMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private async attempt(): Promise<boolean> {
    try {
      await this.options.refresh();
    } catch (error) {
      if (!this.running) return false;
      if (isRefreshRejected(error)) {
        this.stop();
        this.options.onRejected();
        return false;
      }
      this.consecutiveFailures += 1;
      this.schedule(refreshRetryDelayMs(this.consecutiveFailures));
      return false;
    }

    if (!this.running) return false;
    this.consecutiveFailures = 0;
    this.scheduleFromExpiry();
    return true;
  }
}

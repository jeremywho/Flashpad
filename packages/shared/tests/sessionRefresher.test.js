const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SessionRefresher,
  isRefreshRejected,
  refreshRetryDelayMs,
  REFRESH_BUFFER_MS,
} = require('../dist/sessionRefresher');
const { HttpError } = require('../dist/types');

function createHarness({ refresh, expiryMs = null }) {
  const state = {
    nowMs: 1_000_000,
    expiryMs,
    timers: [],
    rejectedCount: 0,
    refreshCount: 0,
  };
  const refresher = new SessionRefresher({
    getAccessTokenExpiryMs: () => state.expiryMs,
    refresh: async () => {
      state.refreshCount += 1;
      await refresh(state);
    },
    onRejected: () => {
      state.rejectedCount += 1;
    },
    now: () => state.nowMs,
    setTimer: (callback, delayMs) => {
      const timer = { callback, delayMs, cleared: false };
      state.timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timer.cleared = true;
    },
  });
  const pendingTimers = () => state.timers.filter((timer) => !timer.cleared);
  const fire = (timer) => {
    timer.cleared = true;
    timer.callback();
  };
  return { refresher, state, pendingTimers, fire };
}

test('isRefreshRejected only treats definitive client errors as a rejected session', () => {
  assert.equal(isRefreshRejected(new HttpError(401, 'Invalid refresh token')), true);
  assert.equal(isRefreshRejected(new HttpError(400, 'Bad request')), true);
  assert.equal(isRefreshRejected(new HttpError(403, 'Forbidden')), true);
  assert.equal(isRefreshRejected(new HttpError(408, 'Timeout')), false);
  assert.equal(isRefreshRejected(new HttpError(429, 'Too many')), false);
  assert.equal(isRefreshRejected(new HttpError(502, 'Bad Gateway')), false);
  assert.equal(isRefreshRejected(new HttpError(503, 'Unavailable')), false);
  assert.equal(isRefreshRejected(new TypeError('Failed to fetch')), false);
});

test('refreshRetryDelayMs backs off exponentially and caps at five minutes', () => {
  assert.equal(refreshRetryDelayMs(1), 5_000);
  assert.equal(refreshRetryDelayMs(2), 10_000);
  assert.equal(refreshRetryDelayMs(3), 20_000);
  assert.equal(refreshRetryDelayMs(20), 300_000);
});

test('a network failure keeps the session and schedules a backoff retry', async () => {
  const { refresher, state, pendingTimers } = createHarness({
    refresh: async () => {
      throw new TypeError('Failed to fetch');
    },
  });

  refresher.start();
  const refreshed = await refresher.refreshNow();

  assert.equal(refreshed, false);
  assert.equal(state.rejectedCount, 0);
  assert.equal(refresher.isRunning, true);
  assert.deepEqual(pendingTimers().map((timer) => timer.delayMs), [5_000]);
});

test('a 502 during a server restart keeps the session and recovers on retry', async () => {
  let serverUp = false;
  const { refresher, state, pendingTimers, fire } = createHarness({
    refresh: async (harnessState) => {
      if (!serverUp) throw new HttpError(502, 'Bad Gateway');
      harnessState.expiryMs = harnessState.nowMs + 15 * 60 * 1000;
    },
  });

  refresher.start();
  await refresher.refreshNow();
  assert.equal(state.rejectedCount, 0);

  serverUp = true;
  const [retry] = pendingTimers();
  fire(retry);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.refreshCount, 2);
  assert.equal(state.rejectedCount, 0);
  assert.deepEqual(pendingTimers().map((timer) => timer.delayMs), [15 * 60 * 1000 - REFRESH_BUFFER_MS]);
});

test('a rejected refresh token signs out exactly once and stops scheduling', async () => {
  const { refresher, state, pendingTimers } = createHarness({
    refresh: async () => {
      throw new HttpError(401, 'Invalid refresh token');
    },
  });

  refresher.start();
  const refreshed = await refresher.refreshNow();

  assert.equal(refreshed, false);
  assert.equal(state.rejectedCount, 1);
  assert.equal(refresher.isRunning, false);
  assert.equal(pendingTimers().length, 0);
});

test('concurrent refresh requests share one in-flight refresh', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { refresher, state } = createHarness({
    refresh: async (harnessState) => {
      await gate;
      harnessState.expiryMs = harnessState.nowMs + 15 * 60 * 1000;
    },
  });

  refresher.start();
  const first = refresher.refreshNow();
  const second = refresher.refreshNow();
  release();

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(state.refreshCount, 1);
});

test('refreshIfDue refreshes after a sleep that outlived the access token', async () => {
  const { refresher, state } = createHarness({
    refresh: async (harnessState) => {
      harnessState.expiryMs = harnessState.nowMs + 15 * 60 * 1000;
    },
    expiryMs: 1_000_000 + 15 * 60 * 1000,
  });

  refresher.start();
  refresher.refreshIfDue();
  assert.equal(state.refreshCount, 0);

  state.nowMs += 60 * 60 * 1000;
  refresher.refreshIfDue();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.refreshCount, 1);
  assert.equal(state.rejectedCount, 0);
});

test('refreshIfDue retries immediately after a failure instead of waiting out the backoff', async () => {
  let online = false;
  const { refresher, state } = createHarness({
    refresh: async (harnessState) => {
      if (!online) throw new TypeError('Failed to fetch');
      harnessState.expiryMs = harnessState.nowMs + 15 * 60 * 1000;
    },
  });

  refresher.start();
  await refresher.refreshNow();
  online = true;
  refresher.refreshIfDue();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.refreshCount, 2);
  assert.equal(state.rejectedCount, 0);
});

test('a refresh that finishes after stop does not reschedule or sign out', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { refresher, state, pendingTimers } = createHarness({
    refresh: async () => {
      await gate;
      throw new HttpError(401, 'Invalid refresh token');
    },
  });

  refresher.start();
  const pending = refresher.refreshNow();
  refresher.stop();
  release();

  assert.equal(await pending, false);
  assert.equal(state.rejectedCount, 0);
  assert.equal(pendingTimers().length, 0);
});

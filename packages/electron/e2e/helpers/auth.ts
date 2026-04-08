/**
 * Register and login a test user directly via the API.
 * Returns the JWT token and credentials.
 */
export async function registerAndLogin(
  baseUrl: string,
  username: string = 'e2etestuser',
  password: string = 'TestPassword123!'
): Promise<{ token: string; username: string; password: string }> {
  // Register (may fail if user already exists — that's fine)
  try {
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email: `${username}@flashpad-e2e.test`,
        password,
        fullName: 'E2E Test User',
      }),
    });
  } catch {
    // User may already exist
  }

  // Login (uses username, not email)
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }

  const data = await loginRes.json();
  return { token: data.token, username, password };
}

/**
 * Create a note directly via the API (bypass UI).
 */
export async function createNoteViaApi(
  baseUrl: string,
  token: string,
  content: string,
  categoryId?: string
): Promise<{ id: string; content: string; version: number }> {
  const res = await fetch(`${baseUrl}/api/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content, categoryId }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Create note failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

/**
 * Create a category directly via the API.
 */
export async function createCategoryViaApi(
  baseUrl: string,
  token: string,
  name: string,
  color: string = '#6366f1'
): Promise<{ id: string; name: string }> {
  const res = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, color }),
  });

  if (!res.ok) {
    throw new Error(`Create category failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

/**
 * Get all notes via the API.
 */
export async function getNotesViaApi(
  baseUrl: string,
  token: string
): Promise<{ notes: Array<{ id: string; content: string; categoryId?: string; status: number }> }> {
  const res = await fetch(`${baseUrl}/api/notes?pageSize=1000`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Get notes failed: ${res.status}`);
  }

  return res.json();
}

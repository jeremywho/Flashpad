const DEVICE_ID_KEY = 'flashpad-device-id';

let cachedDeviceId: string | null = null;

function createDeviceId(): string {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getOrCreateWebDeviceId(): string {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  const storedDeviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (storedDeviceId) {
    cachedDeviceId = storedDeviceId;
    return storedDeviceId;
  }

  const nextDeviceId = createDeviceId();
  localStorage.setItem(DEVICE_ID_KEY, nextDeviceId);
  cachedDeviceId = nextDeviceId;
  return nextDeviceId;
}

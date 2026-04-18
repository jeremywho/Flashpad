import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'flashpad-device-id';

let cachedDeviceId: string | null = null;

function createDeviceId(): string {
  return `mobile-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function getOrCreateMobileDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  const storedDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (storedDeviceId) {
    cachedDeviceId = storedDeviceId;
    return storedDeviceId;
  }

  const nextDeviceId = createDeviceId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, nextDeviceId);
  cachedDeviceId = nextDeviceId;
  return nextDeviceId;
}

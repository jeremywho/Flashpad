import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ApiEnvironment = 'production' | 'local';

const PRODUCTION_API_URL = 'https://api.flashpad.cc';
const CONFIG_KEY = '@flashpad_api_environment';
const LEGACY_CONFIG_KEY = '@flashpad_use_production';
const STORAGE_NAMESPACE_PREFIX = '@flashpad';

const isDevBuild = typeof __DEV__ === 'boolean' ? __DEV__ : true;

const listeners = new Set<(environment: ApiEnvironment) => void>();

// Local development URLs vary by platform
const getLocalApiUrl = () => {
  if (Platform.OS === 'android') {
    // Android emulator uses 10.0.2.2 to reach host machine's localhost
    return 'http://10.0.2.2:5000';
  }
  // iOS simulator uses localhost, physical device needs your machine's IP
  return 'http://localhost:5000';
};

// Runtime configuration state
// Default to production for Release builds, local for Debug
let _environment: ApiEnvironment = isDevBuild ? 'local' : 'production';
let _initialized = false;

export const initConfig = async (): Promise<void> => {
  try {
    const storedEnvironment = await AsyncStorage.getItem(CONFIG_KEY);

    if (isApiEnvironment(storedEnvironment)) {
      _environment = storedEnvironment;
    } else {
      const legacyStored = await AsyncStorage.getItem(LEGACY_CONFIG_KEY);
      if (legacyStored !== null) {
        _environment = legacyStored === 'true' ? 'production' : 'local';
        await AsyncStorage.setItem(CONFIG_KEY, _environment);
        await AsyncStorage.removeItem(LEGACY_CONFIG_KEY);
      }
    }
    _initialized = true;
  } catch {
    // Keep default based on __DEV__
    _initialized = true;
  }
};

function isApiEnvironment(value: string | null): value is ApiEnvironment {
  return value === 'production' || value === 'local';
}

function notifyListeners(environment: ApiEnvironment): void {
  listeners.forEach((listener) => listener(environment));
}

export const getApiEnvironment = (): ApiEnvironment => {
  return _environment;
};

export const getApiUrl = (): string => {
  if (!_initialized) {
    console.warn('Config not initialized, using default (local dev)');
  }
  return _environment === 'production' ? PRODUCTION_API_URL : getLocalApiUrl();
};

export const isUsingProduction = (): boolean => {
  return _environment === 'production';
};

export const subscribeToConfigChanges = (
  listener: (environment: ApiEnvironment) => void
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getNamespacedStorageKey = (
  storageKey: string,
  environment: ApiEnvironment = _environment
): string => {
  return `${STORAGE_NAMESPACE_PREFIX}:${environment}:${storageKey}`;
};

export const setApiEnvironment = async (environment: ApiEnvironment): Promise<void> => {
  const previousEnvironment = _environment;
  await AsyncStorage.setItem(CONFIG_KEY, environment);
  _environment = environment;

  if (previousEnvironment !== environment) {
    notifyListeners(environment);
  }
};

export const setUseProduction = async (value: boolean): Promise<void> => {
  await setApiEnvironment(value ? 'production' : 'local');
};

// For backwards compatibility
export const API_URL = PRODUCTION_API_URL; // Will be overridden after init

export const config = {
  get apiUrl() {
    return getApiUrl();
  },
  get isProduction() {
    return _environment === 'production';
  },
  get environment() {
    return _environment;
  },
};

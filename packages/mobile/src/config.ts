import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTION_API_URL = 'https://api.flashpad.cc';
const CONFIG_KEY = '@flashpad_use_production';

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
let _useProduction = !__DEV__;
let _initialized = false;

export const initConfig = async (): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(CONFIG_KEY);
    // Only override if explicitly set, otherwise use default based on build type
    if (stored !== null) {
      _useProduction = stored === 'true';
    }
    _initialized = true;
  } catch {
    // Keep default based on __DEV__
    _initialized = true;
  }
};

export const getApiUrl = (): string => {
  if (!_initialized) {
    console.warn('Config not initialized, using default (local dev)');
  }
  return _useProduction ? PRODUCTION_API_URL : getLocalApiUrl();
};

export const isUsingProduction = (): boolean => {
  return _useProduction;
};

export const setUseProduction = async (value: boolean): Promise<void> => {
  _useProduction = value;
  await AsyncStorage.setItem(CONFIG_KEY, value.toString());
};

// For backwards compatibility
export const API_URL = PRODUCTION_API_URL; // Will be overridden after init

export const config = {
  get apiUrl() {
    return getApiUrl();
  },
  get isProduction() {
    return _useProduction;
  },
};

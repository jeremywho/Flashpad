import { Platform } from 'react-native';

// Environment configuration
// Change USE_PRODUCTION to true to point to production API
const USE_PRODUCTION = false;

const PRODUCTION_API_URL = 'https://api.flashpad.cc';

// Local development URLs vary by platform
const getLocalApiUrl = () => {
  if (Platform.OS === 'android') {
    // Android emulator uses 10.0.2.2 to reach host machine's localhost
    return 'http://10.0.2.2:5000';
  }
  // iOS simulator and physical devices on same network can use localhost
  return 'http://localhost:5000';
};

export const API_URL = USE_PRODUCTION ? PRODUCTION_API_URL : getLocalApiUrl();

export const config = {
  apiUrl: API_URL,
  isProduction: USE_PRODUCTION,
};

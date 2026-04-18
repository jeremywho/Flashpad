# React Native Mobile App

Cross-platform mobile application for iOS and Android built with React Native CLI and TypeScript.

## Structure

```
mobile/
├── src/
│   ├── contexts/      # React contexts
│   │   └── AuthContext.tsx
│   ├── navigation/    # Navigation setup
│   │   └── AppNavigator.tsx
│   └── screens/       # Screen components
│       ├── LoginScreen.tsx
│       ├── RegisterScreen.tsx
│       ├── HomeScreen.tsx
│       └── AccountScreen.tsx
├── android/           # Android native code
├── ios/              # iOS native code
├── App.tsx           # App entry point
└── package.json
```

## Prerequisites

### iOS Development (macOS only)
- Xcode 15+
- CocoaPods: `sudo gem install cocoapods`
- iOS Simulator or physical device

### Android Development
- Android Studio
- Android SDK (API 34+)
- JDK 17+
- Android Emulator or physical device
- In this npm-workspaces repo, Gradle resolves `@react-native/gradle-plugin` from the workspace root `node_modules` first and falls back to the package-local install if needed.

## Setup

```bash
# Install dependencies
npm install

# iOS only: Install pods
cd ios && pod install && cd ..
```

## Running

### iOS
```bash
# Start Metro bundler
npm start

# In another terminal
npm run ios

# Specific device
npm run ios --simulator="iPhone 15 Pro"
```

### Android
```bash
# Start Metro bundler
npm start

# In another terminal
npm run android

# Specific device
npm run android --deviceId=<device-id>
```

## Backend Configuration

Update the API URL in `src/contexts/AuthContext.tsx`:

```typescript
// For Android Emulator
const API_URL = 'http://10.0.2.2:5000';

// For iOS Simulator
const API_URL = 'http://localhost:5000';

// For Physical Device (replace with your computer's IP)
const API_URL = 'http://192.168.1.100:5000';
```

To find your computer's IP:
- macOS: System Settings > Network
- Windows: `ipconfig` in Command Prompt
- Linux: `ifconfig` or `ip addr`

## Building for Production

### Android

Release builds require a private keystore supplied through Gradle properties or environment variables:

- `FLASHPAD_RELEASE_STORE_FILE`
- `FLASHPAD_RELEASE_STORE_PASSWORD`
- `FLASHPAD_RELEASE_KEY_ALIAS`
- `FLASHPAD_RELEASE_KEY_PASSWORD`

You can pass them either with `-P` or as environment variables when invoking Gradle. The app build fails closed if a `release` task is requested without these values, and it refuses the public debug keystore and debug signing credentials.

#### Release APK
```bash
cd android
./gradlew assembleRelease
```
Output: `android/app/build/outputs/apk/release/app-release.apk`

#### App Bundle (for Play Store)
```bash
cd android
./gradlew bundleRelease
```
Output: `android/app/build/outputs/bundle/release/app-release.aab`

### iOS

1. Open workspace in Xcode:
   ```bash
   open ios/mobile.xcworkspace
   ```

2. Select scheme: Product > Scheme > Edit Scheme > Release

3. Archive: Product > Archive

4. Distribute: Organizer > Distribute App

## Features

- 📱 **Native Navigation**: React Navigation 7
- 🔐 **Authentication**: JWT with AsyncStorage
- 🎨 **Styled Components**: Custom styling with StyleSheet
- 📦 **Type Safety**: Full TypeScript support

## Troubleshooting

### Metro Bundler Cache
```bash
npm start -- --reset-cache
```

### Android Build Errors
```bash
cd android
./gradlew clean
cd ..
rm -rf node_modules
npm install
```

### iOS Build Errors
```bash
cd ios
pod deintegrate
pod install
cd ..
```

### Network Issues
- Android Emulator: Make sure to use `10.0.2.2` not `localhost`
- iOS Simulator: Can use `localhost`
- Physical Devices: Use your computer's IP address
- Check firewall settings allow connections on port 5000

## Learn More

- [React Native Website](https://reactnative.dev)
- [React Navigation](https://reactnavigation.org/)
- [TypeScript](https://www.typescriptlang.org/)

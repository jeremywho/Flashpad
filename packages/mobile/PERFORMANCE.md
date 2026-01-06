# React Native Performance Optimizations

This document outlines the performance optimizations implemented in the Flashpad mobile app.

## Overview

The Flashpad mobile app has been optimized for performance across multiple areas including rendering, bundling, and native builds.

## Implemented Optimizations

### 1. JavaScript/React Optimizations

#### Component Memoization
- **React.memo**: Applied to `AppContent` and `ToastItem` components to prevent unnecessary re-renders
- **useCallback**: Used in AuthContext (`login`, `logout`, `loadUser`) and ThemeContext (`setThemeMode`, `loadTheme`)
- **useMemo**: Applied to context values and computed values to prevent recalculation on every render
  - `AuthContext`: Context value memoized
  - `ThemeContext`: `theme`, `isDark`, and context value memoized

#### List Performance (HomeScreen)
- **getItemLayout**: Configured with fixed height (100px) for optimal scroll performance
- **removeClippedSubviews**: Enabled to unmount offscreen components
- **Performance Props**:
  - `maxToRenderPerBatch: 10` - Limits items rendered per batch
  - `updateCellsBatchingPeriod: 50` - Throttles updates
  - `initialNumToRender: 15` - Initial render count
  - `windowSize: 10` - Number of screenfuls to maintain
- **renderItem**: Wrapped in `useCallback` with proper dependencies

### 2. Metro Bundler Configuration

Enhanced `metro.config.js` with:
- **Minification**: Optimized minifier config with proper settings
- **Source Maps**: Configured for production builds
- **Code Compression**: Enabled with safe transformations

### 3. Android Optimizations

#### Build Configuration (`android/app/build.gradle`)
- **ProGuard**: Enabled for release builds (`enableProguardInReleaseBuilds = true`)
- **Resource Shrinking**: Enabled to remove unused resources
- **NDK Debug Symbols**: Configured for better crash reporting

#### ProGuard Rules (`android/app/proguard-rules.pro`)
- Keep rules for React Native and Hermes
- Keep rules for Reanimated (gesture library)
- Optimization passes configured
- Safe obfuscation settings

#### Gradle Properties (`android/gradle.properties`)
- **Parallel Builds**: `org.gradle.parallel=true`
- **Gradle Daemon**: `org.gradle.daemon=true`
- **Configure on Demand**: `org.gradle.configureondemand=true`
- **Build Cache**: `org.gradle.caching=true`
- **JVM Args**: Optimized memory settings with heap dump support

### 4. iOS Optimizations

#### Podfile Configuration
- Deployment target optimization (iOS 13.4)
- Swift compilation optimizations
- Code signing optimizations for bundles

### 5. Architecture Features Already in Place

The app already has several excellent performance features:

- ✅ **Hermes Engine**: Enabled for faster startup and lower memory usage
- ✅ **New Architecture**: React Native's new architecture enabled
- ✅ **Code Splitting**: Lazy loading with React.lazy for authenticated screens
- ✅ **Offline-First**: Local database with smart syncing reduces network calls

## Performance Monitoring

### Recommended Tools

1. **React DevTools Profiler**: Monitor component render times
2. **Flipper**: Debug performance issues in development
3. **Android Studio Profiler**: Monitor memory, CPU, and network
4. **Xcode Instruments**: iOS performance profiling

### Key Metrics to Watch

- **JS Thread FPS**: Should stay at 60 FPS during scrolling
- **UI Thread FPS**: Should stay at 60 FPS
- **Memory Usage**: Watch for memory leaks
- **Bundle Size**: Monitor bundle size growth
- **Time to Interactive**: App startup time

## Best Practices

### Do's
- ✅ Use `FlatList` with `getItemLayout` for long lists
- ✅ Memoize expensive computations with `useMemo`
- ✅ Memoize callbacks with `useCallback`
- ✅ Use `React.memo` for components that render often with same props
- ✅ Keep render methods pure
- ✅ Use native driver for animations where possible
- ✅ Implement proper cleanup in `useEffect`

### Don'ts
- ❌ Don't use `ScrollView` for long lists (use `FlatList` instead)
- ❌ Don't create inline functions in render (use `useCallback`)
- ❌ Don't create inline objects/arrays in render (use `useMemo`)
- ❌ Don't perform heavy computations in render
- ❌ Don't forget to remove event listeners
- ❌ Don't use anonymous functions in list items

## Future Optimization Opportunities

1. **Image Optimization**
   - Implement progressive image loading
   - Use WebP format for images
   - Lazy load images in lists

2. **Code Splitting**
   - Further split screens and features
   - Implement route-based code splitting

3. **Bundle Analysis**
   - Analyze bundle size with Metro bundle visualizer
   - Remove unused dependencies

4. **State Management**
   - Consider implementing virtual scrolling for very large lists
   - Optimize SignalR reconnection logic

5. **Network**
   - Implement request batching
   - Add request caching layer
   - Optimize API payload sizes

## Testing Performance

### Development Build
```bash
# Android
npm run android

# iOS
npm run ios
```

### Release Build Testing
```bash
# Android
cd android && ./gradlew assembleRelease
# Install: adb install app/build/outputs/apk/release/app-release.apk

# iOS
# Build in Xcode with Release scheme
```

### Performance Benchmarks

You should monitor these after implementing optimizations:

- **List Scroll**: Should be smooth at 60 FPS with 100+ items
- **App Launch**: Cold start under 3 seconds
- **Screen Navigation**: Under 200ms
- **Search Performance**: Real-time search with no lag

## References

- [React Native Performance](https://reactnative.dev/docs/performance)
- [Optimizing Flatlist Configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)
- [Hermes Engine](https://reactnative.dev/docs/hermes)
- [ProGuard in Android](https://developer.android.com/studio/build/shrink-code)
- [Metro Bundler](https://facebook.github.io/metro/)

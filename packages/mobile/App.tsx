import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { ToastProvider } from './src/components/Toast';
import AppNavigator from './src/navigation/AppNavigator';
import { initConfig } from './src/config';

function AppContent() {
  const { isDark } = useTheme();

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <AuthProvider>
        <ToastProvider>
          <AppNavigator />
        </ToastProvider>
      </AuthProvider>
    </>
  );
}

function App() {
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    initConfig().then(() => {
      setConfigReady(true);
      BootSplash.hide({ fade: true });
    });
  }, []);

  // GestureHandlerRootView must wrap the entire app, including loading state
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {!configReady ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' }}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <SafeAreaProvider>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </SafeAreaProvider>
      )}
    </GestureHandlerRootView>
  );
}

export default App;

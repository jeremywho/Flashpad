import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { ToastProvider } from './src/components/Toast';
import AppNavigator from './src/navigation/AppNavigator';
import { getApiEnvironment, initConfig, subscribeToConfigChanges } from './src/config';

const AppContent = React.memo(function AppContent() {
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
});

function App() {
  const [configReady, setConfigReady] = useState(false);
  const [environment, setEnvironment] = useState(getApiEnvironment());

  useEffect(() => {
    let isMounted = true;

    initConfig().then(() => {
      if (!isMounted) {
        return;
      }

      setEnvironment(getApiEnvironment());
      setConfigReady(true);
      BootSplash.hide({ fade: true });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribeToConfigChanges((nextEnvironment) => {
      setEnvironment(nextEnvironment);
    });
  }, []);

  if (!configReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent key={environment} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;

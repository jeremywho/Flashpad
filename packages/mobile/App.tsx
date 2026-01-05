import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator, TextInput, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { ToastProvider } from './src/components/Toast';
import AppNavigator from './src/navigation/AppNavigator';
import { initConfig } from './src/config';

// TEMPORARY: Minimal test component to isolate lag issue
// Set to false to return to normal app
const MINIMAL_TEST = false;

function MinimalTest() {
  const [text, setText] = useState('');

  return (
    <View style={minStyles.container}>
      <Text style={minStyles.title}>Minimal Test</Text>
      <TextInput
        style={minStyles.input}
        value={text}
        onChangeText={setText}
        placeholder="Type here..."
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={minStyles.text}>You typed: {text}</Text>
    </View>
  );
}

const minStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 15, fontSize: 18, borderRadius: 8 },
  text: { marginTop: 20, fontSize: 16 },
});

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
    if (MINIMAL_TEST) {
      BootSplash.hide({ fade: true });
    } else {
      initConfig().then(() => {
        setConfigReady(true);
        BootSplash.hide({ fade: true });
      });
    }
  }, []);

  // TEMPORARY: Test with minimal component
  if (MINIMAL_TEST) {
    return <MinimalTest />;
  }

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
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;

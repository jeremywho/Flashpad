import React, { Suspense, lazy } from 'react';
import { NavigationContainer, DefaultTheme, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { ActivityIndicator, View, StyleSheet, Linking } from 'react-native';
import { colors } from '../theme/colors';

// Only import lightweight auth screens eagerly
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

// Lazy load the authenticated navigator (and all its heavy dependencies)
const AuthenticatedNavigator = lazy(() => import('./AuthenticatedNavigator'));

// Lightweight QuickCapture for unauthenticated deep links
const QuickCaptureScreen = lazy(() => import('../screens/QuickCaptureScreen'));

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  QuickCapture: undefined;
};

// Re-export the authenticated types for use elsewhere
export type { AuthenticatedStackParamList } from './AuthenticatedNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

// Deep linking configuration for unauthenticated flow
const unauthLinking: LinkingOptions<RootStackParamList> = {
  prefixes: ['flashpad://', 'https://flashpad.app'],
  config: {
    screens: {
      QuickCapture: 'quick-capture',
    },
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url != null) {
      return url;
    }
    return null;
  },
  subscribe(listener) {
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      listener(url);
    });

    return () => {
      linkingSubscription.remove();
    };
  },
};

// Deep linking configuration for authenticated flow
const authLinking = {
  prefixes: ['flashpad://', 'https://flashpad.app'],
  config: {
    screens: {
      QuickCapture: 'quick-capture',
      Home: 'home',
      NoteEditor: {
        path: 'note/:noteId?',
        parse: {
          noteId: (noteId: string) => noteId,
        },
      },
    },
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url != null) {
      return url;
    }
    return null;
  },
  subscribe(listener: (url: string) => void) {
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      listener(url);
    });

    return () => {
      linkingSubscription.remove();
    };
  },
};

function LoadingFallback() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

function AppNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingFallback />;
  }

  // If user is authenticated, render the authenticated navigator
  // wrapped in Suspense for lazy loading
  if (user) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <NavigationContainer theme={DarkTheme} linking={authLinking}>
          <AuthenticatedNavigator />
        </NavigationContainer>
      </Suspense>
    );
  }

  // Unauthenticated flow - lightweight screens only
  return (
    <NavigationContainer theme={DarkTheme} linking={unauthLinking}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontWeight: '600',
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="QuickCapture"
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        >
          {(props) => (
            <Suspense fallback={<LoadingFallback />}>
              <QuickCaptureScreen {...props} />
            </Suspense>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});

export default AppNavigator;

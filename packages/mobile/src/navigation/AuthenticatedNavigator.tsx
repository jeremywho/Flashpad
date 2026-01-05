import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';

import HomeScreen from '../screens/HomeScreen';
import AccountScreen from '../screens/AccountScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import QuickCaptureScreen from '../screens/QuickCaptureScreen';
import CategoryManagerScreen from '../screens/CategoryManagerScreen';

export type AuthenticatedStackParamList = {
  Home: undefined;
  Account: undefined;
  NoteEditor: { noteId?: string; isNew?: boolean };
  QuickCapture: undefined;
  CategoryManager: undefined;
};

const Stack = createNativeStackNavigator<AuthenticatedStackParamList>();

function AuthenticatedNavigator() {
  return (
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
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NoteEditor"
        component={NoteEditorScreen}
        options={({ route }) => ({
          title: route.params?.isNew ? 'New Note' : 'Edit Note',
          headerBackTitle: 'Back',
        })}
      />
      <Stack.Screen
        name="QuickCapture"
        component={QuickCaptureScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'Account Settings' }}
      />
      <Stack.Screen
        name="CategoryManager"
        component={CategoryManagerScreen}
        options={{ title: 'Manage Categories' }}
      />
    </Stack.Navigator>
  );
}

export default AuthenticatedNavigator;

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  BackHandler,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme/colors';
import { SyncManager } from '../services/syncManager';

interface QuickCaptureScreenProps {
  navigation: any;
}

function QuickCaptureScreen({ navigation }: QuickCaptureScreenProps) {
  const { api, user } = useAuth();
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const syncManagerRef = useRef<SyncManager | null>(null);

  useEffect(() => {
    // Focus the input when screen mounts
    setTimeout(() => {
      textInputRef.current?.focus();
    }, 100);

    // Initialize SyncManager
    const syncManager = new SyncManager({
      api,
      onSyncStatusChange: (status) => {
        setIsOffline(status === 'offline');
      },
    });
    syncManagerRef.current = syncManager;

    return () => {
      syncManager.destroy();
    };
  }, [api]);

  const handleCancel = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (user) {
      // Launched from lock screen / deep link with no back stack (cold start).
      // Reset to the Home screen so the user lands somewhere useful.
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } else {
      // Unauthenticated cold start from lock screen — no Home to go to.
      // Minimize the app, which is the expected cancel behaviour here.
      BackHandler.exitApp();
    }
  }, [navigation, user]);

  // Handle Android hardware back button when there is no back stack
  // (e.g. launched from lock screen quick settings tile or widget).
  useEffect(() => {
    const onBackPress = () => {
      if (!navigation.canGoBack()) {
        handleCancel();
        return true; // Prevent default (which does nothing anyway)
      }
      return false; // Let default back behaviour handle it
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress,
    );

    return () => {
      subscription.remove();
    };
  }, [navigation, handleCancel]);

  const handleSave = async () => {
    if (!content.trim() || !syncManagerRef.current) return;

    setIsSaving(true);
    setError(null);

    try {
      await syncManagerRef.current.createNote({
        content: content.trim(),
        deviceId: 'mobile-quick-capture',
      });
      setContent('');
      // Navigate back to home after saving
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.authMessage}>
          <Text style={styles.authMessageText}>
            Please log in to capture notes
          </Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginButtonText}>Log In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quick Capture</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerButton}
          disabled={!content.trim() || isSaving}
        >
          <Text
            style={[
              styles.headerButtonText,
              styles.saveButtonText,
              (!content.trim() || isSaving) && styles.disabledText,
            ]}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Offline - note will sync when connected
          </Text>
        </View>
      )}

      <TextInput
        ref={textInputRef}
        style={styles.textInput}
        value={content}
        onChangeText={setContent}
        placeholder="What's on your mind?"
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
        autoFocus
        returnKeyType="default"
      />

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerHint}>
          Capture now, organize later
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  saveButtonText: {
    color: colors.accent,
    fontWeight: '600',
  },
  disabledText: {
    color: colors.textMuted,
  },
  offlineBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offlineBannerText: {
    color: '#f59e0b',
    fontSize: 13,
    textAlign: 'center',
  },
  textInput: {
    flex: 1,
    padding: 24,
    fontSize: 18,
    lineHeight: 30,
    letterSpacing: 0.2,
    color: colors.text,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerHint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  authMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  authMessageText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default QuickCaptureScreen;

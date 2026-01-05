import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import RNRestart from 'react-native-restart';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { isUsingProduction, setUseProduction, getApiUrl } from '../config';

function AccountScreen() {
  const { user, api, logout } = useAuth();
  const { theme, themeMode, setThemeMode } = useTheme();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [useProduction, setUseProductionState] = useState(isUsingProduction());

  const handleApiToggle = async (value: boolean) => {
    setUseProductionState(value);
    await setUseProduction(value);
    Alert.alert(
      'Restart Required',
      `API changed to ${value ? 'Production' : 'Local Dev'}. The app needs to restart for changes to take effect.`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart Now', onPress: () => RNRestart.restart() },
      ]
    );
  };

  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setFullName(user.fullName || '');
    }
  }, [user]);

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await api.updateCurrentUser({
        email: email !== user?.email ? email : undefined,
        fullName: fullName !== user?.fullName ? fullName : undefined,
        password: password || undefined,
      });
      setSuccess('Account updated successfully!');
      setPassword('');
      Alert.alert('Success', 'Account updated successfully!');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Update failed';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContainer: {
      flexGrow: 1,
      paddingBottom: 40,
    },
    formContainer: {
      margin: 16,
      padding: 20,
      backgroundColor: theme.surface,
      borderRadius: 12,
    },
    section: {
      marginHorizontal: 16,
      marginTop: 16,
      padding: 20,
      backgroundColor: theme.surface,
      borderRadius: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 20,
      color: theme.text,
    },
    formGroup: {
      marginBottom: 16,
    },
    label: {
      marginBottom: 6,
      fontWeight: '500',
      color: theme.text,
      fontSize: 14,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.surfaceElevated,
      color: theme.text,
    },
    inputDisabled: {
      backgroundColor: theme.surfaceHover,
      color: theme.textSecondary,
    },
    helperText: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 4,
    },
    button: {
      backgroundColor: theme.accent,
      padding: 14,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 10,
    },
    buttonDisabled: {
      backgroundColor: theme.surfaceHover,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    error: {
      color: theme.danger,
      marginBottom: 10,
      textAlign: 'center',
    },
    success: {
      color: theme.success,
      marginBottom: 10,
      textAlign: 'center',
    },
    themeOptions: {
      flexDirection: 'row',
      gap: 10,
    },
    themeOption: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: theme.surfaceElevated,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    themeOptionActive: {
      borderColor: theme.accent,
      backgroundColor: theme.surfaceHover,
    },
    themeOptionText: {
      fontSize: 14,
      color: theme.textSecondary,
      fontWeight: '500',
    },
    themeOptionTextActive: {
      color: theme.accent,
      fontWeight: '600',
    },
    logoutButton: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      padding: 14,
      borderRadius: 8,
      alignItems: 'center',
    },
    logoutButtonText: {
      color: theme.danger,
      fontSize: 16,
      fontWeight: '600',
    },
    developerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    developerLabel: {
      fontSize: 16,
      color: theme.text,
      fontWeight: '500',
    },
    developerHint: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 4,
    },
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.formContainer}>
          <Text style={styles.title}>Account Settings</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={user?.username || ''}
              editable={false}
              placeholderTextColor={theme.textMuted}
            />
            <Text style={styles.helperText}>Username cannot be changed</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              autoCorrect={false}
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Leave blank to keep current"
              placeholderTextColor={theme.textMuted}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Update Account</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>

          <View style={styles.themeOptions}>
            {(['system', 'light', 'dark'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.themeOption,
                  themeMode === mode && styles.themeOptionActive,
                ]}
                onPress={() => setThemeMode(mode)}
              >
                <Text
                  style={[
                    styles.themeOptionText,
                    themeMode === mode && styles.themeOptionTextActive,
                  ]}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Developer</Text>
          <View style={styles.developerRow}>
            <Text style={styles.developerLabel}>Use Production API</Text>
            <Switch
              value={useProduction}
              onValueChange={handleApiToggle}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={useProduction ? '#fff' : '#f4f3f4'}
            />
          </View>
          <Text style={styles.developerHint}>
            Current: {getApiUrl()}
          </Text>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              Alert.alert('Logout', 'Are you sure you want to logout?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: logout },
              ]);
            }}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default AccountScreen;

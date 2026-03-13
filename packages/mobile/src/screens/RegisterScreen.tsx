import React, { useState } from 'react';
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
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fonts } from '../theme/fonts';

function RegisterScreen({ navigation }: any) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { api, login } = useAuth();
  const { theme } = useTheme();

  const handleSubmit = async () => {
    if (!username || !email || !password) {
      setError('Please fill in all required fields');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await api.register({
        username,
        email,
        password,
        fullName: fullName || undefined,
      });
      await login(response.token, response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
      justifyContent: 'center',
    },
    formContainer: {
      margin: 20,
      padding: 30,
      backgroundColor: theme.surface,
      borderRadius: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 5,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      fontFamily: fonts.semiBold,
      marginBottom: 20,
      textAlign: 'center',
      color: theme.text,
    },
    formGroup: {
      marginBottom: 20,
    },
    label: {
      marginBottom: 5,
      fontWeight: '500',
      fontFamily: fonts.medium,
      color: theme.text,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 10,
      fontSize: 16,
      fontFamily: fonts.regular,
      color: theme.text,
      backgroundColor: theme.surfaceVariant,
    },
    button: {
      backgroundColor: theme.accent,
      padding: 15,
      borderRadius: 4,
      alignItems: 'center',
      marginTop: 10,
    },
    buttonDisabled: {
      backgroundColor: theme.surfaceActive,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '500',
      fontFamily: fonts.medium,
    },
    error: {
      color: theme.danger,
      fontFamily: fonts.regular,
      marginBottom: 10,
      textAlign: 'center',
    },
    linkText: {
      marginTop: 20,
      textAlign: 'center',
      color: theme.textSecondary,
      fontFamily: fonts.regular,
    },
    link: {
      color: theme.accent,
      fontWeight: '500',
      fontFamily: fonts.medium,
    },
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.formContainer}>
          <Text style={styles.title}>Register</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={theme.textMuted}
            />
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
            <Text style={styles.label}>Full Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              autoCorrect={false}
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholderTextColor={theme.textMuted}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Register</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.link}>Login</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default RegisterScreen;

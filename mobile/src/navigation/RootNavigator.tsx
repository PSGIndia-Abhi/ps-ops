import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { BootSplashScreen } from '../screens/splash/BootSplashScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { AuthenticatedNavigator } from './AuthenticatedNavigator';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.primary,
    text: colors.textPrimary,
    border: colors.border,
    card: colors.surface,
  },
};

/**
 * Auth-gated navigation: which navigator is mounted is driven entirely by
 * AuthContext's status, the same way the web app's role/session state
 * decides what's reachable (see frontend/src/auth/ProtectedRoute.jsx). The
 * backend remains the actual authority - this only decides which screens the
 * mobile UI shows, never what data/actions those screens are allowed to use.
 *
 * Once signed in, `AuthenticatedNavigator` takes over entirely - it's a
 * full stack of its own (role tabs + shared detail screens), not a single
 * screen inside this one, so it swaps in as a sibling of the logged-out
 * Login/ForgotPassword stack rather than being nested inside it.
 */
export function RootNavigator() {
  const { status } = useAuth();

  if (status === 'bootstrapping') {
    return <BootSplashScreen />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {status === 'signedIn' ? (
        <AuthenticatedNavigator />
      ) : (
        <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ title: '' }}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

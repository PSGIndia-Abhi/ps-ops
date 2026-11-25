import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import { colors } from '../../theme';

/**
 * Shown only for the brief moment while we check whether a session is
 * already stored (Keychain read + one /api/auth/me call). Usually resolves
 * in well under a second on a warm app; this keeps that instant branded
 * instead of a blank white frame. LoginScreen has its own, fuller intro
 * animation for the actual "logged-out" first impression.
 */
export function BootSplashScreen() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <SafeAreaView style={styles.screen}>
      <Animated.View style={[styles.center, { opacity }]}>
        <BrandMark size={72} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

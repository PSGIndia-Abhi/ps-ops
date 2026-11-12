import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppSwitch } from './AppSwitchContext';

/**
 * A red number on the avatar that opens "Switch app": what waits in the person's other apps, not seen
 * yet. Put it inside the avatar (the avatar is the positioning box).
 */
export function SwitchCountBadge() {
  const { badgeTotal } = useAppSwitch();
  if (!badgeTotal) return null;
  return (
    <View style={styles.badge} accessibilityLabel={`${badgeTotal} new in your other apps`}>
      <Text style={styles.text}>{badgeTotal > 9 ? '9+' : badgeTotal}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
});

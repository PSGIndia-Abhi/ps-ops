import React, { useEffect, useRef } from 'react';
import { Animated, Easing, RefreshControl, StyleSheet } from 'react-native';
import { BrandLoader } from './BrandLoader';

/**
 * Pull-to-refresh with the BestServe loader instead of Android's round arrow.
 *
 * Android does not let an app draw its own pull spinner, so the system one is parked far above the
 * screen (the pull gesture still works exactly as before) and, once the person lets go, a small
 * BestServe loader slides open at the top of the content and folds away when fresh data is in.
 *
 *   <ScrollView refreshControl={brandRefreshControl(refreshing, onRefresh)}>
 *     <RefreshBanner refreshing={refreshing} />
 *     ...
 *   </ScrollView>
 *
 * For a FlatList, put <RefreshBanner/> at the top of ListHeaderComponent.
 */

/** The pull gesture, with the system spinner kept out of sight. */
export function brandRefreshControl(refreshing: boolean, onRefresh: () => void) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={['transparent']}
      progressBackgroundColor="transparent"
      tintColor="transparent"
      progressViewOffset={-1000}
    />
  );
}

const OPEN_HEIGHT = 70;
const MIN_VISIBLE_MS = 700;

/** The small loader strip at the top of the content while a refresh runs. */
export function RefreshBanner({ refreshing }: { refreshing: boolean }) {
  const open = useRef(new Animated.Value(refreshing ? 1 : 0)).current;
  const openedAt = useRef(0);

  useEffect(() => {
    const animate = (to: number) =>
      Animated.timing(open, {
        toValue: to,
        duration: to ? 220 : 260,
        easing: to ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
        useNativeDriver: false, // height can't use the native driver
      }).start();
    if (refreshing) {
      openedAt.current = Date.now();
      animate(1);
      return;
    }
    // A fast server would open and close it in a blink; once open, it stays for a calm moment.
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - openedAt.current));
    const timer = setTimeout(() => animate(0), wait);
    return () => clearTimeout(timer);
  }, [open, refreshing]);

  return (
    <Animated.View
      style={[styles.strip, { height: open.interpolate({ inputRange: [0, 1], outputRange: [0, OPEN_HEIGHT] }), opacity: open }]}
      pointerEvents="none"
    >
      <Animated.View style={{ transform: [{ scale: open.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        <BrandLoader size={42} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TrashIcon } from '../../components/icons';

/**
 * A photo preview popup: dimmed backdrop, the picture large in a rounded card (kept to its own
 * shape), its name, and Close / optional Remove. Tap outside or Back to close.
 */
export function ImagePreview({
  uri,
  title,
  onClose,
  onRemove,
}: {
  uri: string | null;
  title?: string;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [ratio, setRatio] = useState(1);
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!uri) return;
    Image.getSize(uri, (w, h) => h && setRatio(w / h), () => setRatio(1));
    scale.setValue(0.94);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [uri, scale, opacity]);

  // Fit the picture inside the screen, keeping its shape.
  const maxW = width - 40;
  const maxH = height * 0.62;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close preview" />
        <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]} pointerEvents="box-none">
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
            </Svg>
          </Pressable>
          {!!uri && <Image source={{ uri }} style={[styles.image, { width: w, height: h }]} resizeMode="cover" />}
          {!!title && (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
          <View style={styles.actions}>
            {onRemove && (
              <Pressable
                onPress={() => {
                  onRemove();
                  onClose();
                }}
                style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <TrashIcon size={17} color="#FFFFFF" />
                <Text style={styles.btnText}>Remove</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={({ pressed }) => [styles.btn, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.btnText}>Done</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,10,24,0.86)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  close: { alignSelf: 'flex-end', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  image: { borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.06)' },
  title: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 14, maxWidth: '90%' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 24, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.16)' },
  btnDanger: { backgroundColor: '#D93025' },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});

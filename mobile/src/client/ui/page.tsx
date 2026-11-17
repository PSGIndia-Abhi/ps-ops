import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StatusBar, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getToken } from '../../auth/tokenStorage';
import { ChevronLeftIcon, CloseIcon, DocumentIcon, GalleryIcon } from '../../components/icons';
import { API_BASE_URL } from '../../config/env';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmSkeleton } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';

/**
 * Page chrome shared by the client screens - the clean, white, Google-Pay-like
 * look of the client Home: a plain header, chips, tonal circles.
 */

export const PAGE_BG = (t: CrmTheme) => (t.isDark ? t.background : '#FFFFFF');
export const SOFT = (t: CrmTheme) => (t.isDark ? t.surfaceAlt : '#F1F3F4');

/** Google-style tonal pairs: soft circle + strong icon colour. */
export const TONES = {
  blue: { bg: '#E8F0FE', fg: '#1A73E8' },
  amber: { bg: '#FEF3C7', fg: '#D97706' },
  violet: { bg: '#F3E8FF', fg: '#7C3AED' },
  green: { bg: '#DCFCE7', fg: '#16A34A' },
  teal: { bg: '#CCFBF1', fg: '#0D9488' },
  rose: { bg: '#FFE4E6', fg: '#E11D48' },
  indigo: { bg: '#E0E7FF', fg: '#4F46E5' },
  orange: { bg: '#FFEDD5', fg: '#EA580C' },
  slate: { bg: '#F1F5F9', fg: '#64748B' },
  red: { bg: '#FEE2E2', fg: '#DC2626' },
} as const;
export type ToneKey = keyof typeof TONES;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: PAGE_BG(t) },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, paddingHorizontal: spacing.sm, minHeight: 56 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { ...typography.subtitle, fontSize: 18, color: t.textPrimary, flex: 1 },
  bigTitle: { ...typography.title, fontSize: 26, lineHeight: 32, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  bigSub: { ...typography.caption, color: t.textMuted, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  pressed: { opacity: 0.7 },
  chips: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: PAGE_BG(t),
  },
  chipOn: { backgroundColor: TONES.blue.bg, borderColor: TONES.blue.bg },
  chipText: { ...typography.captionMedium, fontSize: 13, color: t.textSecondary },
  chipTextOn: { color: TONES.blue.fg },
  chipCount: { ...typography.caption, fontSize: 12, color: t.textMuted },
  chipCountOn: { color: TONES.blue.fg },
  seg: { flexDirection: 'row' as const, marginHorizontal: spacing.lg, marginVertical: spacing.xs, padding: 4, borderRadius: radii.pill, backgroundColor: SOFT(t) },
  segItem: { flex: 1, minHeight: 38, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  segOn: { backgroundColor: PAGE_BG(t), ...t.cardShadow },
  segText: { ...typography.captionMedium, fontSize: 14, color: t.textMuted },
  segTextOn: { color: t.textPrimary },
  photoMissing: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: SOFT(t) },
  viewer: { flex: 1, backgroundColor: '#000000', alignItems: 'center' as const, justifyContent: 'center' as const },
  viewerImg: { width: '100%' as const, height: '80%' as const },
  viewerClose: { position: 'absolute' as const, right: spacing.md, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center' as const, justifyContent: 'center' as const },
  viewerCaption: { ...typography.bodyMedium, color: '#FFFFFF', marginTop: spacing.md },
});

/** White page with either a big title (tab screens) or a back header (pushed screens). */
export function ClientPage({
  title,
  subtitle,
  back,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const navigation = useNavigation();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {back ? (
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeftIcon size={22} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {right}
        </View>
      ) : (
        <>
          <Text style={styles.bigTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.bigSub}>{subtitle}</Text>}
        </>
      )}
      {children}
    </SafeAreaView>
  );
}

/** Horizontally scrolling filter chips with optional counts. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={[{ flexGrow: 0 }, style]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key || 'all'}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            {o.count !== undefined && <Text style={[styles.chipCount, on && styles.chipCountOn]}>{o.count}</Text>}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Two- or three-way pill switch (Jobs | Visits). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segItem, on && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The login token, for images and files that stream only with it. */
export function useAuthHeader(): string | null {
  const [header, setHeader] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getToken().then((token) => alive && token && setHeader(`Bearer ${token}`));
    return () => {
      alive = false;
    };
  }, []);
  return header;
}

/** A protected photo (job / complaint file) as a thumbnail; non-images show a file tile. */
export function PortalImage({
  path,
  size,
  radius = 14,
  isImage = true,
  onPress,
}: {
  path: string;
  size: number;
  radius?: number;
  isImage?: boolean;
  onPress?: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const auth = useAuthHeader();
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: radius, overflow: 'hidden' as const };
  if (!auth) return <CrmSkeleton width={size} height={size} radius={radius} />;
  if (!isImage || failed) {
    return (
      <Pressable onPress={onPress} style={[box, styles.photoMissing]} accessibilityRole="button">
        {isImage ? <GalleryIcon size={22} color={theme.textMuted} /> : <DocumentIcon size={22} color={theme.textMuted} />}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [box, pressed && styles.pressed]} accessibilityRole="imagebutton">
      <Image source={{ uri: `${API_BASE_URL}${path}`, headers: { Authorization: auth } }} style={{ width: size, height: size }} resizeMode="cover" onError={() => setFailed(true)} />
    </Pressable>
  );
}

/** Full-screen photo viewer. */
export function PhotoViewer({ path, caption, onClose }: { path: string | null; caption?: string; onClose: () => void }) {
  const { styles } = useCrmStyles(factory);
  const insets = useSafeAreaInsets();
  const auth = useAuthHeader();
  return (
    <Modal visible={!!path} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.viewer}>
        {!!path && !!auth && <Image source={{ uri: `${API_BASE_URL}${path}`, headers: { Authorization: auth } }} style={styles.viewerImg} resizeMode="contain" />}
        {!!caption && <Text style={styles.viewerCaption}>{caption}</Text>}
        <Pressable onPress={onClose} style={[styles.viewerClose, { top: insets.top + spacing.sm }]} accessibilityRole="button" accessibilityLabel="Close photo">
          <CloseIcon size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

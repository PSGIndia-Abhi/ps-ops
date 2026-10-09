import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ApiError } from '../api/httpClient';
import { useAuth } from '../auth/AuthContext';
import { useRawRole } from '../auth/role';
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  DocumentIcon,
  PhoneIcon,
  PinIcon,
  SparkleIcon,
  TagIcon,
  UsersIcon,
} from '../components/icons';
import { formatINR } from '../crm/format';
import { useCrmStyles, useCrmTheme, type CrmTheme } from '../crm/theme';
import { ClipboardListIcon } from '../crm/ui/crmIcons';
import { StatusBadge, toneColors, type Tone } from '../crm/ui/StatusBadge';
import { fmtDateShort, fmtTime, initials, todayStr } from '../tasks/format';
import { radii, spacing, typography } from '../theme';
import { leadPersonaForRole, nextStepLabel, STAGE_META } from './stage';
import type { LeadPersona, Meeting, PipelineLead, PipelineStage } from './types';

/** Shared building blocks for the lead screens - same look as the CRM and Task apps (CRM theme). */

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  pressed: { opacity: 0.75 },
  screenRoot: { flex: 1, backgroundColor: t.background },
  screenSafe: { flex: 1 },
  tile: {
    flex: 1,
    minHeight: 88,
    borderRadius: radii.lg,
    padding: spacing.sm,
    justifyContent: 'space-between' as const,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: t.isDark ? t.border : 'rgba(255,255,255,0.7)',
    ...t.cardShadow,
  },
  tileValue: { ...typography.title, fontSize: 24 },
  tileLabel: { ...typography.captionMedium },
  tileIcon: {
    position: 'absolute' as const,
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.75)',
  },
  timeChip: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.primarySoftBg,
    marginBottom: 4,
  },
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...t.cardShadow,
  },
  topTitleWrap: { flex: 1, marginHorizontal: spacing.sm },
  topTitle: { ...typography.subtitle, color: t.textPrimary },
  topSubtitle: { ...typography.caption, color: t.textMuted },
  button: {
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden' as const,
  },
  buttonFilled: { ...t.raisedShadow },
  buttonSecondary: { backgroundColor: t.isDark ? 'transparent' : 'rgba(255,255,255,0.7)', borderWidth: 1.5, borderColor: t.primary },
  buttonOff: { opacity: 0.5 },
  buttonContent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  buttonLabel: { ...typography.button },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  rowMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 6 },
  rowMetaText: { ...typography.caption, color: t.textSecondary, flexShrink: 1 },
  rowTop: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: spacing.xs },
  amount: { ...typography.captionMedium, color: t.textPrimary, marginTop: 4 },
  avatar: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { ...typography.bodyMedium },
  rowRight: { alignItems: 'flex-end' as const, gap: 6, maxWidth: '42%' as const },
  nextStep: { ...typography.caption, color: t.textMuted, textAlign: 'right' as const },
  fieldRow: { flexDirection: 'row' as const, gap: spacing.sm },
  fieldCell: { flex: 1 },
  timeCol: { width: 74 },
  timeText: { ...typography.captionMedium, color: t.textPrimary },
  rail: { width: 3, alignSelf: 'stretch' as const, backgroundColor: t.primarySoft, borderRadius: 2 },
  action: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.xs,
  },
  actionDivider: { borderTopWidth: 1, borderTopColor: t.border },
  actionIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center' as const, justifyContent: 'center' as const },
  actionTitle: { ...typography.bodyMedium, color: t.textPrimary },
  actionHint: { ...typography.caption, color: t.textMuted },
  fieldLabel: { ...typography.captionMedium, color: t.textSecondary, marginBottom: 6 },
  field: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  fieldValue: { ...typography.body, color: t.textPrimary, flex: 1 },
  fieldPlaceholder: { color: t.textMuted },
  radio: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 48 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioOuterOn: { borderColor: t.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary },
  radioLabel: { ...typography.body, color: t.textPrimary, flex: 1 },
  info: { flexDirection: 'row' as const, paddingVertical: spacing.xs, gap: spacing.sm },
  infoLabel: { ...typography.caption, color: t.textMuted, width: 104 },
  infoValue: { ...typography.body, color: t.textPrimary, flex: 1 },
  infoLink: { color: t.primary },
});

/** The signed-in user as the lead screens need it. */
export function useMe(): { myId: string; myIdNum: number; persona: LeadPersona } {
  const { user, session } = useAuth();
  const rawRole = useRawRole();
  const myId = String(user?.id ?? session?.userId ?? '');
  // Sales / marketing (and anything else let in) work leads as a sales executive.
  return { myId, myIdNum: Number(myId), persona: leadPersonaForRole(rawRole) ?? 'sales' };
}

export const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/**
 * Loads on every focus (so coming back from an action screen shows the new
 * state) and on pull-to-refresh. The spinner state is only "loading" until
 * there is something to show; later reloads keep the old data on screen.
 */
export function useLoad<T>(loader: () => Promise<T>, fallbackError: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may write state - an older, slower one must not overwrite it.
  const seq = useRef(0);

  const run = useCallback(
    async (pulled: boolean) => {
      const mine = ++seq.current;
      if (pulled) setRefreshing(true);
      try {
        const result = await loader();
        if (mine !== seq.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (mine !== seq.current) return;
        setError(errorMessage(err, fallbackError));
      } finally {
        if (mine === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [loader, fallbackError],
  );

  useFocusEffect(
    useCallback(() => {
      run(false);
    }, [run]),
  );

  const refresh = useCallback(() => run(true), [run]);
  const reload = useCallback(() => run(false), [run]);
  return { data, loading, refreshing, error, refresh, reload };
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { styles } = useCrmStyles(factory);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StageBadge({ stage }: { stage: PipelineStage }) {
  const meta = STAGE_META[stage] ?? { label: stage, tone: 'neutral' as Tone };
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

type IconType = React.ComponentType<{ size?: number; color?: string }>;

/** A two-colour diagonal fill for whatever it is placed in (the parent clips it to its own rounded shape). */
function GradientFill({ from, to }: { from: string; to: string }) {
  const id = useRef(`lead${Math.round(Math.random() * 1e9)}`).current;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The lead screens' backdrop: soft blue at the top easing through the app's
 * own background to a faint rose at the bottom. Sits behind everything in the
 * screen container it is placed in.
 */
export function LeadWash() {
  const theme = useCrmTheme();
  const id = useRef(`leadWash${Math.round(Math.random() * 1e9)}`).current;
  // Light: the pale blue and rose of the brand, fully opaque so the tint is the same on every screen.
  // Dark: the same hues as a faint glow over the dark background.
  const top = theme.isDark ? '#12213D' : '#D9E9FB';
  const bottom = theme.isDark ? '#1A1420' : '#F8EEF1';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {/* Corner to corner, like the CRM Home wash. A straight top-to-bottom gradient (x1 = x2) paints flat here. */}
          <LinearGradient id={id} x1="1" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.42" stopColor={theme.background} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * The container every lead screen sits in: the wash behind, then a safe-area
 * box for the content. The wash is a sibling of the safe area inside a plain
 * View (as on the CRM Home) - placed inside the safe-area view itself it is
 * not drawn.
 */
export function LeadScreen({ edges = ['top'], children }: { edges?: Edge[]; children: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.screenRoot}>
      <LeadWash />
      <SafeAreaView style={styles.screenSafe} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

/** Light tile tints, top-left to bottom-right. Dark mode keeps the flat tone colour instead. */
const TILE_GRADIENT: Record<Tone, [string, string] | null> = {
  info: ['#E6F4FF', '#CBE7FB'],
  success: ['#E3FBEA', '#C9F3D6'],
  warning: ['#FFF6D6', '#FDE9A8'],
  danger: ['#FFE9E9', '#FBD0D0'],
  accent: ['#F1ECFF', '#DFD5FB'],
  neutral: null,
};

/** The icon each count tile carries, by what it counts. */
const TILE_ICONS: Record<string, IconType> = {
  Today: CalendarIcon,
  Upcoming: ClockIcon,
  Quotations: DocumentIcon,
  Converted: CheckCircleIcon,
  New: SparkleIcon,
  'To call': PhoneIcon,
  Qualified: CheckCircleIcon,
  Closed: CloseIcon,
  Meetings: CalendarIcon,
  Quoted: DocumentIcon,
  'Leads generated': ClipboardListIcon,
  'Genuine leads': CheckCircleIcon,
  'Meetings scheduled': CalendarIcon,
  'Visits completed': PinIcon,
  'Quotations sent': DocumentIcon,
  'Follow-ups due': ClockIcon,
  Lost: CloseIcon,
};

export function StatTile({ label, value, tone, onPress }: { label: string; value: number | string; tone: Tone; onPress?: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, tone);
  const gradient = theme.isDark ? null : TILE_GRADIENT[tone];
  const Icon = TILE_ICONS[label] ?? TagIcon;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.tile, { backgroundColor: bg }, pressed && styles.pressed]}
    >
      {gradient && <GradientFill from={gradient[0]} to={gradient[1]} />}
      <View style={styles.tileIcon}>
        <Icon size={16} color={fg} />
      </View>
      <Text style={[styles.tileValue, { color: fg }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Initials in a circle tinted by the lead's stage - the left edge of a lead row and of the lead header. */
export function LeadAvatar({ name, stage }: { name: string; stage: PipelineStage }) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, (STAGE_META[stage] ?? { tone: 'neutral' as Tone }).tone);
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: fg }]}>{initials(name)}</Text>
    </View>
  );
}

/** One lead in a list: contact and company on the left, stage and what to do next on the right. */
export function LeadRow({ lead, onPress }: { lead: PipelineLead; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.row}>
        <LeadAvatar name={lead.contactPerson || lead.companyName} stage={lead.stage} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {lead.contactPerson || lead.companyName}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {lead.companyName}
          </Text>
          <Text style={styles.amount}>{formatINR(lead.amount)}</Text>
        </View>
        <View style={styles.rowRight}>
          <StageBadge stage={lead.stage} />
          <Text style={styles.nextStep} numberOfLines={1}>
            {nextStepLabel(lead.stage)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** The lead a form is about: who, which company, and its current stage. */
export function LeadHeader({ name, contact, stage }: { name: string; contact: string; stage: PipelineStage }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <LeadAvatar name={name} stage={stage} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {name}
          </Text>
          {!!contact && (
            <Text style={styles.rowSub} numberOfLines={1}>
              {contact}
            </Text>
          )}
        </View>
        <StageBadge stage={stage} />
      </View>
    </View>
  );
}

/** Two form fields side by side (date + time, phone + alternate phone). */
export function FieldRow({ children }: { children: [React.ReactNode, React.ReactNode] }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldCell}>{children[0]}</View>
      <View style={styles.fieldCell}>{children[1]}</View>
    </View>
  );
}

/** "Site visit" / "Meeting" with its icon: a briefcase for going to the customer, people for a meeting at the office. */
function MeetingKind({ type, office = 'Meeting' }: { type: Meeting['type']; office?: string }) {
  const { styles, theme } = useCrmStyles(factory);
  const Icon = type === 'OFFICE' ? UsersIcon : BriefcaseIcon;
  return (
    <View style={styles.rowMeta}>
      <Icon size={13} color={theme.textMuted} />
      <Text style={styles.rowMetaText}>{type === 'OFFICE' ? office : 'Site visit'}</Text>
    </View>
  );
}

/** A meeting as a line of the day's agenda: time on the left, who and where on the right. */
export function AgendaRow({ meeting, title, onPress }: { meeting: Meeting; title: string; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const inProgress = meeting.status === 'SCHEDULED' && !!meeting.checkInAt;
  const meta = inProgress ? { label: 'In progress', tone: 'warning' as Tone } : MEETING_STATUS_META[meeting.status];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.row}>
        <View style={styles.timeCol}>
          <View style={styles.timeChip}>
            <ClockIcon size={15} color={theme.primary} />
          </View>
          <Text style={styles.timeText}>{fmtTime(meeting.time)}</Text>
        </View>
        <View style={styles.rail} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <MeetingKind type={meeting.type} />
          {!!meeting.address && (
            <View style={styles.rowMeta}>
              <PinIcon size={13} color={theme.textMuted} />
              <Text style={styles.rowMetaText} numberOfLines={1}>
                {meeting.address}
              </Text>
            </View>
          )}
        </View>
        {meta && <StatusBadge label={meta.label} tone={meta.tone} />}
      </View>
    </Pressable>
  );
}

/** "Today, 11:00 AM" / "Oct 12, 2026, 11:00 AM" from a meeting's wall-clock date and time. */
export function meetingWhen(m: Pick<Meeting, 'date' | 'time'>): string {
  const time = fmtTime(m.time);
  return `${m.date === todayStr() ? 'Today' : fmtDateShort(m.date)}${time ? `, ${time}` : ''}`;
}

export const MEETING_STATUS_META: Record<Meeting['status'], { label: string; tone: Tone }> = {
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export function MeetingRow({ meeting, title, onPress }: { meeting: Meeting; title: string; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const inProgress = meeting.status === 'SCHEDULED' && !!meeting.checkInAt;
  const meta = inProgress ? { label: 'In progress', tone: 'warning' as Tone } : MEETING_STATUS_META[meeting.status];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.rowTop}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <MeetingKind type={meeting.type} office="Office meeting" />
        </View>
        {meta && <StatusBadge label={meta.label} tone={meta.tone} />}
      </View>
      <View style={styles.rowMeta}>
        <ClockIcon size={13} color={theme.textMuted} />
        <Text style={styles.rowMetaText}>{meetingWhen(meeting)}</Text>
      </View>
      {!!meeting.address && (
        <View style={styles.rowMeta}>
          <PinIcon size={13} color={theme.textMuted} />
          <Text style={styles.rowMetaText} numberOfLines={1}>
            {meeting.address}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Back / close bar for a lead screen. Has no background of its own, so the screen's wash shows through. */
export function LeadTopBar({ title, subtitle, onBack, icon = 'back' }: { title: string; subtitle?: string; onBack: () => void; icon?: 'back' | 'close' }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel={icon === 'close' ? 'Close' : 'Back'} style={styles.topButton}>
        {icon === 'close' ? <CloseIcon size={18} color={theme.textPrimary} /> : <ChevronLeftIcon size={20} color={theme.textPrimary} />}
      </Pressable>
      <View style={styles.topTitleWrap}>
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.topSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

const BUTTON_GRADIENT = { primary: ['#3B82F6', '#1D4ED8'], brand: ['#E53935', '#9B1C1C'] } as const;

/**
 * The lead screens' main button: the same sizes and variants as the CRM's
 * PrimaryButton, with a gradient fill on the two filled variants.
 */
export function LeadButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'brand' | 'secondary';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const off = disabled || loading;
  const filled = variant !== 'secondary';
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        filled ? [styles.buttonFilled, { backgroundColor: variant === 'brand' ? theme.crestRed : theme.primary }] : styles.buttonSecondary,
        off && styles.buttonOff,
        pressed && !off && styles.pressed,
        style,
      ]}
    >
      {variant !== 'secondary' && <GradientFill from={BUTTON_GRADIENT[variant][0]} to={BUTTON_GRADIENT[variant][1]} />}
      {loading ? (
        <ActivityIndicator color={filled ? theme.textOnPrimary : theme.primary} />
      ) : (
        <View style={styles.buttonContent}>
          {icon}
          <Text style={[styles.buttonLabel, { color: filled ? theme.textOnPrimary : theme.primary }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A soft tint for a person's avatar, the same one every time for the same name. */
export function personTone(name: string): Tone {
  const tones: Tone[] = ['info', 'success', 'accent', 'warning', 'danger'];
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return tones[sum % tones.length];
}

export function ActionRow({
  icon,
  title,
  hint,
  tone = 'info',
  onPress,
  divider,
  disabled,
}: {
  icon: (color: string) => React.ReactNode;
  title: string;
  hint?: string;
  tone?: Tone;
  onPress: () => void;
  divider?: boolean;
  disabled?: boolean;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.action, divider && styles.actionDivider, (pressed || disabled) && styles.pressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: bg }]}>{icon(fg)}</View>
      <View style={styles.rowBody}>
        <Text style={styles.actionTitle}>{title}</Text>
        {!!hint && <Text style={styles.actionHint}>{hint}</Text>}
      </View>
      <ChevronRightIcon size={16} color={theme.textMuted} />
    </Pressable>
  );
}

/** A tappable form field that opens a picker (date, time, person). */
export function PickField({
  label,
  value,
  placeholder,
  icon,
  onPress,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`} style={styles.field}>
        {icon}
        <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      </Pressable>
    </View>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const { styles } = useCrmStyles(factory);
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function RadioRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={styles.radio}>
      <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>{selected && <View style={styles.radioInner} />}</View>
      <Text style={styles.radioLabel}>{label}</Text>
    </Pressable>
  );
}

export function InfoLine({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, !!onPress && styles.infoLink]}>{value || '-'}</Text>
    </Pressable>
  );
}

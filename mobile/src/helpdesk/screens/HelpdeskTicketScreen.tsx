import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon, CheckCircleIcon, ChevronLeftIcon, PersonIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, NoticeBanner } from '../../crm/ui/CrmScreen';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { useAuth } from '../../auth/AuthContext';
import { ActionSheet } from '../../tasks/ui/sheets';
import { Avatar } from '../../tasks/ui/parts';
import { radii, spacing, typography } from '../../theme';
import {
  confirmSolved,
  getTicket,
  listAgents,
  reopenTicket,
  sendMessage,
  updateTicket,
  type HelpdeskAgent,
  type HelpdeskPriority,
  type HelpdeskStatus,
  type HelpdeskThread,
} from '../api';
import { ACTIVE, PRIORITY_LABEL, priorityColors, statusColors, TEAM_STATUS } from '../format';
import { AskIcon, FlagIcon, ReopenIcon, ResolveIcon, UserPlusIcon } from '../icons';
import { Composer, PriorityChip, StatusChip, Thread } from '../ui';

type Nav = NavigationProp<AuthenticatedStackParamList>;
type Picker = 'assign' | 'status' | 'priority' | null;

const STATUSES: HelpdeskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'];
const PRIORITIES: HelpdeskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

/**
 * One ticket's chat. The person who raised it gets "Yes, it's solved / Still an issue" and Reopen;
 * the technical team (the server says so through `actions`) also gets Pick up, Assignee, Status,
 * Priority and internal notes. Refreshes every 15 seconds while open.
 */
export function HelpdeskTicketScreen() {
  const { styles, theme } = useCrmStyles(factory);
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<AuthenticatedStackParamList, 'HelpdeskTicket'>>();
  const { ticketId, justRaised } = route.params;
  const { user, session } = useAuth();
  const myId = String(user?.id ?? session?.userId ?? '');

  const [data, setData] = useState<HelpdeskThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(justRaised ? `Ticket ${justRaised} raised - the technical team has been notified.` : null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [agents, setAgents] = useState<HelpdeskAgent[]>([]);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(async () => {
    try {
      setData(await getTicket(ticketId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the ticket.');
    }
  }, [ticketId]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 15000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const team = !!data?.actions.addNote;
  useEffect(() => {
    if (team) listAgents().then(setAgents).catch(() => {});
  }, [team]);

  const act = async (fn: () => Promise<HelpdeskThread>, done?: string) => {
    setBusy(true);
    try {
      setData(await fn());
      if (done) setNotice(done);
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Header onBack={() => navigation.goBack()} />
        {error ? (
          <View style={styles.pad}>
            <CrmErrorBanner message={error} onRetry={load} />
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
            <Text style={styles.muted}>Opening ticket…</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const { ticket: t, messages, actions } = data;
  const closed = t.status === 'CLOSED';
  const mineAssigned = !!t.assignedTo && t.assignedTo.id === myId;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header onBack={() => navigation.goBack()}>
        <View style={styles.headTop}>
          <Text style={styles.code}>{t.code}</Text>
          <StatusChip status={t.status} team={team} />
          {team && <PriorityChip priority={t.priority} />}
        </View>
        <Text style={styles.subject} numberOfLines={2}>
          {t.subject}
        </Text>
        {team && (
          <View style={styles.requester}>
            <PersonIcon size={13} color={theme.textMuted} />
            <Text style={styles.requesterText} numberOfLines={1}>
              {t.raisedBy?.name}
              {t.raisedBy?.role ? ` · ${t.raisedBy.role}` : ''} · {t.source === 'APP' ? `App${t.appVersion ? ` v${t.appVersion}` : ''}` : 'Web'}
            </Text>
          </View>
        )}
      </Header>

      {team && (
        <View style={styles.teamPanel}>
          <View style={styles.props}>
            <PropTile
              caption="Assignee"
              onPress={() => setPicker('assign')}
              disabled={busy}
              icon={t.assignedTo ? <Avatar name={t.assignedTo.name} id={t.assignedTo.id} size={24} /> : <View style={styles.emptyAvatar}><PersonIcon size={13} color={theme.textMuted} /></View>}
              value={t.assignedTo ? (mineAssigned ? 'Me' : (t.assignedTo.name ?? '').split(' ')[0]) : 'Unassigned'}
              muted={!t.assignedTo}
            />
            <PropTile
              caption="Status"
              onPress={() => setPicker('status')}
              disabled={busy}
              icon={<View style={[styles.propDot, { backgroundColor: statusColors(t.status, theme).fg }]} />}
              value={t.status === 'WAITING_USER' ? 'Waiting' : TEAM_STATUS[t.status]}
            />
            <PropTile
              caption="Priority"
              onPress={() => setPicker('priority')}
              disabled={busy}
              icon={<FlagIcon size={15} color={priorityColors(t.priority, theme).fg} />}
              value={PRIORITY_LABEL[t.priority]}
            />
          </View>
          {(closed || !mineAssigned || ACTIVE.includes(t.status)) && (
            <View style={styles.actions}>
              {!mineAssigned && !closed && (
                <ActionButton
                  label="Pick up"
                  tone="primary"
                  icon={<UserPlusIcon size={18} color="#FFFFFF" />}
                  disabled={busy}
                  onPress={() => act(() => updateTicket(ticketId, { assignedTo: 'me' }), 'You picked up this ticket')}
                />
              )}
              {ACTIVE.includes(t.status) && t.status !== 'WAITING_USER' && (
                <ActionButton
                  label="Ask user"
                  tone="neutral"
                  icon={<AskIcon size={18} color={theme.textPrimary} />}
                  disabled={busy}
                  onPress={() => act(() => updateTicket(ticketId, { status: 'WAITING_USER' }), 'Waiting on the user')}
                />
              )}
              {ACTIVE.includes(t.status) && (
                <ActionButton
                  label="Resolve"
                  tone="success"
                  icon={<ResolveIcon size={18} color="#FFFFFF" />}
                  disabled={busy}
                  onPress={() => act(() => updateTicket(ticketId, { status: 'RESOLVED' }), 'Marked resolved - the user will be asked to confirm')}
                />
              )}
              {closed && (
                <ActionButton
                  label="Reopen"
                  tone="outline"
                  icon={<ReopenIcon size={18} color={theme.primary} />}
                  disabled={busy}
                  onPress={() => act(() => updateTicket(ticketId, { status: t.assignedTo ? 'IN_PROGRESS' : 'OPEN' }), 'Ticket reopened')}
                />
              )}
            </View>
          )}
        </View>
      )}

      {!team && t.status === 'RESOLVED' && (
        <View style={[styles.banner, styles.bannerOk]}>
          <Text style={styles.bannerTitle}>The technical team marked this as resolved.</Text>
          <Text style={styles.bannerSub}>Is your problem solved?</Text>
          <View style={styles.bannerActions}>
            <Pressable disabled={busy} onPress={() => act(() => confirmSolved(ticketId), 'Thanks! The ticket is closed.')} style={({ pressed }) => [styles.bannerBtn, styles.bannerBtnPrimary, pressed && styles.pressed]} accessibilityRole="button">
              <CheckCircleIcon size={16} color="#FFFFFF" />
              <Text style={styles.bannerBtnTextPrimary}>Yes, it's solved</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => act(() => reopenTicket(ticketId), 'Reopened - the technical team has been notified')} style={({ pressed }) => [styles.bannerBtn, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.bannerBtnText}>Still an issue</Text>
            </Pressable>
          </View>
        </View>
      )}
      {!team && t.status === 'WAITING_USER' && (
        <View style={[styles.banner, styles.bannerWarn]}>
          <View style={styles.row}>
            <AlertTriangleIcon size={16} color={theme.warningText} />
            <Text style={[styles.bannerTitle, { color: theme.warningText }]}>The technical team needs more information.</Text>
          </View>
          <Text style={styles.bannerSub}>Please reply below.</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      >
        {!!notice && <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />}
        <CrmErrorBanner message={error} onRetry={load} />
        <Thread messages={messages} team={team} onError={setError} />
      </ScrollView>

      {closed ? (
        <SafeAreaView edges={['bottom']} style={styles.closedBar}>
          <Text style={styles.closedText}>This ticket is closed.</Text>
          {team ? (
            <Text style={styles.muted}>Use Reopen above to reply again.</Text>
          ) : actions.reopen ? (
            <Pressable disabled={busy} onPress={() => act(() => reopenTicket(ticketId), 'Reopened - the technical team has been notified')} style={styles.closedBtn} accessibilityRole="button">
              <Text style={styles.closedBtnText}>Reopen</Text>
            </Pressable>
          ) : (
            <Text style={styles.muted}>Raise a new ticket if you need more help.</Text>
          )}
        </SafeAreaView>
      ) : (
        <Composer
          team={team}
          placeholder={!team && t.status === 'RESOLVED' ? 'Reply to reopen this ticket…' : team ? 'Reply to the user…' : 'Write a message…'}
          onSend={async (msg) => setData(await sendMessage(ticketId, msg))}
        />
      )}

      {team && (
        <>
          <ActionSheet
            visible={picker === 'assign'}
            onClose={() => setPicker(null)}
            title="Assign to"
            actions={[
              { key: 'none', label: 'Unassigned', sub: 'Back to the team queue', icon: <PersonIcon size={18} color={theme.textMuted} />, iconBg: theme.surfaceAlt, selected: !t.assignedTo, onPress: () => act(() => updateTicket(ticketId, { assignedTo: null }), 'Unassigned') },
              ...agents.map((a) => ({
                key: a.id,
                label: a.id === myId ? `${a.name} (me)` : a.name,
                sub: a.role,
                icon: <Avatar name={a.name} id={a.id} size={40} />,
                selected: t.assignedTo?.id === a.id,
                onPress: () => act(() => updateTicket(ticketId, { assignedTo: a.id }), a.id === myId ? 'You picked up this ticket' : `Assigned to ${a.name}`),
              })),
            ]}
          />
          <ActionSheet
            visible={picker === 'status'}
            onClose={() => setPicker(null)}
            title="Status"
            actions={STATUSES.map((s) => ({ key: s, label: TEAM_STATUS[s], icon: <View style={[styles.marker, { backgroundColor: statusColors(s, theme).fg }]} />, iconBg: statusColors(s, theme).bg, selected: t.status === s, onPress: () => act(() => updateTicket(ticketId, { status: s }), 'Status updated - the user has been notified') }))}
          />
          <ActionSheet
            visible={picker === 'priority'}
            onClose={() => setPicker(null)}
            title="Priority"
            actions={PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABEL[p], icon: <View style={[styles.marker, { backgroundColor: priorityColors(p, theme).fg }]} />, iconBg: priorityColors(p, theme).bg, selected: t.priority === p, onPress: () => act(() => updateTicket(ticketId, { priority: p }), 'Priority updated') }))}
          />
        </>
      )}
    </SafeAreaView>
  );
}

function Header({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
        <ChevronLeftIcon size={22} color={theme.textPrimary} />
      </Pressable>
      <View style={styles.flex}>{children ?? <Text style={styles.subject}>Ticket</Text>}</View>
    </View>
  );
}

/** One of Assignee / Status / Priority - tap to change. */
function PropTile({ caption, value, icon, onPress, disabled, muted }: { caption: string; value: string; icon: React.ReactNode; onPress: () => void; disabled?: boolean; muted?: boolean }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${caption}: ${value}. Tap to change`} style={({ pressed }) => [styles.prop, (pressed || disabled) && styles.pressed]}>
      <View style={styles.propHead}>
        <Text style={styles.propCaption}>{caption}</Text>
        <Text style={styles.propCaret}>▾</Text>
      </View>
      <View style={styles.propRow}>
        {icon}
        <Text style={[styles.propValue, muted && { color: theme.textMuted }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

/** A big, clear action - Pick up / Ask user / Resolve / Reopen. */
function ActionButton({ label, icon, tone, onPress, disabled }: { label: string; icon: React.ReactNode; tone: 'primary' | 'success' | 'neutral' | 'outline'; onPress: () => void; disabled?: boolean }) {
  const { styles } = useCrmStyles(factory);
  const toneStyle = { primary: styles.actionPrimary, success: styles.actionSuccess, neutral: styles.actionNeutral, outline: styles.actionOutline }[tone];
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [styles.action, toneStyle, (pressed || disabled) && styles.pressed]}>
      {icon}
      <Text style={[styles.actionText, (tone === 'primary' || tone === 'success') && styles.actionTextOn, tone === 'outline' && styles.actionTextOutline]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  pad: { padding: spacing.md },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.sm },
  muted: { ...typography.caption, color: t.textMuted },
  pressed: { opacity: 0.7 },
  marker: { width: 12, height: 12, borderRadius: 6 },

  header: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border },
  back: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const },
  headTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  code: { fontSize: 12.5, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.3 },
  subject: { ...typography.subtitle, color: t.textPrimary, marginTop: 4 },
  requester: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 4 },
  requesterText: { ...typography.caption, color: t.textSecondary, flex: 1 },

  teamPanel: { backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border, paddingHorizontal: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.xs },
  props: { flexDirection: 'row' as const, gap: spacing.xs },
  prop: { flex: 1, minHeight: 58, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.background, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center' as const },
  propHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 4 },
  propCaption: { fontSize: 10.5, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  propCaret: { fontSize: 11, color: t.textMuted },
  propRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  propValue: { ...typography.captionMedium, color: t.textPrimary, fontSize: 13.5, flexShrink: 1 },
  propDot: { width: 10, height: 10, borderRadius: 5 },
  emptyAvatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: t.textMuted, alignItems: 'center' as const, justifyContent: 'center' as const },
  actions: { flexDirection: 'row' as const, gap: spacing.xs },
  action: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 7, minHeight: 46, borderRadius: radii.md, paddingHorizontal: 10 },
  actionPrimary: { backgroundColor: t.primary, ...t.cardShadow },
  actionSuccess: { backgroundColor: t.success, ...t.cardShadow },
  actionNeutral: { backgroundColor: t.surfaceAlt },
  actionOutline: { borderWidth: 1.5, borderColor: t.primary, backgroundColor: t.surface },
  actionText: { ...typography.captionMedium, fontSize: 14, color: t.textPrimary },
  actionTextOn: { color: '#FFFFFF' },
  actionTextOutline: { color: t.primary },

  banner: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: t.border },
  bannerOk: { backgroundColor: t.successBg },
  bannerWarn: { backgroundColor: t.warningBg },
  bannerTitle: { ...typography.captionMedium, color: t.successText, fontSize: 14 },
  bannerSub: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  bannerActions: { flexDirection: 'row' as const, gap: spacing.xs, marginTop: spacing.sm },
  bannerBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  bannerBtnPrimary: { backgroundColor: t.success, borderColor: t.success },
  bannerBtnText: { ...typography.captionMedium, color: t.textPrimary, fontSize: 14 },
  bannerBtnTextPrimary: { ...typography.captionMedium, color: '#FFFFFF', fontSize: 14 },

  thread: { padding: spacing.md, paddingBottom: spacing.lg },
  closedBar: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface },
  closedText: { ...typography.body, color: t.textSecondary },
  closedBtn: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 1.5, borderColor: t.primary, justifyContent: 'center' as const },
  closedBtnText: { ...typography.captionMedium, color: t.primary, fontSize: 14 },
});

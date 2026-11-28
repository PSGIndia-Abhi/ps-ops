import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { BriefcaseIcon, CalendarIcon, CameraIcon, CheckCircleIcon, ChevronRightIcon, LockIcon, PinIcon, SendIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { useToast } from '../ui/Toast';
import { AttachSheet, PickedFiles, useFilePicker } from '../../helpdesk/ui';
import { spacing, typography } from '../../theme';
import { complaintFilePath, getComplaint, replyToComplaint, type ClientComplaintDetail } from '../api';
import { CATEGORY_LABEL, PRIORITY_LABEL, PRIORITY_TONE, STAGES, STAGE_TONE, stageLabel, stageOf, visitText } from '../complaints';
import { formatDate, formatDateTime, serviceLabel } from '../format';
import { markComplaintSeen } from '../seen';
import { useAuth } from '../../auth/AuthContext';
import type { ClientStackParamList } from '../navigation';
import { ClientPage, PhotoViewer, PortalImage, SOFT } from '../ui/page';
import { BrandLoaderOverlay } from '../../components/BrandLoader';

const BLUE = '#0B57D0';

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  // header card (white, no tinted chips)
  head: { borderRadius: 24, padding: spacing.lg, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1, borderColor: t.isDark ? t.border : '#E6EBF3', shadowColor: '#0B1230', shadowOffset: { width: 0, height: 3 }, shadowOpacity: t.isDark ? 0 : 0.04, shadowRadius: 10, elevation: 1 },
  statusRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13.5, fontWeight: '700' as const },
  headWhen: { fontSize: 13, color: t.textMuted },
  subject: { ...typography.title, fontSize: 20, lineHeight: 26, color: t.textPrimary, marginTop: 8 },
  infoLine: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, marginTop: 6 },
  infoItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  infoText: { fontSize: 13, fontWeight: '600' as const, color: t.textSecondary },
  infoSep: { fontSize: 13, color: t.textMuted, marginHorizontal: 7 },
  // stepper
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 18, paddingHorizontal: 20 },
  stepDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center' as const, justifyContent: 'center' as const },
  stepDotNow: { width: 22, height: 22, borderRadius: 11, borderWidth: 0 },
  stepLine: { flex: 1, height: 2, borderRadius: 1, marginHorizontal: 3 },
  stepLabels: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 6 },
  stepLabel: { width: 60, fontSize: 11, color: t.textMuted, textAlign: 'center' as const },
  stepNote: { fontSize: 13, lineHeight: 18, color: t.textSecondary, marginTop: 10 },
  visitLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 8 },
  visitText: { fontSize: 13.5, fontWeight: '700' as const, color: STAGE_TONE.VISIT_SCHEDULED.fg },
  // details (collapsible)
  detailsToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, alignSelf: 'flex-start' as const, marginTop: 12, paddingVertical: 4 },
  detailsToggleText: { fontSize: 13.5, fontWeight: '700' as const, color: t.isDark ? '#A8C7FA' : '#0B57D0' },
  details: { marginTop: 6 },
  dRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.md, paddingVertical: 8 },
  dDivider: { height: 1, backgroundColor: t.border, opacity: 0.6 },
  dKey: { fontSize: 13, color: t.textMuted },
  dVal: { flexShrink: 1, fontSize: 13.5, fontWeight: '600' as const, color: t.textPrimary, textAlign: 'right' as const },
  job: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs, padding: spacing.sm, borderRadius: 14, borderWidth: 1, borderColor: t.isDark ? t.border : '#E6EBF3' },
  jobTitle: { ...typography.bodyMedium, color: t.textPrimary },
  jobSub: { ...typography.caption, color: t.textMuted },
  // conversation
  convTitle: { fontSize: 15.5, fontWeight: '700' as const, color: t.textPrimary, marginTop: spacing.lg },
  dayRule: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.md, marginBottom: spacing.xs },
  msgRow: { marginTop: spacing.sm, maxWidth: '84%' as const },
  mineRow: { alignSelf: 'flex-end' as const, alignItems: 'flex-end' as const },
  teamRow: { alignSelf: 'flex-start' as const, alignItems: 'flex-start' as const },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  mineBubble: { backgroundColor: BLUE, borderBottomRightRadius: 6 },
  teamBubble: { backgroundColor: SOFT(t), borderBottomLeftRadius: 6 },
  autoBubble: { backgroundColor: t.isDark ? 'rgba(168,199,250,0.12)' : '#EEF3FF', borderWidth: 1, borderColor: t.isDark ? t.border : '#DCE6FB' },
  msgText: { ...typography.body, color: t.textPrimary },
  mineText: { color: '#FFFFFF' },
  msgMeta: { ...typography.caption, fontSize: 11.5, color: t.textMuted, marginTop: 4, marginHorizontal: 6 },
  files: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  doneNote: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: 18 },
  doneText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '500' as const },
  // composer
  composerWrap: { borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  composer: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: spacing.xs },
  attachBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: SOFT(t) },
  input: { flex: 1, ...typography.body, color: t.textPrimary, minHeight: 44, maxHeight: 120, paddingHorizontal: spacing.md, paddingTop: 11, paddingBottom: 11, borderRadius: 22, backgroundColor: SOFT(t) },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: BLUE },
  sendOff: { opacity: 0.4 },
  closedBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: SOFT(t) },
  closedText: { flex: 1, fontSize: 13, lineHeight: 18, color: t.textSecondary },
  loading: { padding: spacing.lg, gap: spacing.md },
});

function Check({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ClientComplaintDetailScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientComplaintDetail'>>();
  const { styles, theme } = useCrmStyles(factory);
  const picker = useFilePicker();
  const { user, session } = useAuth();
  const seenScope = String(user?.id ?? session?.userId ?? '');
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const [data, setData] = useState<ClientComplaintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // A message handed over by the previous screen (e.g. "Complaint raised"), shown once as a toast.
  useEffect(() => {
    if (params.notice) toast.show(params.notice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await getComplaint(params.complaintId);
      setData(body);
      // Opened (or refreshed after a reply): BestServe's messages so far are now seen.
      markComplaintSeen(seenScope, params.complaintId);
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Could not load this complaint');
    } finally {
      setLoading(false);
    }
  }, [params.complaintId, seenScope]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!reply.trim() && !picker.files.length) return;
    setSending(true);
    setError(null);
    try {
      const res = await replyToComplaint(params.complaintId, { message: reply.trim(), files: picker.files });
      setReply('');
      picker.reset();
      if (res.warning) toast.show(res.warning, 'warning');
      else if (res.reopened) toast.show('Message sent. Our team will take another look.');
      else toast.show('Message sent');
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (err) {
      setError((err as Error).message || 'Could not send your message');
    } finally {
      setSending(false);
    }
  };

  if (!data) {
    return (
      <ClientPage title="Complaint" back>
        {loading ? (
          <View style={styles.loading}>
            <CrmSkeleton height={130} radius={24} />
            <CrmSkeleton height={200} radius={22} />
            <CrmSkeleton width="70%" height={60} radius={20} />
          </View>
        ) : (
          <View style={styles.loading}>
            <CrmErrorBanner message={error || 'Could not load this complaint'} onRetry={load} />
          </View>
        )}
      </ClientPage>
    );
  }

  const { complaint: c, jobs, messages } = data;
  const stage = stageOf(c.status);
  const stageIdx = STAGES.findIndex((s) => s.key === stage);
  const allDone = stage === 'CLOSED';
  const st = STAGE_TONE[stage];
  const categories = c.category?.length ? c.category : (['SERVICE'] as const);
  const visit = visitText(c.visit_date, c.visit_slot);
  const prio = c.priority ? PRIORITY_TONE[c.priority] : null;
  const canSend = (reply.trim().length > 0 || picker.files.length > 0) && !sending;
  let lastDay = '';

  const details: [string, string][] = [
    ['Raised by', c.raised_by_me ? 'You' : c.raised_by_name || '—'],
    ...(visit ? ([['Scheduled visit', visit]] as [string, string][]) : []),
    ['Raised on', formatDateTime(c.created_at)],
    ...(c.updated_at ? ([['Last updated', formatDateTime(c.updated_at)]] as [string, string][]) : []),
  ];

  return (
    <ClientPage title="Complaint" back>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <CrmErrorBanner message={error} />

          {/* Header: status, subject, one plain info line, then the stage stepper */}
          <View style={styles.head}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: st.fg }]} />
              <Text style={[styles.statusText, { color: st.fg }]}>{stageLabel(stage)}</Text>
              <Text style={styles.headWhen}>· Raised {formatDate(c.created_at, { day: 'numeric', month: 'short' })}</Text>
            </View>
            <Text style={styles.subject}>{c.subject}</Text>
            <View style={styles.infoLine}>
              {!!c.site_name && (
                <>
                  <Pressable
                    onPress={() => c.site_id && navigation.navigate('ClientOutletDetail', { siteId: c.site_id })}
                    style={({ pressed }) => [styles.infoItem, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Outlet ${c.site_name}`}
                  >
                    <PinIcon size={13} color={theme.textMuted} />
                    <Text style={styles.infoText} numberOfLines={1}>
                      {c.site_name}
                    </Text>
                  </Pressable>
                  <Text style={styles.infoSep}>·</Text>
                </>
              )}
              <Text style={styles.infoText}>{categories.map((k) => CATEGORY_LABEL[k] || k).join(' + ')}</Text>
              {!!c.priority && (
                <>
                  <Text style={styles.infoSep}>·</Text>
                  <Text style={[styles.infoText, prio && (c.priority === 'HIGH' || c.priority === 'URGENT') ? { color: prio.fg, fontWeight: '700' } : null]}>
                    {PRIORITY_LABEL[c.priority] || c.priority}
                  </Text>
                </>
              )}
            </View>

            {/* Compact stepper */}
            <View style={styles.stepper} accessibilityLabel={`Stage ${stageIdx + 1} of ${STAGES.length}: ${STAGES[stageIdx].label}`}>
              {STAGES.map((sItem, idx) => {
                const done = idx < stageIdx || allDone;
                const now = idx === stageIdx && !allDone;
                const color = done ? '#188038' : now ? st.fg : theme.isDark ? 'rgba(255,255,255,0.18)' : '#D5DBE5';
                return (
                  <React.Fragment key={sItem.key}>
                    {idx > 0 && <View style={[styles.stepLine, { backgroundColor: idx <= stageIdx ? '#188038' : theme.isDark ? 'rgba(255,255,255,0.12)' : '#E3E7EE' }]} />}
                    <View style={[styles.stepDot, { backgroundColor: done || now ? color : 'transparent', borderColor: color }, now && styles.stepDotNow]}>
                      {done && <Check color="#FFFFFF" />}
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
            <View style={styles.stepLabels}>
              {STAGES.map((sItem, idx) => (
                <Text key={sItem.key} style={[styles.stepLabel, idx === stageIdx && { color: theme.textPrimary, fontWeight: '700' }]} numberOfLines={1}>
                  {sItem.key === 'VISIT_SCHEDULED' ? 'Visit' : sItem.key === 'IN_PROGRESS' ? 'Working' : sItem.label}
                </Text>
              ))}
            </View>
            {!allDone && <Text style={styles.stepNote}>{STAGES[stageIdx].note}</Text>}
            {!!visit && stageIdx >= 2 && (
              <View style={styles.visitLine}>
                <CalendarIcon size={14} color={STAGE_TONE.VISIT_SCHEDULED.fg} />
                <Text style={styles.visitText}>Visit: {visit}</Text>
              </View>
            )}

            {/* Details: one row, tap to expand */}
            <Pressable
              onPress={() => setShowDetails((v) => !v)}
              style={({ pressed }) => [styles.detailsToggle, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ expanded: showDetails }}
            >
              <Text style={styles.detailsToggleText}>{showDetails ? 'Hide details' : 'Details'}</Text>
              <View style={{ transform: [{ rotate: showDetails ? '-90deg' : '90deg' }] }}>
                <ChevronRightIcon size={15} color={theme.isDark ? '#A8C7FA' : '#0B57D0'} />
              </View>
            </Pressable>
            {showDetails && (
              <View style={styles.details}>
                {details.map(([k, v], i2) => (
                  <View key={k}>
                    {i2 > 0 && <View style={styles.dDivider} />}
                    <View style={styles.dRow}>
                      <Text style={styles.dKey}>{k}</Text>
                      <Text style={styles.dVal} numberOfLines={2}>
                        {v}
                      </Text>
                    </View>
                  </View>
                ))}
                {jobs.map((jb) => (
                  <Pressable key={jb.id} onPress={() => navigation.navigate('ClientJobDetail', { jobId: jb.id })} style={({ pressed }) => [styles.job, pressed && styles.pressed]} accessibilityRole="button">
                    <BriefcaseIcon size={17} color={theme.isDark ? '#A8C7FA' : '#0B57D0'} />
                    <View style={styles.flex1}>
                      <Text style={styles.jobTitle}>{serviceLabel(jb.service_type)}</Text>
                      <Text style={styles.jobSub}>Linked job #{jb.code || jb.id}</Text>
                    </View>
                    <ChevronRightIcon size={16} color={theme.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Conversation */}
          <Text style={styles.convTitle}>Conversation</Text>
          {messages.map((m) => {
            const day = formatDate(m.created_at, { weekday: 'short', day: 'numeric', month: 'short' });
            const showDay = day !== lastDay;
            lastDay = day;
            const team = m.from_team || !!m.auto;
            const mine = !team;
            const who = m.mine ? 'You' : team ? 'BestServe' : m.author || 'Colleague';
            return (
              <View key={m.id}>
                {showDay && <Text style={styles.dayRule}>{day}</Text>}
                <View style={[styles.msgRow, mine ? styles.mineRow : styles.teamRow]}>
                  {!!m.message && m.message !== '(attachment)' && (
                    <View style={[styles.bubble, mine ? styles.mineBubble : m.auto ? styles.autoBubble : styles.teamBubble]}>
                      <Text style={[styles.msgText, mine && styles.mineText]}>{m.message}</Text>
                    </View>
                  )}
                  {m.attachments.length > 0 && (
                    <View style={styles.files}>
                      {m.attachments.map((a) => {
                        const isImage = !String(a.file_type).includes('pdf');
                        return (
                          <PortalImage
                            key={String(a.id)}
                            path={complaintFilePath(a.id)}
                            size={96}
                            isImage={isImage}
                            onPress={isImage ? () => setViewer(complaintFilePath(a.id)) : undefined}
                          />
                        );
                      })}
                    </View>
                  )}
                  <Text style={styles.msgMeta}>
                    {who} · {formatDateTime(m.created_at).split(', ').pop()}
                  </Text>
                </View>
              </View>
            );
          })}

          {(stage === 'RESOLVED' || stage === 'CLOSED') && (
            <View style={[styles.doneNote, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : st.bg }]}>
              <CheckCircleIcon size={20} color={st.fg} />
              <Text style={[styles.doneText, { color: theme.isDark ? theme.textPrimary : st.fg }]}>
                {stage === 'CLOSED' ? 'BestServe has closed this complaint.' : 'BestServe has marked this complaint as resolved. Reply if the problem is still there.'}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Reply (turned off once closed) */}
        {stage === 'CLOSED' ? (
          <View style={styles.closedBar}>
            <LockIcon size={18} color={theme.textMuted} />
            <Text style={styles.closedText}>Replies are turned off for closed complaints. If the problem comes back, raise a new complaint.</Text>
          </View>
        ) : (
          <View style={styles.composerWrap}>
            <PickedFiles picker={picker} />
            <View style={styles.composer}>
              <Pressable onPress={() => picker.setMenu(true)} style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Attach photo or file">
                <CameraIcon size={20} color={theme.textSecondary} />
              </Pressable>
              <TextInput value={reply} onChangeText={setReply} placeholder="Write a reply" placeholderTextColor={theme.textMuted} style={styles.input} multiline />
              <Pressable onPress={send} disabled={!canSend} style={({ pressed }) => [styles.sendBtn, !canSend && styles.sendOff, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Send">
                <SendIcon size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <AttachSheet picker={picker} />
      <PhotoViewer path={viewer} onClose={() => setViewer(null)} />
      <BrandLoaderOverlay visible={sending} message="Sending your reply" />
    </ClientPage>
  );
}

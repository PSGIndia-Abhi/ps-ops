import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { BriefcaseIcon, CameraIcon, CheckCircleIcon, ChevronRightIcon, PinIcon, SendIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton, NoticeBanner } from '../../crm/ui/CrmScreen';
import { AttachSheet, PickedFiles, useFilePicker } from '../../helpdesk/ui';
import { radii, spacing, typography } from '../../theme';
import { complaintFilePath, getComplaint, replyToComplaint, setComplaintStatus, type ClientComplaintDetail } from '../api';
import { formatDate, formatDateTime, serviceLabel } from '../format';
import type { ClientStackParamList } from '../navigation';
import { ClientPage, PhotoViewer, PortalImage, SOFT, TONES } from '../ui/page';

const PRIORITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Normal', HIGH: 'High', URGENT: 'Urgent' };

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  statusPill: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...typography.captionMedium, fontSize: 13 },
  subject: { ...typography.title, fontSize: 22, lineHeight: 28, color: t.textPrimary, marginTop: spacing.sm },
  meta: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 6, marginTop: spacing.xs },
  metaText: { ...typography.caption, color: t.textMuted },
  job: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: 16, backgroundColor: SOFT(t) },
  jobTitle: { ...typography.bodyMedium, color: t.textPrimary },
  jobSub: { ...typography.caption, color: t.textMuted },
  dayRule: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.lg, marginBottom: spacing.xs },
  msgRow: { marginTop: spacing.sm, maxWidth: '84%' as const },
  mineRow: { alignSelf: 'flex-end' as const, alignItems: 'flex-end' as const },
  teamRow: { alignSelf: 'flex-start' as const, alignItems: 'flex-start' as const },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  mineBubble: { backgroundColor: TONES.blue.fg, borderBottomRightRadius: 6 },
  teamBubble: { backgroundColor: SOFT(t), borderBottomLeftRadius: 6 },
  msgText: { ...typography.body, color: t.textPrimary },
  mineText: { color: '#FFFFFF' },
  msgMeta: { ...typography.caption, fontSize: 11.5, color: t.textMuted, marginTop: 4, marginHorizontal: 6 },
  files: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  action: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, marginTop: spacing.xl, padding: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: t.border },
  actionTitle: { ...typography.bodyMedium, color: t.textPrimary },
  actionSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  actionBtn: { paddingHorizontal: 14, minHeight: 38, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  actionBtnText: { ...typography.captionMedium, fontSize: 13.5 },
  composerWrap: { borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  composer: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: spacing.xs },
  attachBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: SOFT(t) },
  input: { flex: 1, ...typography.body, color: t.textPrimary, minHeight: 44, maxHeight: 120, paddingHorizontal: spacing.md, paddingTop: 11, paddingBottom: 11, borderRadius: 22, backgroundColor: SOFT(t) },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: TONES.blue.fg },
  sendOff: { opacity: 0.4 },
  loading: { padding: spacing.lg, gap: spacing.md },
});

export function ClientComplaintDetailScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientComplaintDetail'>>();
  const { styles, theme } = useCrmStyles(factory);
  const picker = useFilePicker();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const [data, setData] = useState<ClientComplaintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(params.notice || null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [changing, setChanging] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await getComplaint(params.complaintId);
      setData(body);
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Could not load this complaint');
    } finally {
      setLoading(false);
    }
  }, [params.complaintId]);

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
      setNotice(res.warning || (res.reopened ? 'Complaint reopened - our team will look at it again.' : null));
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (err) {
      setError((err as Error).message || 'Could not send your message');
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: 'CLOSED' | 'OPEN') => {
    setChanging(true);
    setError(null);
    try {
      await setComplaintStatus(params.complaintId, status);
      setNotice(status === 'CLOSED' ? 'Thanks! The complaint is marked as resolved.' : 'Complaint reopened - our team will look at it again.');
      await load();
    } catch (err) {
      setError((err as Error).message || 'Could not update the complaint');
    } finally {
      setChanging(false);
    }
  };

  if (!data) {
    return (
      <ClientPage title="Complaint" back>
        {loading ? (
          <View style={styles.loading}>
            <CrmSkeleton width={90} height={26} radius={13} />
            <CrmSkeleton width="80%" height={24} />
            <CrmSkeleton height={70} radius={20} />
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

  const { complaint, jobs, messages } = data;
  const open = complaint.status === 'OPEN' || complaint.status === 'IN_PROGRESS';
  const tone = open ? TONES.amber : TONES.green;
  const statusLabel = complaint.status === 'IN_PROGRESS' ? 'In progress' : open ? 'Open' : complaint.status === 'RESOLVED' ? 'Resolved' : 'Closed';
  const canSend = (reply.trim().length > 0 || picker.files.length > 0) && !sending;
  let lastDay = '';

  return (
    <ClientPage title="Complaint" back>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => !loading && scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />
          <CrmErrorBanner message={error} />

          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: tone.fg }]} />
            <Text style={[styles.statusText, { color: tone.fg }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.subject}>{complaint.subject}</Text>
          <View style={styles.meta}>
            {!!complaint.site_name && (
              <>
                <PinIcon size={13} color={theme.textMuted} />
                <Text style={styles.metaText}>{complaint.site_name}</Text>
                <Text style={styles.metaText}>·</Text>
              </>
            )}
            <Text style={styles.metaText}>Raised {formatDate(complaint.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            {!!complaint.priority && (
              <>
                <Text style={styles.metaText}>·</Text>
                <Text style={styles.metaText}>{PRIORITY_LABEL[complaint.priority] || complaint.priority} priority</Text>
              </>
            )}
          </View>

          {jobs.map((j) => (
            <Pressable key={j.id} onPress={() => navigation.navigate('ClientJobDetail', { jobId: j.id })} style={({ pressed }) => [styles.job, pressed && styles.pressed]} accessibilityRole="button">
              <BriefcaseIcon size={18} color={TONES.indigo.fg} />
              <View style={styles.flex1}>
                <Text style={styles.jobTitle}>{serviceLabel(j.service_type)}</Text>
                <Text style={styles.jobSub}>Job #{j.code || j.id}</Text>
              </View>
              <ChevronRightIcon size={16} color={theme.textMuted} />
            </Pressable>
          ))}

          {/* Conversation */}
          {messages.map((m) => {
            const day = formatDate(m.created_at, { weekday: 'short', day: 'numeric', month: 'short' });
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.mine || !m.from_team;
            return (
              <View key={m.id}>
                {showDay && <Text style={styles.dayRule}>{day}</Text>}
                <View style={[styles.msgRow, mine ? styles.mineRow : styles.teamRow]}>
                  {!!m.message && m.message !== '(attachment)' && (
                    <View style={[styles.bubble, mine ? styles.mineBubble : styles.teamBubble]}>
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
                    {mine ? 'You' : `${m.author || 'BestServe'} · BestServe`} · {formatDateTime(m.created_at).split(', ').pop()}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Close / reopen */}
          {open ? (
            <View style={styles.action}>
              <View style={styles.flex1}>
                <Text style={styles.actionTitle}>Problem solved?</Text>
                <Text style={styles.actionSub}>Let us know so we can close this complaint.</Text>
              </View>
              <Pressable
                onPress={() => changeStatus('CLOSED')}
                disabled={changing}
                style={({ pressed }) => [styles.actionBtn, { backgroundColor: TONES.green.bg }, (pressed || changing) && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={[styles.actionBtnText, { color: TONES.green.fg }]}>Mark resolved</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.action}>
              <CheckCircleIcon size={22} color={TONES.green.fg} />
              <View style={styles.flex1}>
                <Text style={styles.actionTitle}>Still an issue?</Text>
                <Text style={styles.actionSub}>Reopen it, or just send a message below.</Text>
              </View>
              <Pressable
                onPress={() => changeStatus('OPEN')}
                disabled={changing}
                style={({ pressed }) => [styles.actionBtn, { backgroundColor: TONES.amber.bg }, (pressed || changing) && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={[styles.actionBtnText, { color: TONES.amber.fg }]}>Reopen</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Reply */}
        <View style={styles.composerWrap}>
          <PickedFiles picker={picker} />
          <View style={styles.composer}>
            <Pressable onPress={() => picker.setMenu(true)} style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Attach photo or file">
              <CameraIcon size={20} color={theme.textSecondary} />
            </Pressable>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder={open ? 'Write a message' : 'Write a message to reopen'}
              placeholderTextColor={theme.textMuted}
              style={styles.input}
              multiline
            />
            <Pressable onPress={send} disabled={!canSend} style={({ pressed }) => [styles.sendBtn, !canSend && styles.sendOff, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Send">
              <SendIcon size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <AttachSheet picker={picker} />
      <PhotoViewer path={viewer} onClose={() => setViewer(null)} />
    </ClientPage>
  );
}

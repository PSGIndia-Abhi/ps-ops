import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { pick, isErrorWithCode, errorCodes, types as docTypes } from '@react-native-documents/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraIcon, CloseIcon, DocumentIcon, GalleryIcon, SendIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';
import { ActionSheet } from '../tasks/ui/sheets';
import {
  attachmentHeaders,
  attachmentUri,
  checkFiles,
  MAX_FILES,
  openAttachmentFile,
  type HelpdeskAttachment,
  type HelpdeskMessage,
  type HelpdeskPriority,
  type HelpdeskStatus,
  type HelpdeskTicket,
  type PickedFile,
} from './api';
import { clock, dayLabel, fileSize, PRIORITY_LABEL, priorityColors, statusColors, TEAM_STATUS, timeAgo, USER_STATUS } from './format';
import { NoteLockIcon, PaperclipIcon } from './icons';

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

export function StatusChip({ status, team = false }: { status: HelpdeskStatus; team?: boolean }) {
  const { styles, theme } = useCrmStyles(factory);
  const c = statusColors(status, theme);
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={[styles.chipText, { color: c.fg }]}>{(team ? TEAM_STATUS : USER_STATUS)[status]}</Text>
    </View>
  );
}

export function PriorityChip({ priority }: { priority: HelpdeskPriority }) {
  const { styles, theme } = useCrmStyles(factory);
  if (priority === 'NORMAL') return null;
  const c = priorityColors(priority, theme);
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={[styles.chipText, { color: c.fg }]}>{PRIORITY_LABEL[priority]}</Text>
    </View>
  );
}

/** The red count on a Profile row. */
export function CountBadge({ count }: { count: number }) {
  const { styles } = useCrmStyles(factory);
  if (!count) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Ticket card (lists)
// ---------------------------------------------------------------------------

export function TicketCard({ ticket, team = false, onPress }: { ticket: HelpdeskTicket; team?: boolean; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const needsReply = team && (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS') && ticket.lastMessageBy === 'USER';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.code}, ${ticket.subject}`}
      style={({ pressed }) => [styles.card, ticket.unread && styles.cardUnread, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.code}>{ticket.code}</Text>
        <StatusChip status={ticket.status} team={team} />
        {team && <PriorityChip priority={ticket.priority} />}
        <Text style={styles.time}>{timeAgo(ticket.lastMessageAt)}</Text>
      </View>
      <View style={styles.subjectRow}>
        {ticket.unread && <View style={styles.dot} />}
        <Text style={[styles.subject, ticket.unread && styles.subjectUnread]} numberOfLines={1}>
          {ticket.subject}
        </Text>
      </View>
      {team ? (
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {ticket.raisedBy?.name}
            {ticket.raisedBy?.role ? ` · ${ticket.raisedBy.role}` : ''} · {ticket.source === 'APP' ? 'App' : 'Web'}
          </Text>
          {needsReply && <Text style={styles.needs}>Needs reply</Text>}
        </View>
      ) : (
        !!ticket.lastMessagePreview && (
          <Text style={styles.preview} numberOfLines={1}>
            {ticket.lastMessagePreview}
          </Text>
        )
      )}
      {team && (
        <Text style={[styles.assignee, !ticket.assignedTo && { color: theme.warningText }]}>
          {ticket.assignedTo ? `Assigned to ${ticket.assignedTo.name}` : 'Unassigned'}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

function useAuthHeaders() {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    attachmentHeaders().then((h) => alive && setHeaders(h));
    return () => {
      alive = false;
    };
  }, []);
  return headers;
}

/** Full-screen photo, closed with the X or the back button. */
function PhotoViewer({ file, onClose }: { file: HelpdeskAttachment | null; onClose: () => void }) {
  const { styles } = useCrmStyles(factory);
  const headers = useAuthHeaders();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!file} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.viewer}>
        {!!file && !!headers && <Image source={{ uri: attachmentUri(file.id), headers }} style={styles.viewerImage} resizeMode="contain" />}
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close photo" style={[styles.viewerClose, { top: insets.top + spacing.sm }]}>
          <CloseIcon size={22} color="#FFFFFF" />
        </Pressable>
        {!!file && <Text style={[styles.viewerName, { bottom: insets.bottom + spacing.lg }]} numberOfLines={1}>{file.name}</Text>}
      </View>
    </Modal>
  );
}

function AttachmentView({ file, mine, onPhoto, onError }: { file: HelpdeskAttachment; mine: boolean; onPhoto: (f: HelpdeskAttachment) => void; onError: (m: string) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const headers = useAuthHeaders();
  const [opening, setOpening] = useState(false);
  if (file.isImage) {
    return (
      <Pressable onPress={() => onPhoto(file)} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${file.name}`} style={styles.attImage}>
        {headers ? <Image source={{ uri: attachmentUri(file.id), headers }} style={styles.attImageInner} /> : <ActivityIndicator color={theme.primary} />}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={async () => {
        setOpening(true);
        try {
          await openAttachmentFile(file);
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Could not open the file.');
        } finally {
          setOpening(false);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${file.name}`}
      style={[styles.attFile, mine && styles.attFileMine]}
    >
      <View style={styles.attFileIcon}>{opening ? <ActivityIndicator size="small" color={theme.dangerText} /> : <DocumentIcon size={18} color={theme.dangerText} />}</View>
      <View style={styles.flex}>
        <Text style={styles.attFileName} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.attFileSize}>{fileSize(file.size)} · Tap to open</Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

/** The conversation. `team` = the technical team is reading (internal notes shown, names everyone). */
export function Thread({ messages, team = false, onError }: { messages: HelpdeskMessage[]; team?: boolean; onError: (m: string) => void }) {
  const { styles } = useCrmStyles(factory);
  const [photo, setPhoto] = useState<HelpdeskAttachment | null>(null);
  return (
    <View>
      {messages.map((m, i) => {
        const showDay = i === 0 || new Date(m.createdAt).toDateString() !== new Date(messages[i - 1].createdAt).toDateString();
        return (
          <View key={m.id}>
            {showDay && (
              <View style={styles.dayWrap}>
                <Text style={styles.day}>{dayLabel(m.createdAt)}</Text>
              </View>
            )}
            {m.kind === 'SYSTEM' ? (
              <Text style={styles.system}>
                {m.body} · {clock(m.createdAt)}
              </Text>
            ) : (
              <View style={[styles.msg, m.isMine && styles.msgMine]}>
                {!m.isMine && (
                  <Text style={styles.who} numberOfLines={1}>
                    {m.side === 'AGENT' && !team ? `Technical team · ${m.sender?.name ?? ''}` : m.sender?.name ?? 'Unknown'}
                    {team && m.side === 'USER' ? '  ·  Requester' : ''}
                  </Text>
                )}
                {m.kind === 'NOTE' && (
                  <View style={styles.noteTag}>
                    <NoteLockIcon />
                    <Text style={styles.noteTagText}>Internal note · only the technical team sees this</Text>
                  </View>
                )}
                <View style={[styles.bubble, m.isMine && styles.bubbleMine, m.kind === 'NOTE' && styles.bubbleNote]}>
                  {!!m.body && m.body !== '(file attached)' && <Text style={[styles.text, m.isMine && m.kind !== 'NOTE' && styles.textMine]}>{m.body}</Text>}
                  {m.attachments.length > 0 && (
                    <View style={styles.atts}>
                      {m.attachments.map((f) => (
                        <AttachmentView key={f.id} file={f} mine={m.isMine && m.kind !== 'NOTE'} onPhoto={setPhoto} onError={onError} />
                      ))}
                    </View>
                  )}
                </View>
                <Text style={styles.msgTime}>{clock(m.createdAt)}</Text>
              </View>
            )}
          </View>
        );
      })}
      <PhotoViewer file={photo} onClose={() => setPhoto(null)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Picking files: camera, gallery, PDF
// ---------------------------------------------------------------------------

const PHOTO_OPTIONS = { mediaType: 'photo' as const, quality: 0.8 as const, maxWidth: 1600, maxHeight: 1600 };

function fromAssets(res: ImagePickerResponse): PickedFile[] {
  if (res.didCancel || res.errorCode) return [];
  return (res.assets ?? [])
    .filter((a) => !!a.uri)
    .map((a, i) => ({
      uri: a.uri as string,
      name: a.fileName || `photo-${Date.now()}-${i}.jpg`,
      type: a.type || 'image/jpeg',
      size: a.fileSize,
    }));
}

export function useFilePicker() {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const add = (incoming: PickedFile[]) => {
    if (!incoming.length) return;
    setFiles((cur) => {
      const res = checkFiles(cur, incoming);
      if (res.error) {
        setError(res.error);
        return cur;
      }
      setError(null);
      return res.files ?? cur;
    });
  };

  const camera = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Camera permission',
        message: 'BestServe needs the camera to take a photo of the problem for the technical team.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setError('Camera permission was denied. Enable it in Settings to take a photo.');
        return;
      }
    }
    add(fromAssets(await launchCamera(PHOTO_OPTIONS)));
  };

  const gallery = async () => {
    const left = MAX_FILES - files.length;
    if (left <= 0) return setError(`You can attach up to ${MAX_FILES} files.`);
    add(fromAssets(await launchImageLibrary({ ...PHOTO_OPTIONS, selectionLimit: left })));
  };

  const pdf = async () => {
    try {
      const results = await pick({ allowMultiSelection: true, type: [docTypes.pdf] });
      add(results.map((r, i) => ({ uri: r.uri, name: r.name || `document-${Date.now()}-${i}.pdf`, type: r.type || 'application/pdf', size: r.size ?? undefined })));
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      setError('Unable to open the file picker. Please try again.');
    }
  };

  const remove = (i: number) => setFiles((cur) => cur.filter((_, idx) => idx !== i));
  const reset = () => {
    setFiles([]);
    setError(null);
  };
  return { files, error, setError, add, camera, gallery, pdf, remove, reset, menu, setMenu };
}

export type FilePicker = ReturnType<typeof useFilePicker>;

/** "Add photo or file" choices, as the app's own bottom sheet. */
export function AttachSheet({ picker }: { picker: FilePicker }) {
  const { theme } = useCrmStyles(factory);
  return (
    <ActionSheet
      visible={picker.menu}
      onClose={() => picker.setMenu(false)}
      title="Attach"
      actions={[
        { key: 'camera', label: 'Take a photo', sub: 'Use the camera', icon: <CameraIcon size={18} color={theme.primary} />, onPress: () => setTimeout(picker.camera, 250) },
        { key: 'gallery', label: 'Choose from gallery', sub: 'Screenshots and photos', icon: <GalleryIcon size={18} color={theme.primary} />, onPress: () => setTimeout(picker.gallery, 250) },
        { key: 'pdf', label: 'PDF document', sub: 'From your files', icon: <DocumentIcon size={18} color={theme.dangerText} />, iconBg: theme.dangerBg, onPress: () => setTimeout(picker.pdf, 250) },
      ]}
    />
  );
}

/** Thumbnails of what's picked, each with a remove X. */
export function PickedFiles({ picker }: { picker: FilePicker }) {
  const { styles, theme } = useCrmStyles(factory);
  if (!picker.files.length && !picker.error) return null;
  return (
    <View>
      {picker.files.length > 0 && (
        <View style={styles.picks}>
          {picker.files.map((f, i) => (
            <View key={`${f.uri}-${i}`} style={styles.pick}>
              {f.type.startsWith('image/') ? (
                <Image source={{ uri: f.uri }} style={styles.pickThumb} />
              ) : (
                <View style={[styles.pickThumb, styles.pickPdf]}>
                  <DocumentIcon size={18} color={theme.dangerText} />
                  <Text style={styles.pickPdfText}>PDF</Text>
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.pickName} numberOfLines={1}>
                  {f.name}
                </Text>
                {!!f.size && <Text style={styles.pickSize}>{fileSize(f.size)}</Text>}
              </View>
              <Pressable onPress={() => picker.remove(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} style={styles.pickX}>
                <CloseIcon size={14} color={theme.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {!!picker.error && <Text style={styles.pickError}>{picker.error}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Reply bar
// ---------------------------------------------------------------------------

/** Under the thread. `team` adds the Reply / Internal note switch. */
export function Composer({
  onSend,
  team = false,
  placeholder = 'Write a message…',
}: {
  onSend: (input: { message: string; files: PickedFile[]; internal: boolean }) => Promise<void>;
  team?: boolean;
  placeholder?: string;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const insets = useSafeAreaInsets();
  const picker = useFilePicker();
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const canSend = !sending && (text.trim().length > 0 || picker.files.length > 0);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend({ message: text.trim(), files: picker.files, internal: team && internal });
      setText('');
      picker.reset();
    } catch (e) {
      picker.setError(e instanceof Error ? e.message : 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.composer, internal && styles.composerNote, { paddingBottom: Math.max(insets.bottom, spacing.xs) + spacing.xs }]}>
      {team && (
        <View style={styles.mode}>
          {([false, true] as const).map((isNote) => (
            <Pressable key={String(isNote)} onPress={() => setInternal(isNote)} accessibilityRole="button" accessibilityState={{ selected: internal === isNote }} style={[styles.modeBtn, internal === isNote && styles.modeBtnOn]}>
              {isNote && <NoteLockIcon size={12} color={internal ? '#B45309' : theme.textMuted} />}
              <Text style={[styles.modeText, internal === isNote && (isNote ? styles.modeTextNote : styles.modeTextOn)]}>{isNote ? 'Internal note' : 'Reply to user'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <PickedFiles picker={picker} />
      <View style={styles.composeRow}>
        <Pressable onPress={() => picker.setMenu(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Attach a photo or file" style={styles.attachBtn}>
          <PaperclipIcon size={21} color={theme.textSecondary} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={internal ? "Note for the team (the user won't see it)…" : placeholder}
          placeholderTextColor={theme.textMuted}
          multiline
          maxLength={5000}
          editable={!sending}
          style={styles.input}
        />
        <Pressable onPress={send} disabled={!canSend} accessibilityRole="button" accessibilityLabel="Send" style={[styles.sendBtn, !canSend && styles.sendBtnOff]}>
          {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <SendIcon size={18} color="#FFFFFF" />}
        </Pressable>
      </View>
      <AttachSheet picker={picker} />
    </View>
  );
}

// ---------------------------------------------------------------------------

const factory = (t: CrmTheme) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  chipText: { fontSize: 11.5, fontWeight: '700' as const },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: t.danger, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: spacing.xs },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' as const },

  card: { backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginBottom: spacing.sm, ...t.cardShadow },
  cardUnread: { borderLeftWidth: 4, borderLeftColor: t.primary },
  cardTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 6 },
  code: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.3 },
  time: { marginLeft: 'auto' as const, ...typography.caption, color: t.textMuted },
  subjectRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.primary },
  subject: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  subjectUnread: { fontWeight: '800' as const },
  preview: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: 4 },
  meta: { ...typography.caption, color: t.textSecondary, flex: 1 },
  needs: { ...typography.captionMedium, color: t.dangerText },
  assignee: { ...typography.captionMedium, color: t.textSecondary, marginTop: 4 },

  dayWrap: { alignItems: 'center' as const, marginVertical: spacing.sm },
  day: { ...typography.captionMedium, color: t.textSecondary, backgroundColor: t.surfaceAlt, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill, overflow: 'hidden' as const },
  system: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginVertical: 6, paddingHorizontal: spacing.lg },
  msg: { alignSelf: 'flex-start' as const, maxWidth: '86%' as const, marginVertical: 5 },
  msgMine: { alignSelf: 'flex-end' as const, alignItems: 'flex-end' as const },
  who: { ...typography.captionMedium, color: t.textSecondary, marginBottom: 3, marginHorizontal: 4 },
  noteTag: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginBottom: 3, marginHorizontal: 4 },
  noteTagText: { fontSize: 11, fontWeight: '700' as const, color: '#B45309' },
  bubble: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleMine: { backgroundColor: t.primary, borderColor: t.primary, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  bubbleNote: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  text: { ...typography.body, color: t.textPrimary },
  textMine: { color: '#FFFFFF' },
  msgTime: { fontSize: 11, color: t.textMuted, marginTop: 3, marginHorizontal: 4 },
  atts: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  attImage: { width: 140, height: 104, borderRadius: radii.md, overflow: 'hidden' as const, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  attImageInner: { width: '100%' as const, height: '100%' as const },
  attFile: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, padding: spacing.xs, borderRadius: radii.md, backgroundColor: t.surfaceAlt, minWidth: 200, maxWidth: 240 },
  attFileMine: { backgroundColor: '#FFFFFF' },
  attFileIcon: { width: 34, height: 34, borderRadius: radii.sm, backgroundColor: t.dangerBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  attFileName: { ...typography.captionMedium, color: t.textPrimary },
  attFileSize: { fontSize: 11, color: t.textMuted },

  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center' as const, justifyContent: 'center' as const },
  viewerImage: { width: '100%' as const, height: '80%' as const },
  viewerClose: { position: 'absolute' as const, right: spacing.md, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center' as const, justifyContent: 'center' as const },
  viewerName: { position: 'absolute' as const, left: spacing.lg, right: spacing.lg, color: '#FFFFFF', textAlign: 'center' as const, ...typography.caption },

  picks: { gap: 6, marginBottom: spacing.xs },
  pick: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, padding: 6, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  pickThumb: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: t.surfaceAlt },
  pickPdf: { backgroundColor: t.dangerBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  pickPdfText: { fontSize: 9, fontWeight: '800' as const, color: t.dangerText },
  pickName: { ...typography.captionMedium, color: t.textPrimary },
  pickSize: { fontSize: 11, color: t.textMuted },
  pickX: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  pickError: { ...typography.captionMedium, color: t.dangerText, marginBottom: spacing.xs },

  composer: { borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  composerNote: { backgroundColor: '#FFFBEB' },
  mode: { flexDirection: 'row' as const, alignSelf: 'flex-start' as const, backgroundColor: t.surfaceAlt, borderRadius: radii.md, padding: 3, marginBottom: spacing.xs },
  modeBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.sm },
  modeBtnOn: { backgroundColor: t.surface, ...t.cardShadow },
  modeText: { ...typography.captionMedium, color: t.textMuted },
  modeTextOn: { color: t.textPrimary },
  modeTextNote: { color: '#B45309' },
  composeRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 6 },
  attachBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  input: { flex: 1, minHeight: 44, maxHeight: 130, borderWidth: 1, borderColor: t.border, borderRadius: 22, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, ...typography.body, color: t.textPrimary, backgroundColor: t.background },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  sendBtnOff: { backgroundColor: t.border },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import {
  errorCodes,
  isErrorWithCode,
  pick,
} from '@react-native-documents/picker';
import {
  AlertCircleIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  DocumentIcon,
  GalleryIcon,
  PersonIcon,
  PlayIcon,
  PlusIcon,
  TagIcon,
} from '../../components/icons';
import { getToken } from '../../auth/tokenStorage';
import { API_BASE_URL } from '../../config/env';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import {
  fmtDateShort,
  fmtDateTime,
  fmtTimestamp,
  formatBytes,
  isFinished,
  recurrenceSummary,
  timeAgo,
  todayStr,
} from '../format';
import type { TaskStackParamList } from '../navigation';
import { errorMessage, useTasks } from '../TasksContext';
import { STATE_META, taskState } from '../theme';
import type {
  TaskAttachment,
  TaskComment,
  TaskHistoryEntry,
  TaskSeries,
  WorkTask,
} from '../types';
import {
  Avatar,
  Card,
  InfoRow,
  inputStyle,
  PriorityPill,
  ScreenHeader,
  TaskStatePill,
  TaskSummaryCard,
} from '../ui/parts';
import { ActionSheet, Sheet, type SheetAction } from '../ui/sheets';
import {
  DotsIcon,
  EditIcon,
  HistoryIcon,
  PaperclipIcon,
  RepeatIcon,
  SkipIcon,
  SwapIcon,
  TrashIcon,
} from '../ui/taskIcons';

type Tab = 'details' | 'updates' | 'files' | 'history';
type Dialog =
  | null
  | 'menu'
  | 'update'
  | 'delete'
  | 'skip'
  | 'series'
  | 'upload';

const HISTORY_LABEL: Record<string, string> = {
  CREATE: 'Created',
  START: 'Started',
  UPDATE: 'Updated',
  COMPLETE: 'Completed',
  CANCEL: 'Cancelled',
  REASSIGN: 'Reassigned',
  RESCHEDULE: 'Rescheduled',
  SKIP: 'Skipped',
};

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  tabs: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  tab: { flex: 1, alignItems: 'center' as const, paddingVertical: spacing.sm },
  tabOn: {
    borderBottomWidth: 2.5,
    borderBottomColor: t.primary,
    marginBottom: -1,
  },
  tabText: { ...typography.bodyMedium, color: t.textMuted },
  tabTextOn: { color: t.primary },
  // Shrinks and wraps next to the avatar instead of running past the card edge.
  personName: { ...typography.bodyMedium, color: t.textPrimary, flexShrink: 1 },
  link: { ...typography.bodyMedium, color: t.primary },
  person: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
  },
  descBox: {
    backgroundColor: t.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  descTitle: {
    ...typography.bodyMedium,
    color: t.textPrimary,
    marginBottom: spacing.xxs,
  },
  descText: { ...typography.body, color: t.textSecondary },
  sectionCard: { marginBottom: spacing.md },
  cardHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  cardTitle: { ...typography.bodyMedium, color: t.textPrimary },
  progress: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.successBg,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  progressTitle: { ...typography.bodyMedium, color: t.successText },
  progressSub: { ...typography.caption, color: t.successText },
  update: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  updateHead: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  updateName: { ...typography.bodyMedium, color: t.textPrimary },
  updateTime: { ...typography.caption, color: t.textMuted },
  updateText: { ...typography.body, color: t.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: t.border, marginVertical: spacing.xs },
  muted: {
    ...typography.body,
    color: t.textMuted,
    textAlign: 'center' as const,
    paddingVertical: spacing.md,
  },
  fileRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  fileMain: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: t.primarySoftBg,
  },
  fileIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  fileName: { ...typography.bodyMedium, color: t.textPrimary },
  fileMeta: { ...typography.caption, color: t.textMuted },
  hRow: { flexDirection: 'row' as const, gap: spacing.sm },
  hRail: { width: 14, alignItems: 'center' as const },
  hDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  hLine: { width: 2, flex: 1, backgroundColor: t.border, marginTop: 4 },
  hBody: { flex: 1, paddingBottom: spacing.md },
  hTitle: { ...typography.bodyMedium, color: t.textPrimary },
  hNote: { ...typography.body, color: t.textSecondary, marginTop: 2 },
  hTime: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  footer: {
    backgroundColor: t.surface,
    borderTopWidth: 1,
    borderTopColor: t.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    paddingVertical: spacing.sm,
  },
  action: {
    alignItems: 'center' as const,
    gap: 4,
    minWidth: 64,
    paddingVertical: 4,
  },
  actionText: { ...typography.caption, color: t.textSecondary },
  input: { ...inputStyle(t), marginBottom: spacing.sm },
  multi: {
    minHeight: 90,
    paddingTop: spacing.sm,
    textAlignVertical: 'top' as const,
  },
  sheetText: {
    ...typography.body,
    color: t.textSecondary,
    marginBottom: spacing.md,
  },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
  seriesHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  occRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: spacing.xs,
  },
  previewWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center' as const,
  },
  previewImg: { width: '100%' as const, height: '80%' as const },
  previewClose: {
    position: 'absolute' as const,
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

export function TaskDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { taskId } =
    useRoute<RouteProp<TaskStackParamList, 'TaskDetail'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const {
    viewer,
    assignable,
    tasks,
    patch,
    removeTask,
    showToast,
    notifyLocal,
    refresh: refreshList,
  } = useTasks();

  const [task, setTask] = useState<WorkTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [files, setFiles] = useState<TaskAttachment[] | null>(null);
  const [history, setHistory] = useState<TaskHistoryEntry[] | null>(null);
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const [authHeader, setAuthHeader] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getTask(taskId);
      setTask(data);
      patch(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [taskId, patch]);
  const loadComments = useCallback(
    () =>
      api
        .listComments(taskId)
        .then(setComments)
        .catch(() => setComments([])),
    [taskId],
  );
  const loadFiles = useCallback(
    () =>
      api
        .listAttachments(taskId)
        .then(setFiles)
        .catch(() => setFiles([])),
    [taskId],
  );
  const loadHistory = useCallback(
    () =>
      api
        .listHistory(taskId)
        .then(setHistory)
        .catch(() => setHistory([])),
    [taskId],
  );

  useEffect(() => {
    load();
    loadComments();
    loadFiles();
    loadHistory();
    getToken().then(tok => tok && setAuthHeader(`Bearer ${tok}`));
  }, [load, loadComments, loadFiles, loadHistory]);

  // Coming back from Reassign / Reschedule / Complete: those screens patch the
  // shared list, so pick up the newer copy (and its new history) from there.
  const listCopy = tasks.find(x => x.id === taskId);
  useEffect(() => {
    if (listCopy && task && listCopy.updated_at !== task.updated_at) {
      setTask({ ...task, ...listCopy });
      loadHistory();
      loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listCopy]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), loadComments(), loadFiles(), loadHistory()]);
    setRefreshing(false);
  }

  /** Runs one action; the server's answer (or refusal) is what the user sees. */
  async function run(
    fn: () => Promise<WorkTask | void>,
    success: string | null,
  ) {
    setBusy(true);
    try {
      const updated = await fn();
      if (updated) {
        setTask(updated);
        patch(updated);
      }
      setDialog(null);
      setReason('');
      if (success) showToast(success);
      loadHistory();
      return true;
    } catch (err) {
      showToast(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Task Details" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          {loadError ? (
            <CrmEmptyState
              title="Task not found"
              subtitle={`${loadError}\nIt may have been removed, or you may not have access.`}
              action={
                <PrimaryButton
                  label="Go back"
                  onPress={() => navigation.goBack()}
                />
              }
            />
          ) : (
            <ActivityIndicator color={theme.primary} size="large" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Same client-side hints as the web TaskDetail - the server has the final say.
  const finished = isFinished(task.status);
  const canWork = task.assigned_to === viewer.id && !finished;
  const isPlainAssignee =
    task.assigned_to === viewer.id &&
    task.created_by !== viewer.id &&
    !viewer.isAdmin;
  const canEditTerms = !isPlainAssignee && !finished;
  const canReassign =
    !finished && assignable.some(p => p.id !== task.assigned_to);
  const state = taskState(task);
  const explainFinished = (what: string) =>
    showToast(
      `This task is ${
        task.status === 'COMPLETED' ? 'completed' : 'cancelled'
      }, so it can't be ${what}.`,
      'validation',
    );

  const menu: SheetAction[] = [
    ...(task.series_id
      ? [
          {
            key: 'series',
            label: 'Recurring schedule',
            icon: <RepeatIcon size={18} color={theme.primary} />,
            onPress: () => setDialog('series'),
          },
        ]
      : []),
    {
      key: 'dup',
      label: 'Duplicate',
      icon: <PaperclipIcon size={18} color={theme.primary} />,
      onPress: () =>
        run(async () => {
          await api.createTask({
            title: `${task.title} (copy)`,
            description: task.description || undefined,
            task_type: task.task_type || undefined,
            priority: task.priority,
            assigned_to: task.assigned_to,
            due_date: task.due_date || todayStr(),
            due_time: task.due_time || undefined,
          });
          await refreshList();
        }, 'Task duplicated'),
    },
    {
      key: 'files',
      label: 'Attach a file',
      icon: <PaperclipIcon size={18} color={theme.primary} />,
      onPress: () => setDialog('upload'),
    },
    ...(task.series_id && canEditTerms
      ? [
          {
            key: 'skip',
            label: 'Skip this occurrence',
            icon: <SkipIcon size={18} color={theme.dangerText} />,
            danger: true,
            onPress: () => setDialog('skip'),
          },
        ]
      : []),
    // Delete is permanent and only the task's creator may do it (the backend
    // enforces this too), so it's only offered to them.
    ...(task.created_by === viewer.id
      ? [
          {
            key: 'delete',
            label: 'Delete task',
            icon: <TrashIcon size={18} color={theme.dangerText} />,
            danger: true,
            onPress: () => setDialog('delete'),
          },
        ]
      : []),
  ];

  const fileSource = (f: TaskAttachment) => ({
    uri: `${API_BASE_URL}${api.attachmentViewPath(task.id, f.id)}`,
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
  const isImage = (f: TaskAttachment) =>
    (f.file_type || '').startsWith('image/');

  async function saveUpdate() {
    const text = note.trim();
    if (!text)
      return showToast('Write the update before saving.', 'validation');
    // The assignee of a started task records progress (with an optional next
    // action); anyone else who can see the task leaves a comment.
    const asProgress = canWork && task!.status === 'IN_PROGRESS';
    const ok = asProgress
      ? await run(
          () => api.addProgress(task!.id, text, nextAction.trim() || undefined),
          'Comment added',
        )
      : await run(async () => {
          await api.addComment(task!.id, text);
        }, 'Comment added');
    if (ok) {
      setNote('');
      setNextAction('');
      loadComments();
    }
  }

  async function upload(
    file: { uri: string; name: string; type: string } | null,
  ) {
    if (!file) return;
    setBusy(true);
    try {
      await api.uploadAttachment(task!.id, file);
      showToast('File attached');
      loadFiles();
      setTab('files');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }
  const fromPicker = (res: ImagePickerResponse) => {
    const a = res.assets?.[0];
    return a?.uri
      ? {
          uri: a.uri,
          name: a.fileName || `photo-${Date.now()}.jpg`,
          type: a.type || 'image/jpeg',
        }
      : null;
  };
  async function pickCamera() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED)
        return showToast('Camera permission was denied.', 'permission');
    }
    upload(
      fromPicker(
        await launchCamera({
          mediaType: 'photo',
          quality: 0.7,
          maxWidth: 1920,
          maxHeight: 1920,
        }),
      ),
    );
  }
  async function pickGallery() {
    upload(
      fromPicker(
        await launchImageLibrary({
          mediaType: 'photo',
          quality: 0.7,
          maxWidth: 1920,
          maxHeight: 1920,
          selectionLimit: 1,
        }),
      ),
    );
  }
  async function pickDocument() {
    try {
      const [r] = await pick();
      upload({
        uri: r.uri,
        name: r.name || `file-${Date.now()}`,
        type: r.type || 'application/octet-stream',
      });
    } catch (err) {
      if (!(isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED))
        showToast('Could not open the file picker.', 'error');
    }
  }
  async function removeFile(f: TaskAttachment) {
    try {
      await api.deleteAttachment(task!.id, f.id);
      setFiles(list => (list || []).filter(x => x.id !== f.id));
      showToast('File removed');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  const newestFirst = [...(comments || [])].reverse();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Task Details" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <TaskSummaryCard task={task} right={<TaskStatePill task={task} />} />

        <View style={styles.tabs}>
          {(
            [
              ['details', 'Details'],
              ['updates', 'Comments'],
              ['files', `Files${files?.length ? ` ${files.length}` : ''}`],
              ['history', 'History'],
            ] as const
          ).map(([key, label]) => {
            const on = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'details' && (
          <Card>
            <InfoRow
              icon={<AlertCircleIcon size={18} color={theme.textMuted} />}
              label="Status"
            >
              <StatusBadge
                label={STATE_META[state].label}
                tone={STATE_META[state].tone}
                dot={false}
              />
            </InfoRow>
            <InfoRow
              icon={<AlertCircleIcon size={18} color={theme.textMuted} />}
              label="Priority"
            >
              <PriorityPill priority={task.priority} />
            </InfoRow>
            {!!task.task_type && (
              <InfoRow
                icon={<TagIcon size={18} color={theme.textMuted} />}
                label="Task Type"
              >
                {task.task_type}
              </InfoRow>
            )}
            <InfoRow
              icon={<PersonIcon size={18} color={theme.textMuted} />}
              label="Assigned To"
            >
              <View style={styles.person}>
                <Avatar
                  name={task.assigned_to_name}
                  id={task.assigned_to}
                  size={26}
                />
                <Text style={styles.personName}>
                  {task.assigned_to_name}
                  {task.assigned_to === viewer.id ? ' (you)' : ''}
                </Text>
              </View>
            </InfoRow>
            <InfoRow
              icon={<CalendarIcon size={18} color={theme.textMuted} />}
              label="Due Date & Time"
            >
              {fmtDateTime(task.due_date, task.due_time)}
            </InfoRow>
            <InfoRow
              icon={<PersonIcon size={18} color={theme.textMuted} />}
              label="Created By"
            >
              {`${task.created_by_name ?? ''}${
                task.created_by === viewer.id ? ' (you)' : ''
              }`}
            </InfoRow>
            <InfoRow
              icon={<ClockIcon size={18} color={theme.textMuted} />}
              label="Created On"
            >
              {fmtTimestamp(task.created_at)}
            </InfoRow>
            <InfoRow
              icon={<RepeatIcon size={18} color={theme.textMuted} />}
              label="Schedule"
            >
              {task.series_id ? (
                <Pressable onPress={() => setDialog('series')}>
                  <Text style={styles.link}>Recurring</Text>
                </Pressable>
              ) : (
                'One time'
              )}
            </InfoRow>
            {!!task.completed_at && (
              <InfoRow
                icon={<CheckCircleIcon size={18} color={theme.textMuted} />}
                label="Completed"
              >
                {fmtTimestamp(task.completed_at)}
              </InfoRow>
            )}
            {!!(task.description || task.completion_note) && (
              <View style={styles.descBox}>
                {!!task.description && (
                  <>
                    <Text style={styles.descTitle}>Description</Text>
                    <Text style={styles.descText}>{task.description}</Text>
                  </>
                )}
                {!!task.completion_note && (
                  <>
                    <Text
                      style={[
                        styles.descTitle,
                        !!task.description && { marginTop: spacing.sm },
                      ]}
                    >
                      Completion note
                    </Text>
                    <Text style={styles.descText}>{task.completion_note}</Text>
                  </>
                )}
              </View>
            )}
          </Card>
        )}

        {tab === 'updates' && (
          <>
            {task.status === 'IN_PROGRESS' && (
              <View style={styles.progress}>
                <PlayIcon size={20} color={theme.success} />
                <View style={styles.flex}>
                  <Text style={styles.progressTitle}>Task in Progress</Text>
                  {!!task.started_at && (
                    <Text style={styles.progressSub}>
                      Started at {fmtTimestamp(task.started_at)}
                    </Text>
                  )}
                </View>
              </View>
            )}
            {!!task.next_action && (
              <Card style={styles.sectionCard}>
                <View style={styles.cardHead}>
                  <ClockIcon size={16} color={theme.primary} />
                  <Text style={styles.cardTitle}>Next Action</Text>
                </View>
                <Text style={styles.descText}>
                  {task.next_action}
                  {task.next_action_date
                    ? ` · ${fmtDateShort(task.next_action_date)}`
                    : ''}
                </Text>
              </Card>
            )}
            <Card style={styles.sectionCard}>
              <View style={styles.cardHead}>
                <HistoryIcon size={16} color={theme.primary} />
                <Text style={styles.cardTitle}>Comments</Text>
              </View>
              {comments === null && <ActivityIndicator color={theme.primary} />}
              {comments?.length === 0 && (
                <Text style={styles.muted}>No comments yet.</Text>
              )}
              {newestFirst.map((c, i) => (
                <View key={c.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.update}>
                    <Avatar name={c.user_name} id={c.user_id} size={32} />
                    <View style={styles.flex}>
                      <View style={styles.updateHead}>
                        <Text style={styles.updateName}>{c.user_name}</Text>
                        <Text style={styles.updateTime}>
                          {timeAgo(c.created_at)}
                        </Text>
                      </View>
                      <Text style={styles.updateText}>{c.comment}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
            <PrimaryButton
              label="Add Comment"
              icon={<PlusIcon size={18} color={theme.textOnPrimary} />}
              onPress={() => setDialog('update')}
            />
          </>
        )}

        {tab === 'files' && (
          <Card>
            {files === null && <ActivityIndicator color={theme.primary} />}
            {files?.length === 0 && (
              <Text style={styles.muted}>No files attached.</Text>
            )}
            {files?.map(f => (
              <View key={f.id} style={styles.fileRow}>
                <Pressable
                  onPress={() =>
                    isImage(f)
                      ? setPreview(f)
                      : showToast(
                          'Only images can be previewed in the app.',
                          'validation',
                        )
                  }
                  style={styles.fileMain}
                >
                  {isImage(f) && authHeader ? (
                    <Image source={fileSource(f)} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.fileIcon]}>
                      <DocumentIcon size={22} color={theme.primary} />
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {f.file_name}
                    </Text>
                    <Text style={styles.fileMeta}>
                      {[
                        formatBytes(f.file_size),
                        f.uploaded_by_name,
                        timeAgo(f.created_at),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => removeFile(f)}
                  hitSlop={10}
                  accessibilityLabel={`Remove ${f.file_name}`}
                >
                  <TrashIcon size={18} color={theme.textMuted} />
                </Pressable>
              </View>
            ))}
            <PrimaryButton
              label="Attach a file"
              variant="secondary"
              onPress={() => setDialog('upload')}
              loading={busy}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        )}

        {tab === 'history' && (
          <Card>
            {history === null && <ActivityIndicator color={theme.primary} />}
            {history?.map((h, i) => (
              <View key={h.id} style={styles.hRow}>
                <View style={styles.hRail}>
                  <View
                    style={[
                      styles.hDot,
                      {
                        backgroundColor:
                          h.to_status === 'COMPLETED'
                            ? theme.success
                            : h.to_status === 'CANCELLED'
                            ? theme.textMuted
                            : theme.primary,
                      },
                    ]}
                  />
                  {i < history.length - 1 && <View style={styles.hLine} />}
                </View>
                <View style={styles.hBody}>
                  <Text style={styles.hTitle}>
                    {HISTORY_LABEL[h.action] || h.action}
                    {h.changed_by_name ? ` by ${h.changed_by_name}` : ''}
                  </Text>
                  {!!h.note && <Text style={styles.hNote}>{h.note}</Text>}
                  <Text style={styles.hTime}>{fmtTimestamp(h.changed_at)}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Always shown (finished tasks keep just "More"); the header no longer has a ⋯ button. */}
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {canWork && task.status === 'OPEN' && (
          <PrimaryButton
            label="Start Task"
            icon={<PlayIcon size={18} color={theme.textOnPrimary} />}
            loading={busy}
            onPress={() => run(() => api.startTask(task.id), 'Task started')}
          />
        )}
        {canWork && task.status === 'IN_PROGRESS' && (
          // One tap completes the task - no separate Complete screen.
          <PrimaryButton
            label="Completed"
            icon={<CheckCircleIcon size={18} color={theme.textOnPrimary} />}
            loading={busy}
            onPress={() =>
              run(async () => {
                const done = await api.completeTask(task.id);
                notifyLocal(done, 'completed');
                return done;
              }, null)
            }
          />
        )}
        <View style={styles.actions}>
          {/* On a completed/cancelled task these stay visible but greyed
              out - the server refuses them, so a tap just explains why. */}
          {(canEditTerms || (finished && !isPlainAssignee)) && (
            <ActionButton
              icon={<EditIcon size={20} color={theme.primary} />}
              label="Edit"
              disabled={finished}
              onPress={() =>
                finished
                  ? explainFinished('edited')
                  : navigation.navigate('NewTask', { editId: task.id })
              }
            />
          )}
          {(canReassign || (finished && !isPlainAssignee)) && (
            <ActionButton
              icon={<SwapIcon size={20} color={theme.primary} />}
              label="Reassign"
              disabled={finished}
              onPress={() =>
                finished
                  ? explainFinished('reassigned')
                  : navigation.navigate('Reassign', { taskId: task.id })
              }
            />
          )}
          {(canEditTerms || (finished && !isPlainAssignee)) && (
            <ActionButton
              icon={<CalendarIcon size={20} color={theme.primary} />}
              label="Reschedule"
              disabled={finished}
              onPress={() =>
                finished
                  ? explainFinished('rescheduled')
                  : navigation.navigate('Reschedule', { taskId: task.id })
              }
            />
          )}
          <ActionButton
            icon={<DotsIcon size={20} color={theme.primary} />}
            label="More"
            onPress={() => setDialog('menu')}
          />
        </View>
      </SafeAreaView>

      <ActionSheet
        visible={dialog === 'menu'}
        onClose={() => setDialog(null)}
        title="More options"
        actions={menu}
      />

      <Sheet
        visible={dialog === 'update'}
        onClose={() => setDialog(null)}
        title="Add Comment"
      >
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Write a comment"
          placeholderTextColor={theme.textMuted}
          style={[styles.input, styles.multi]}
          multiline
          maxLength={5000}
        />
        {canWork && task.status === 'IN_PROGRESS' && (
          <TextInput
            value={nextAction}
            onChangeText={setNextAction}
            placeholder="Next action (optional)"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            maxLength={255}
          />
        )}
        <PrimaryButton label="Save" loading={busy} onPress={saveUpdate} />
      </Sheet>

      <Sheet
        visible={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Delete this task?"
      >
        <Text style={styles.sheetText}>
          “{task.title}” will be permanently deleted with all its comments,
          files and history. This can’t be undone.
        </Text>
        <View style={styles.sheetButtons}>
          <PrimaryButton
            label="Keep it"
            variant="secondary"
            style={styles.flex}
            onPress={() => setDialog(null)}
          />
          <PrimaryButton
            label="Delete"
            variant="brand"
            style={styles.flex}
            loading={busy}
            onPress={async () => {
              const ok = await run(async () => {
                await api.deleteTask(task.id);
              }, 'Task deleted');
              if (ok) {
                removeTask(task.id);
                navigation.goBack();
              }
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={dialog === 'skip'}
        onClose={() => setDialog(null)}
        title="Skip this occurrence?"
      >
        <Text style={styles.sheetText}>
          Only this one is cancelled — the schedule and its other occurrences
          stay as they are.
        </Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Reason (optional)"
          placeholderTextColor={theme.textMuted}
          style={styles.input}
        />
        <PrimaryButton
          label="Skip occurrence"
          variant="brand"
          loading={busy}
          onPress={() =>
            run(
              () => api.skipTask(task.id, reason.trim() || undefined),
              'Occurrence skipped',
            )
          }
        />
      </Sheet>

      <ActionSheet
        visible={dialog === 'upload'}
        onClose={() => setDialog(null)}
        title="Attach a file"
        actions={[
          {
            key: 'cam',
            label: 'Take a photo',
            icon: <CameraIcon size={18} color={theme.primary} />,
            onPress: pickCamera,
          },
          {
            key: 'gal',
            label: 'Choose from gallery',
            icon: <GalleryIcon size={18} color={theme.primary} />,
            onPress: pickGallery,
          },
          {
            key: 'doc',
            label: 'Pick a document',
            icon: <DocumentIcon size={18} color={theme.primary} />,
            onPress: pickDocument,
          },
        ]}
      />

      {!!task.series_id && (
        <SeriesSheet
          visible={dialog === 'series'}
          onClose={() => setDialog(null)}
          seriesId={task.series_id}
          allowManage={canEditTerms || task.created_by === viewer.id}
          onChanged={refreshList}
        />
      )}

      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
        statusBarTranslucent
      >
        <SafeAreaView style={styles.previewWrap}>
          {preview && (
            <Image
              source={fileSource(preview)}
              style={styles.previewImg}
              resizeMode="contain"
            />
          )}
          <Pressable
            style={[styles.previewClose, { top: spacing.xxl }]}
            onPress={() => setPreview(null)}
            accessibilityLabel="Close preview"
          >
            <CloseIcon size={20} color={theme.textPrimary} />
          </Pressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  /** Greyed out; still tappable so it can explain why it's unavailable. */
  disabled?: boolean;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.6 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      {icon}
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function SeriesSheet({
  visible,
  onClose,
  seriesId,
  allowManage,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  seriesId: string;
  allowManage: boolean;
  onChanged: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const { showToast } = useTasks();
  const [series, setSeries] = useState<TaskSeries | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .getSeries(seriesId)
      .then(s => {
        setSeries(s);
        setErr(null);
      })
      .catch(e => setErr(errorMessage(e)));
  }, [seriesId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  async function act(fn: () => Promise<void>, label: string) {
    setBusy(true);
    try {
      await fn();
      load();
      onChanged();
      showToast(label);
    } catch (e) {
      showToast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const LABEL = {
    ACTIVE: ['Active', 'success'],
    PAUSED: ['Paused', 'warning'],
    CANCELLED: ['Stopped', 'neutral'],
  } as const;

  return (
    <Sheet visible={visible} onClose={onClose} title="Recurring schedule">
      {!series && !err && <ActivityIndicator color={theme.primary} />}
      {err && <Text style={styles.sheetText}>{err}</Text>}
      {series && (
        <ScrollView style={{ maxHeight: 520 }}>
          <View style={styles.seriesHead}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{series.title}</Text>
              <Text style={styles.fileMeta}>
                {recurrenceSummary(series.recurrence)}
              </Text>
            </View>
            <StatusBadge
              label={LABEL[series.status][0]}
              tone={LABEL[series.status][1]}
            />
          </View>
          {series.status === 'PAUSED' && series.pause_from && (
            <Text style={styles.sheetText}>
              Paused from {fmtDateShort(series.pause_from)}
              {series.pause_until
                ? ` to ${fmtDateShort(series.pause_until)}`
                : ' until resumed'}
              .
            </Text>
          )}
          {!!series.next_occurrence_date && (
            <Text style={styles.sheetText}>
              Next occurrence: {fmtDateShort(series.next_occurrence_date)}
            </Text>
          )}
          <Text style={styles.cardTitle}>Recent occurrences</Text>
          {series.occurrences.slice(0, 6).map(o => (
            <View key={o.id} style={styles.occRow}>
              <Text style={styles.descText}>
                {fmtDateTime(o.due_date, o.due_time)}
              </Text>
              <StatusBadge
                label={
                  o.status === 'IN_PROGRESS'
                    ? 'In Progress'
                    : o.status.charAt(0) + o.status.slice(1).toLowerCase()
                }
                tone={
                  o.status === 'COMPLETED'
                    ? 'success'
                    : o.status === 'CANCELLED'
                    ? 'neutral'
                    : o.status === 'IN_PROGRESS'
                    ? 'accent'
                    : 'info'
                }
                dot={false}
              />
            </View>
          ))}
          {allowManage && series.status !== 'CANCELLED' && (
            <View style={[styles.sheetButtons, { marginTop: spacing.lg }]}>
              {series.status === 'ACTIVE' && (
                <PrimaryButton
                  label="Pause"
                  variant="secondary"
                  style={styles.flex}
                  loading={busy}
                  onPress={() =>
                    act(
                      () =>
                        api.pauseSeries(
                          series.id,
                          series.next_occurrence_date || todayStr(),
                        ),
                      'Schedule paused',
                    )
                  }
                />
              )}
              {series.status === 'PAUSED' && (
                <PrimaryButton
                  label="Resume"
                  style={styles.flex}
                  loading={busy}
                  onPress={() =>
                    act(() => api.resumeSeries(series.id), 'Schedule resumed')
                  }
                />
              )}
              <PrimaryButton
                label="Stop"
                variant="brand"
                style={styles.flex}
                loading={busy}
                onPress={() =>
                  act(() => api.stopSeries(series.id), 'Schedule stopped')
                }
              />
            </View>
          )}
        </ScrollView>
      )}
    </Sheet>
  );
}

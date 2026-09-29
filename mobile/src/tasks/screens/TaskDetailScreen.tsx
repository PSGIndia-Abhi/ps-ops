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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  CalendarIcon,
  CameraIcon,
  ClockIcon,
  CloseIcon,
  DocumentIcon,
  GalleryIcon,
  SendIcon,
  TagIcon,
} from '../../components/icons';
import { getToken } from '../../auth/tokenStorage';
import { API_BASE_URL } from '../../config/env';
import * as api from '../api';
import {
  dueInfo,
  fmtDateShort,
  fmtDateTime,
  fmtTime,
  fmtTimestamp,
  formatBytes,
  isFinished,
  recurrenceSummary,
  timeAgo,
  todayStr,
} from '../format';
import type { TaskStackParamList } from '../navigation';
import { errorMessage, useTasks } from '../TasksContext';
import { cardShadow, font, radius, STATUS_META, t, TONE_COLOR } from '../theme';
import type {
  TaskAttachment,
  TaskComment,
  TaskHistoryEntry,
  TaskSeries,
  TeamMember,
  WorkTask,
} from '../types';
import { Backdrop } from '../ui/Backdrop';
import {
  Avatar,
  CircleButton,
  EmptyBlock,
  PrimaryButton,
  PriorityTag,
  StatusPill,
} from '../ui/primitives';
import {
  ActionSheet,
  DateSheet,
  PeopleSheet,
  Sheet,
  TimeSheet,
  type SheetAction,
} from '../ui/sheets';
import {
  ArrowLeftIcon,
  BanIcon,
  DotsIcon,
  EditIcon,
  HistoryIcon,
  MessageIcon,
  PaperclipIcon,
  RepeatIcon,
  SkipIcon,
  SwapIcon,
  TrashIcon,
} from '../ui/taskIcons';

type Tab = 'comments' | 'files' | 'history';
type Dialog =
  | null
  | 'menu'
  | 'start'
  | 'complete'
  | 'cancel'
  | 'skip'
  | 'reassign'
  | 'reassignConfirm'
  | 'reschedule'
  | 'rsDate'
  | 'rsTime'
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

export function TaskDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { taskId } =
    useRoute<RouteProp<TaskStackParamList, 'TaskDetail'>>().params;
  const {
    viewer,
    assignable,
    patch,
    markCancelled,
    showToast,
    notifyLocal,
    refresh: refreshList,
  } = useTasks();

  const [task, setTask] = useState<WorkTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<Tab>('comments');

  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [files, setFiles] = useState<TaskAttachment[] | null>(null);
  const [history, setHistory] = useState<TaskHistoryEntry[] | null>(null);

  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [dialogText, setDialogText] = useState('');
  const [reassignTo, setReassignTo] = useState<TeamMember | null>(null);
  const [rsDate, setRsDate] = useState(todayStr());
  const [rsTime, setRsTime] = useState<string | null>(null);
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

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), loadComments(), loadFiles(), loadHistory()]);
    setRefreshing(false);
  }

  /** Runs one action; the server's answer (or refusal) is what the user sees. `success` null = the action shows its own notification. */
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
      setDialogText('');
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
      <View style={[styles.flex, styles.center]}>
        <Backdrop />
        {loadError ? (
          <View style={styles.pad}>
            <EmptyBlock
              title="Task not found"
              text={`${loadError}\nIt may have been removed, or you may not have access.`}
            />
            <PrimaryButton
              label="Go back"
              onPress={() => navigation.goBack()}
              style={styles.mtLg}
            />
          </View>
        ) : (
          <ActivityIndicator color={t.ink} size="large" />
        )}
      </View>
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
  const due = dueInfo(task);
  const status = STATUS_META[task.status];

  const menu: SheetAction[] = [
    ...(canEditTerms
      ? [
          {
            key: 'edit',
            label: 'Edit task',
            icon: <EditIcon size={18} color={t.ink} />,
            onPress: () => navigation.navigate('NewTask', { editId: task.id }),
          },
        ]
      : []),
    ...(canReassign
      ? [
          {
            key: 'reassign',
            label: 'Reassign',
            icon: <SwapIcon size={18} color={t.ink} />,
            onPress: () => setDialog('reassign'),
          },
        ]
      : []),
    ...(canEditTerms
      ? [
          {
            key: 'reschedule',
            label: 'Reschedule',
            icon: <CalendarIcon size={18} color={t.ink} />,
            onPress: () => {
              setRsDate(
                task.due_date && task.due_date >= todayStr()
                  ? task.due_date
                  : todayStr(),
              );
              setRsTime(task.due_time ? task.due_time.slice(0, 5) : null);
              setDialog('reschedule');
            },
          },
        ]
      : []),
    ...(task.series_id
      ? [
          {
            key: 'series',
            label: 'Recurring schedule',
            icon: <RepeatIcon size={18} color={t.ink} />,
            onPress: () => setDialog('series'),
          },
        ]
      : []),
    {
      key: 'dup',
      label: 'Duplicate',
      icon: <PaperclipIcon size={18} color={t.ink} />,
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
    ...(task.series_id && canEditTerms
      ? [
          {
            key: 'skip',
            label: 'Skip this occurrence',
            icon: <SkipIcon size={18} color={t.danger} />,
            danger: true,
            onPress: () => setDialog('skip'),
          },
        ]
      : []),
    ...(!finished
      ? [
          {
            key: 'cancel',
            label: 'Cancel task',
            icon: <BanIcon size={18} color={t.danger} />,
            danger: true,
            onPress: () => setDialog('cancel'),
          },
        ]
      : []),
  ];

  async function postComment() {
    const text = comment.trim();
    if (!text) return;
    setComment('');
    try {
      const c = await api.addComment(task!.id, text);
      setComments(list => [...(list || []), c]);
    } catch (err) {
      setComment(text);
      showToast(errorMessage(err), 'error');
    }
  }

  async function saveUpdate() {
    if (!note.trim())
      return showToast('Write what you did before saving.', 'validation');
    const ok = await run(
      () =>
        api.addProgress(task!.id, note.trim(), nextAction.trim() || undefined),
      'Update saved',
    );
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

  const isImage = (f: TaskAttachment) =>
    (f.file_type || '').startsWith('image/');
  const fileSource = (f: TaskAttachment) => ({
    uri: `${API_BASE_URL}${api.attachmentViewPath(task.id, f.id)}`,
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });

  return (
    <View style={styles.flex}>
      <Backdrop />
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <CircleButton
          label="Back"
          size={56}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeftIcon size={22} color={t.ink} />
        </CircleButton>
        <Text style={styles.headerTitle}>Task Details</Text>
        <CircleButton
          label="Task actions"
          size={56}
          onPress={() => setDialog('menu')}
        >
          <DotsIcon size={20} color={t.ink} />
        </CircleButton>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (canWork ? 120 : 40) },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <PriorityTag priority={task.priority} />
            <StatusPill status={task.status} small />
          </View>
          <Text style={styles.title}>{task.title}</Text>
          {!!task.description && (
            <Text style={styles.desc}>{task.description}</Text>
          )}
          <View style={styles.dueRow}>
            <View style={styles.dueBox}>
              <CalendarIcon size={18} color={t.ink} />
              <Text style={styles.dueText}>
                {task.due_date ? fmtDateShort(task.due_date) : 'No date'}
              </Text>
            </View>
            <View style={styles.dueBox}>
              <ClockIcon size={18} color={t.ink} />
              <Text style={styles.dueText}>
                {task.due_time ? fmtTime(task.due_time) : 'Any time'}
              </Text>
            </View>
          </View>
          <Text style={[styles.dueInfo, { color: TONE_COLOR[due.tone] }]}>
            {due.text}
          </Text>
          <View style={styles.track}>
            <View
              style={[
                styles.trackFill,
                {
                  width:
                    task.status === 'COMPLETED'
                      ? '100%'
                      : task.status === 'IN_PROGRESS'
                      ? '55%'
                      : task.status === 'OPEN'
                      ? '8%'
                      : '0%',
                  backgroundColor: status.color,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.card}>
          <InfoRow label="Assigned to">
            <View style={styles.person}>
              <Avatar
                name={task.assigned_to_name}
                id={task.assigned_to}
                size={30}
              />
              <Text style={styles.infoValue}>
                {task.assigned_to_name}
                {task.assigned_to === viewer.id ? ' (you)' : ''}
              </Text>
            </View>
          </InfoRow>
          <InfoRow label="Created by">
            <Text style={styles.infoValue}>
              {task.created_by_name}
              {task.created_by === viewer.id ? ' (you)' : ''}
            </Text>
          </InfoRow>
          {!!task.task_type && (
            <InfoRow label="Type">
              <View style={styles.person}>
                <TagIcon size={16} color={t.textSecondary} />
                <Text style={styles.infoValue}>{task.task_type}</Text>
              </View>
            </InfoRow>
          )}
          <InfoRow label="Schedule">
            {task.series_id ? (
              <Pressable
                onPress={() => setDialog('series')}
                style={styles.person}
              >
                <RepeatIcon size={16} color={t.ink} />
                <Text style={[styles.infoValue, styles.link]}>Recurring</Text>
              </Pressable>
            ) : (
              <Text style={styles.infoValue}>One time</Text>
            )}
          </InfoRow>
          {!!task.next_action && (
            <InfoRow label="Next action">
              <Text style={styles.infoValue}>
                {task.next_action}
                {task.next_action_date
                  ? ` · ${fmtDateShort(task.next_action_date)}`
                  : ''}
              </Text>
            </InfoRow>
          )}
          {!!task.started_at && (
            <InfoRow label="Started">
              <Text style={styles.infoValue}>
                {fmtTimestamp(task.started_at)}
              </Text>
            </InfoRow>
          )}
          {!!task.completed_at && (
            <InfoRow label="Completed">
              <Text style={styles.infoValue}>
                {fmtTimestamp(task.completed_at)}
              </Text>
            </InfoRow>
          )}
          {!!task.completion_note && (
            <InfoRow label="Completion note" last>
              <Text style={styles.infoValue}>{task.completion_note}</Text>
            </InfoRow>
          )}
        </View>

        {canWork && task.status === 'IN_PROGRESS' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Work update</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="What did you do? (required)"
              placeholderTextColor={t.textMuted}
              style={[styles.input, styles.inputMulti]}
              multiline
            />
            <TextInput
              value={nextAction}
              onChangeText={setNextAction}
              placeholder="Next action (optional)"
              placeholderTextColor={t.textMuted}
              style={styles.input}
              maxLength={255}
            />
            <PrimaryButton
              label="Save update"
              tone="lime"
              onPress={saveUpdate}
              busy={busy}
            />
          </View>
        )}

        <View style={styles.tabs}>
          {(
            [
              ['comments', 'Comments', MessageIcon, comments?.length],
              ['files', 'Files', PaperclipIcon, files?.length],
              ['history', 'History', HistoryIcon, undefined],
            ] as const
          ).map(([key, label, Icon, n]) => {
            const on = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Icon size={16} color={on ? t.onInk : t.ink} />
                <Text style={[styles.tabText, on && { color: t.onInk }]}>
                  {label}
                  {n ? ` ${n}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'comments' && (
          <View style={styles.card}>
            {comments === null && <ActivityIndicator color={t.ink} />}
            {comments?.length === 0 && (
              <Text style={styles.muted}>
                No comments yet. Start the conversation.
              </Text>
            )}
            {comments?.map(c => {
              const mine = c.user_id === viewer.id;
              return (
                <View
                  key={c.id}
                  style={[styles.comment, mine && styles.commentMine]}
                >
                  {!mine && (
                    <Avatar name={c.user_name} id={c.user_id} size={30} />
                  )}
                  <View style={[styles.bubble, mine && styles.bubbleMine]}>
                    {!mine && (
                      <Text style={styles.bubbleName}>{c.user_name}</Text>
                    )}
                    <Text
                      style={[styles.bubbleText, mine && { color: t.onInk }]}
                    >
                      {c.comment}
                    </Text>
                    <Text
                      style={[styles.bubbleTime, mine && { color: '#B8B8BE' }]}
                    >
                      {timeAgo(c.created_at)}
                    </Text>
                  </View>
                </View>
              );
            })}
            <View style={styles.composer}>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Write a comment"
                placeholderTextColor={t.textMuted}
                style={styles.composerInput}
                multiline
                maxLength={5000}
              />
              <CircleButton
                dark
                label="Send comment"
                size={46}
                onPress={postComment}
              >
                <SendIcon size={18} color={t.onInk} />
              </CircleButton>
            </View>
          </View>
        )}

        {tab === 'files' && (
          <View style={styles.card}>
            {files === null && <ActivityIndicator color={t.ink} />}
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
                      <DocumentIcon size={22} color={t.ink} />
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
                  style={styles.fileDelete}
                >
                  <TrashIcon size={18} color={t.textMuted} />
                </Pressable>
              </View>
            ))}
            <PrimaryButton
              label="Attach a file"
              tone="outline"
              onPress={() => setDialog('upload')}
              busy={busy}
              style={styles.mt}
            />
          </View>
        )}

        {tab === 'history' && (
          <View style={styles.card}>
            {history === null && <ActivityIndicator color={t.ink} />}
            {history?.map((h, i) => (
              <View key={h.id} style={styles.hRow}>
                <View style={styles.hRail}>
                  <View
                    style={[
                      styles.hDot,
                      h.to_status && {
                        backgroundColor: STATUS_META[h.to_status].color,
                      },
                    ]}
                  />
                  {i < history.length - 1 && <View style={styles.hLine} />}
                </View>
                <View style={[styles.flex, styles.hBody]}>
                  <Text style={styles.hTitle}>
                    {HISTORY_LABEL[h.action] || h.action}
                    {h.changed_by_name ? ` by ${h.changed_by_name}` : ''}
                  </Text>
                  {!!h.note && <Text style={styles.hNote}>{h.note}</Text>}
                  <Text style={styles.hTime}>{fmtTimestamp(h.changed_at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {canWork && (task.status === 'OPEN' || task.status === 'IN_PROGRESS') && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 14 }]}>
          {task.status === 'OPEN' ? (
            <PrimaryButton
              label="Start Task"
              onPress={() => setDialog('start')}
              busy={busy}
            />
          ) : (
            <PrimaryButton
              label="Complete Task"
              tone="lime"
              onPress={() => setDialog('complete')}
              busy={busy}
            />
          )}
        </View>
      )}

      {/* ---- sheets ---- */}
      <ActionSheet
        visible={dialog === 'menu'}
        onClose={() => setDialog(null)}
        title="Task actions"
        actions={menu}
      />

      <Sheet
        visible={dialog === 'start'}
        onClose={() => setDialog(null)}
        title="Start this task?"
      >
        <Text style={styles.sheetText}>
          It moves to In Progress and the start time is recorded.
        </Text>
        <PrimaryButton
          label="Start now"
          busy={busy}
          onPress={() => run(() => api.startTask(task.id), 'Task started')}
        />
      </Sheet>

      <Sheet
        visible={dialog === 'complete'}
        onClose={() => setDialog(null)}
        title="Complete this task?"
      >
        <TextInput
          value={dialogText}
          onChangeText={setDialogText}
          placeholder="Completion note (optional)"
          placeholderTextColor={t.textMuted}
          style={[styles.input, styles.inputMulti]}
          multiline
        />
        <PrimaryButton
          label="Mark as completed"
          tone="lime"
          busy={busy}
          onPress={() =>
            run(async () => {
              const done = await api.completeTask(
                task.id,
                dialogText.trim() || undefined,
              );
              notifyLocal(done, 'completed');
              return done;
            }, null)
          }
        />
      </Sheet>

      <Sheet
        visible={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title="Cancel this task?"
      >
        <Text style={styles.sheetText}>
          The task stays in history as Cancelled. This can’t be undone.
        </Text>
        <View style={styles.sheetButtons}>
          <PrimaryButton
            label="Keep it"
            tone="outline"
            style={styles.flex}
            onPress={() => setDialog(null)}
          />
          <PrimaryButton
            label="Cancel task"
            tone="danger"
            style={styles.flex}
            busy={busy}
            onPress={() =>
              run(async () => {
                await api.cancelTask(task.id);
                markCancelled(task.id);
                setTask({ ...task, status: 'CANCELLED' });
              }, 'Task cancelled')
            }
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
          value={dialogText}
          onChangeText={setDialogText}
          placeholder="Reason (optional)"
          placeholderTextColor={t.textMuted}
          style={styles.input}
        />
        <PrimaryButton
          label="Skip occurrence"
          tone="danger"
          busy={busy}
          onPress={() =>
            run(
              () => api.skipTask(task.id, dialogText.trim() || undefined),
              'Occurrence skipped',
            )
          }
        />
      </Sheet>

      <PeopleSheet
        visible={dialog === 'reassign'}
        onClose={() => setDialog(d => (d === 'reassign' ? null : d))}
        people={assignable.filter(p => p.id !== task.assigned_to)}
        selectedId={null}
        meId={viewer.id}
        title="Reassign to"
        onPick={p => {
          setReassignTo(p);
          setTimeout(() => setDialog('reassignConfirm'), 250);
        }}
      />

      <Sheet
        visible={dialog === 'reassignConfirm'}
        onClose={() => setDialog(null)}
        title={`Reassign to ${reassignTo?.name ?? ''}?`}
      >
        <TextInput
          value={dialogText}
          onChangeText={setDialogText}
          placeholder="Note for them (optional)"
          placeholderTextColor={t.textMuted}
          style={styles.input}
        />
        <PrimaryButton
          label="Reassign"
          busy={busy}
          onPress={() =>
            reassignTo &&
            run(
              () =>
                api.reassignTask(
                  task.id,
                  reassignTo.id,
                  dialogText.trim() || undefined,
                ),
              `Reassigned to ${reassignTo.name}`,
            )
          }
        />
      </Sheet>

      <Sheet
        visible={dialog === 'reschedule'}
        onClose={() => setDialog(null)}
        title="Reschedule"
      >
        <View style={styles.sheetButtons}>
          <Pressable style={styles.pickBtn} onPress={() => setDialog('rsDate')}>
            <CalendarIcon size={18} color={t.ink} />
            <Text style={styles.pickText}>{fmtDateShort(rsDate)}</Text>
          </Pressable>
          <Pressable style={styles.pickBtn} onPress={() => setDialog('rsTime')}>
            <ClockIcon size={18} color={t.ink} />
            <Text style={styles.pickText}>
              {rsTime ? fmtTime(rsTime) : 'Any time'}
            </Text>
          </Pressable>
        </View>
        <TextInput
          value={dialogText}
          onChangeText={setDialogText}
          placeholder="Reason (optional)"
          placeholderTextColor={t.textMuted}
          style={styles.input}
        />
        <PrimaryButton
          label="Save new date"
          busy={busy}
          onPress={() =>
            run(
              () =>
                api.rescheduleTask(
                  task.id,
                  rsDate,
                  rsTime ? `${rsTime}:00` : null,
                  dialogText.trim() || undefined,
                ),
              `Moved to ${fmtDateTime(rsDate, rsTime)}`,
            )
          }
        />
      </Sheet>
      <DateSheet
        visible={dialog === 'rsDate'}
        onClose={() => setDialog('reschedule')}
        value={rsDate}
        onPick={setRsDate}
        minDate={todayStr()}
      />
      <TimeSheet
        visible={dialog === 'rsTime'}
        onClose={() => setDialog('reschedule')}
        value={rsTime}
        onPick={setRsTime}
      />

      <ActionSheet
        visible={dialog === 'upload'}
        onClose={() => setDialog(null)}
        title="Attach a file"
        actions={[
          {
            key: 'cam',
            label: 'Take a photo',
            icon: <CameraIcon size={18} color={t.ink} />,
            onPress: pickCamera,
          },
          {
            key: 'gal',
            label: 'Choose from gallery',
            icon: <GalleryIcon size={18} color={t.ink} />,
            onPress: pickGallery,
          },
          {
            key: 'doc',
            label: 'Pick a document',
            icon: <DocumentIcon size={18} color={t.ink} />,
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
        <View style={styles.previewWrap}>
          {preview && (
            <Image
              source={fileSource(preview)}
              style={styles.previewImg}
              resizeMode="contain"
            />
          )}
          <CircleButton
            label="Close preview"
            size={52}
            onPress={() => setPreview(null)}
            style={[styles.previewClose, { top: insets.top + 16 }]}
          >
            <CloseIcon size={22} color={t.ink} />
          </CircleButton>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoRight}>{children}</View>
    </View>
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

  const SERIES_LABEL = {
    ACTIVE: ['Active', '#3D8B55'],
    PAUSED: ['Paused', '#C7862B'],
    CANCELLED: ['Stopped', '#6B7280'],
  } as const;

  return (
    <Sheet visible={visible} onClose={onClose} title="Recurring schedule">
      {!series && !err && <ActivityIndicator color={t.ink} />}
      {err && <Text style={styles.sheetText}>{err}</Text>}
      {series && (
        <ScrollView style={styles.seriesScroll}>
          <View style={styles.seriesHead}>
            <View style={styles.flex}>
              <Text style={styles.seriesTitle}>{series.title}</Text>
              <Text style={styles.seriesRule}>
                {recurrenceSummary(series.recurrence)}
              </Text>
            </View>
            <View
              style={[
                styles.seriesBadge,
                { backgroundColor: SERIES_LABEL[series.status][1] },
              ]}
            >
              <Text style={styles.seriesBadgeText}>
                {SERIES_LABEL[series.status][0]}
              </Text>
            </View>
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
              <Text style={styles.occDate}>
                {fmtDateTime(o.due_date, o.due_time)}
              </Text>
              <StatusPill status={o.status} small />
            </View>
          ))}
          {allowManage && series.status !== 'CANCELLED' && (
            <View style={[styles.sheetButtons, styles.mtLg]}>
              {series.status === 'ACTIVE' && (
                <PrimaryButton
                  label="Pause"
                  tone="outline"
                  style={styles.flex}
                  busy={busy}
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
                  tone="lime"
                  style={styles.flex}
                  busy={busy}
                  onPress={() =>
                    act(() => api.resumeSeries(series.id), 'Schedule resumed')
                  }
                />
              )}
              <PrimaryButton
                label="Stop"
                tone="danger"
                style={styles.flex}
                busy={busy}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 20, alignSelf: 'stretch' },
  mt: { marginTop: 12 },
  mtLg: { marginTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    color: t.text,
    fontFamily: font.regular,
  },
  content: { paddingHorizontal: 20, paddingTop: 6 },
  hero: {
    backgroundColor: t.surface,
    borderRadius: radius.lg,
    padding: 20,
    ...cardShadow,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    color: t.text,
    fontFamily: font.medium,
    marginTop: 14,
  },
  desc: { fontSize: 14, lineHeight: 21, color: t.textSecondary, marginTop: 10 },
  dueRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dueBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F4F3F6',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    minHeight: 46,
  },
  dueText: { fontSize: 14, color: t.text },
  dueInfo: { fontSize: 13, fontFamily: font.medium, marginTop: 12 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EFEEF2',
    marginTop: 12,
    overflow: 'hidden',
  },
  trackFill: { height: 6, borderRadius: 3 },
  card: {
    backgroundColor: t.surface,
    borderRadius: radius.lg,
    padding: 18,
    marginTop: 14,
    ...cardShadow,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: font.medium,
    color: t.text,
    marginBottom: 12,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F0F3',
    gap: 12,
  },
  infoLabel: { fontSize: 13, color: t.textMuted },
  infoRight: { flexShrink: 1, alignItems: 'flex-end' },
  infoValue: {
    fontSize: 14,
    color: t.text,
    fontFamily: font.medium,
    textAlign: 'right',
  },
  link: { textDecorationLine: 'underline' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    backgroundColor: '#F4F3F6',
    borderRadius: radius.md,
    paddingHorizontal: 16,
    minHeight: 50,
    fontSize: 15,
    color: t.text,
    marginBottom: 12,
  },
  inputMulti: { minHeight: 90, paddingTop: 14, textAlignVertical: 'top' },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 20 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: t.surfaceGlass,
  },
  tabOn: { backgroundColor: t.ink },
  tabText: { fontSize: 13, color: t.text, fontFamily: font.medium },
  muted: {
    color: t.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  commentMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    backgroundColor: '#F4F3F6',
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    padding: 12,
  },
  bubbleMine: {
    backgroundColor: t.ink,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  bubbleName: {
    fontSize: 12,
    fontFamily: font.medium,
    color: t.textSecondary,
    marginBottom: 3,
  },
  bubbleText: { fontSize: 14, color: t.text, lineHeight: 20 },
  bubbleTime: { fontSize: 11, color: t.textMuted, marginTop: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#F4F3F6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 46,
    maxHeight: 120,
    fontSize: 15,
    color: t.text,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  fileMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F4F3F6',
  },
  fileIcon: { alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 14, fontFamily: font.medium, color: t.text },
  fileMeta: { fontSize: 12, color: t.textMuted, marginTop: 3 },
  fileDelete: { padding: 8 },
  hRow: { flexDirection: 'row', gap: 12 },
  hRail: { width: 14, alignItems: 'center' },
  hDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#C4C4CA',
    marginTop: 4,
  },
  hLine: { width: 2, flex: 1, backgroundColor: '#EDECF0', marginTop: 4 },
  hBody: { paddingBottom: 18 },
  hTitle: { fontSize: 14, fontFamily: font.medium, color: t.text },
  hNote: { fontSize: 13, color: t.textSecondary, marginTop: 4, lineHeight: 19 },
  hTime: { fontSize: 12, color: t.textMuted, marginTop: 4 },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetText: {
    fontSize: 14,
    color: t.textSecondary,
    lineHeight: 21,
    marginBottom: 16,
  },
  sheetButtons: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F4F3F6',
    borderRadius: radius.pill,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  pickText: { fontSize: 15, color: t.text },
  seriesScroll: { maxHeight: 520 },
  seriesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  seriesTitle: { fontSize: 16, fontFamily: font.medium, color: t.text },
  seriesRule: { fontSize: 13, color: t.textSecondary, marginTop: 3 },
  seriesBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  seriesBadgeText: { color: t.onInk, fontSize: 12, fontFamily: font.medium },
  occRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  occDate: { fontSize: 14, color: t.text },
  previewWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  previewImg: { width: '100%', height: '80%' },
  previewClose: { position: 'absolute', right: 20 },
});

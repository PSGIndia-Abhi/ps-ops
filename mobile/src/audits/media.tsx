import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { createSound, type PlayBackType, type RecordBackType } from 'react-native-nitro-sound';
import { getToken } from '../auth/tokenStorage';
import { API_BASE_URL } from '../config/env';
import { CameraIcon, DownloadIcon, EyeIcon, GalleryIcon, MicIcon, PencilIcon, PlayIcon, SparkleIcon, StopIcon, TrashIcon } from '../components/icons';
import { colors, radii, spacing, typography } from '../theme';
import { auditsApi, newId, type UploadedPhoto, type VoiceField, type VoiceNote } from './api';
import { MarkPhotoModal } from './markPhoto';
import { ConfirmDialog } from './ui';
import { ag } from './theme';
import { useAppActive } from './useAppActive';

/**
 * Evidence photos and voice input for one finding. Uploads go straight to the
 * backend with an id made on the phone (retries never duplicate). The finding
 * must exist on the server first, so `ensureSaved` saves a draft when needed.
 */

// 1600 px is plenty for the report (it uses 1400 px); smaller files upload faster and use less battery and data.
const PICKER_OPTIONS = { mediaType: 'photo' as const, quality: 0.7 as const, maxWidth: 1600, maxHeight: 1600 };

export function useAuthHeader() {
  const [header, setHeader] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getToken().then(t => alive && t && setHeader(`Bearer ${t}`));
    return () => {
      alive = false;
    };
  }, []);
  return header;
}

/** Thumbnail of an uploaded audit photo (the file is behind the login token). */
export function AuditThumb({ url, size, style }: { url: string; size: number; style?: object }) {
  const auth = useAuthHeader();
  const box = { width: size, height: size, borderRadius: radii.sm };
  if (!auth) return <View style={[box, styles.thumbBg, style]} />;
  return (
    <Image
      source={{ uri: `${API_BASE_URL}${url}?size=thumb`, headers: { Authorization: auth } }}
      style={[box, styles.thumbBg, style]}
    />
  );
}

export async function askPermission(kind: 'camera' | 'mic'): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(
    kind === 'camera' ? PermissionsAndroid.PERMISSIONS.CAMERA : PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: kind === 'camera' ? 'Camera permission' : 'Microphone permission',
      message: kind === 'camera'
        ? 'BestServe needs the camera to take audit evidence photos.'
        : 'BestServe needs the microphone to record your audit notes.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// ---- photos -----------------------------------------------------------------

export interface PhotoItem {
  id: string;
  url: string;
  /** Local file while uploading / if the upload failed. */
  localUri?: string;
  state: 'uploaded' | 'uploading' | 'failed';
  /** Drawn on with "✎ Mark"; `v` changes with each save so the picture reloads. */
  marked?: boolean;
  v?: string | null;
}

export function PhotoGrid({
  auditId, findingId, photos, onChange, ensureSaved,
}: {
  auditId: string;
  findingId: string;
  photos: PhotoItem[];
  onChange: (update: (list: PhotoItem[]) => PhotoItem[]) => void;
  ensureSaved: () => Promise<boolean>;
}) {
  const auth = useAuthHeader();
  const [error, setError] = useState<string | null>(null);

  async function add(source: 'camera' | 'gallery') {
    setError(null);
    if (source === 'camera' && !(await askPermission('camera'))) {
      setError('Camera permission was denied. Enable it in Settings.');
      return;
    }
    const res = source === 'camera'
      ? await launchCamera(PICKER_OPTIONS)
      : await launchImageLibrary({ ...PICKER_OPTIONS, selectionLimit: 6 });
    if (res.didCancel) return;
    if (res.errorMessage) {
      setError('Could not open the camera or gallery.');
      return;
    }
    const assets = (res.assets || []).filter((a: Asset) => !!a.uri);
    if (!assets.length || !(await ensureSaved())) return;
    const items: PhotoItem[] = assets.map(a => {
      const id = newId();
      return { id, url: `/api/audits/${auditId}/files/${id}`, localUri: a.uri as string, state: 'uploading' };
    });
    onChange(list => [...list, ...items]);
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      try {
        await auditsApi.uploadFile(
          auditId,
          { uri: a.uri as string, name: a.fileName || `photo-${items[i].id}.jpg`, type: a.type || 'image/jpeg' },
          { kind: 'PHOTO', fileId: items[i].id, findingId, capturedAt: new Date().toISOString() },
        );
        onChange(list => list.map(p => (p.id === items[i].id ? { ...p, state: 'uploaded' } : p)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Photo upload failed');
        onChange(list => list.map(p => (p.id === items[i].id ? { ...p, state: 'failed' } : p)));
      }
    }
  }

  // Tap a failed photo to upload it again (same id, so no duplicate if the first try did land).
  async function retry(item: PhotoItem) {
    if (item.state !== 'failed' || !item.localUri) return;
    setError(null);
    onChange(list => list.map(p => (p.id === item.id ? { ...p, state: 'uploading' } : p)));
    try {
      await auditsApi.uploadFile(
        auditId,
        { uri: item.localUri, name: `photo-${item.id}.jpg`, type: 'image/jpeg' },
        { kind: 'PHOTO', fileId: item.id, findingId, capturedAt: new Date().toISOString() },
      );
      onChange(list => list.map(p => (p.id === item.id ? { ...p, state: 'uploaded' } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo upload failed');
      onChange(list => list.map(p => (p.id === item.id ? { ...p, state: 'failed' } : p)));
    }
  }

  const [toRemove, setToRemove] = useState<PhotoItem | null>(null);

  async function confirmRemove() {
    const item = toRemove;
    setToRemove(null);
    if (!item) return;
    if (item.state === 'uploaded') {
      try {
        await auditsApi.deletePhoto(auditId, item.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove the photo');
        return;
      }
    }
    onChange(list => list.filter(p => p.id !== item.id));
  }

  const remove = (item: PhotoItem) => setToRemove(item);

  // "✎ Mark": draw circles, arrows and labels on an uploaded photo.
  const [toMark, setToMark] = useState<PhotoItem | null>(null);
  function marked(saved: UploadedPhoto) {
    onChange(list => list.map(p => (p.id === saved.id ? { ...p, marked: !!saved.marked, v: saved.v || null, localUri: undefined } : p)));
    setToMark(null);
  }

  // Tap a photo: one small menu (View / Mark / Download / Delete) instead of buttons on every tile.
  const [menuFor, setMenuFor] = useState<PhotoItem | null>(null);
  const [viewing, setViewing] = useState<PhotoItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const fullUri = (p: PhotoItem) => `${API_BASE_URL}${p.url}?v=${p.v || 0}`;

  function tapPhoto(p: PhotoItem) {
    if (p.state === 'failed') return retry(p);
    if (p.state === 'uploaded') setMenuFor(p);
  }

  // Saves the photo (with its marks) to the phone's Pictures/BestServe.
  async function download(p: PhotoItem) {
    setMenuFor(null);
    setSaving(true);
    setError(null);
    try {
      const target = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/audit-photo-${p.id}.jpg`;
      const res = await ReactNativeBlobUtil.config({ path: target, overwrite: true }).fetch('GET', fullUri(p), { Authorization: auth || '' });
      if (res.info().status >= 300) throw new Error('Could not download the photo');
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        { name: `BestServe-photo-${p.id.slice(0, 8)}.jpg`, parentFolder: 'BestServe', mimeType: 'image/jpeg' } as unknown as Parameters<typeof ReactNativeBlobUtil.MediaCollection.copyToMediaStore>[0],
        'Image',
        target,
      );
      setSavedMsg('Photo saved to Pictures/BestServe');
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the photo');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.takeBig, pressed && styles.takeBigPressed]}
        onPress={() => add('camera')}
        accessibilityRole="button"
      >
        <CameraIcon size={34} color={colors.textOnPrimary} />
        <Text style={styles.takeBigText}>Take Photo</Text>
      </Pressable>
      <Pressable style={styles.galleryBtn} onPress={() => add('gallery')} accessibilityRole="button">
        <GalleryIcon size={20} color={ag.green} />
        <Text style={styles.galleryText}>Choose from gallery</Text>
      </Pressable>
      <Text style={styles.hint}>
        {photos.length
          ? `${photos.length} photo${photos.length === 1 ? '' : 's'} · tap a photo to view, mark, download or delete`
          : 'Take one or more photos of the area or risk.'}
      </Text>
      <View style={styles.grid}>
        {photos.map((p, i) => (
          <Pressable key={p.id} onPress={() => tapPhoto(p)} onLongPress={() => p.state === 'uploaded' && setMenuFor(p)} style={styles.tile}>
            {p.localUri || auth ? (
              <Image
                source={p.localUri ? { uri: p.localUri } : { uri: `${API_BASE_URL}${p.url}?size=thumb${p.v ? `&v=${p.v}` : ''}`, headers: { Authorization: auth as string } }}
                style={styles.tileImg}
              />
            ) : (
              <View style={styles.tileImg} />
            )}
            {p.state === 'uploading' ? <View style={styles.overlay}><ActivityIndicator color={colors.textOnPrimary} /></View> : null}
            {p.state === 'failed' ? <View style={[styles.overlay, styles.overlayFail]}><Text style={styles.failText}>Failed - tap to retry</Text></View> : null}
            {p.state === 'uploaded' && p.marked ? <View style={styles.markedTag}><Text style={styles.markedText}>Marked</Text></View> : null}
          </Pressable>
        ))}
      </View>
      {saving ? <Text style={styles.hint}>Saving photo…</Text> : null}
      {savedMsg ? <Text style={styles.saved}>✓ {savedMsg}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Photo menu */}
      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.sheetBg} onPress={() => setMenuFor(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Photo</Text>
            {[
              { Icon: EyeIcon, label: 'View', run: () => { setViewing(menuFor); setMenuFor(null); } },
              { Icon: PencilIcon, label: menuFor?.marked ? 'Edit marks' : 'Mark', run: () => { setToMark(menuFor); setMenuFor(null); } },
              { Icon: DownloadIcon, label: 'Download', run: () => menuFor && download(menuFor) },
              { Icon: TrashIcon, label: 'Delete', danger: true, run: () => { if (menuFor) remove(menuFor); setMenuFor(null); } },
            ].map(o => (
              <Pressable key={o.label} onPress={o.run} style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetPressed]}>
                <View style={styles.sheetIcon}><o.Icon size={22} color={o.danger ? ag.red : ag.greenDark} /></View>
                <Text style={[styles.sheetText, o.danger && styles.sheetDanger]}>{o.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setMenuFor(null)} style={styles.sheetCancel}><Text style={styles.sheetCancelText}>Cancel</Text></Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Full-screen view */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewBg} onPress={() => setViewing(null)}>
          {viewing && auth ? (
            <Image source={{ uri: fullUri(viewing), headers: { Authorization: auth } }} style={styles.viewImg} resizeMode="contain" />
          ) : null}
          <Text style={styles.viewHint}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>
      <ConfirmDialog
        visible={!!toRemove}
        icon={<GalleryIcon size={28} color={ag.red} />}
        title="Remove this photo?"
        message="It will not appear in the report. The original stays saved as evidence."
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
      <MarkPhotoModal
        visible={!!toMark}
        auditId={auditId}
        photo={toMark}
        auth={auth}
        onClose={() => setToMark(null)}
        onSaved={marked}
      />
    </View>
  );
}

// ---- voice ------------------------------------------------------------------

export const VOICE_LANGUAGES = [
  { value: 'kn', label: 'ಕನ್ನಡ Kannada' },
  { value: 'hi', label: 'हिंदी Hindi' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: 'Auto' },
];
const PENDING = ['UPLOADED', 'QUEUED', 'PROCESSING'];
const BARS = 28;
const MAX_WAIT_SECONDS = 30;

const fmtSecs = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * One text field (observation / customer action / BestServe action) with
 * "Voice Input" and "Type Text" tabs. The English from Gemini fills `text`,
 * which the supervisor can edit; it is accepted when the area is saved.
 */
export function VoiceField({
  auditId, findingId, field, label, placeholder, language, onLanguage, text, onText, note, onNote, ensureSaved, compact, onAccepted, combined,
}: {
  auditId: string;
  findingId: string;
  field: VoiceField;
  label: string;
  placeholder: string;
  language: string;
  onLanguage: (l: string) => void;
  text: string;
  onText: (t: string) => void;
  note: VoiceNote | null;
  onNote: (n: VoiceNote | null) => void;
  ensureSaved: () => Promise<boolean>;
  compact?: boolean;
  /** Called with the finding's new row version after "Accept translation". */
  onAccepted?: (findingRowVersion: number) => void;
  /** One recording for observation + customer action + BestServe action (the server splits it). */
  combined?: boolean;
}) {
  const recorder = useRef<ReturnType<typeof createSound> | null>(null);
  if (!recorder.current) recorder.current = createSound();
  const [tab, setTab] = useState<'voice' | 'text'>('voice');
  // Text filled from outside (a "Quick add" chip) with no recording: open the typing box to show it.
  useEffect(() => {
    if (!note && text.trim()) setTab('text');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0.15));
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  // After 30 s of waiting the field switches to "type it yourself" (one timer, not a ticking counter).
  const [tooSlowTimer, setTooSlowTimer] = useState(false);
  useEffect(() => {
    setTooSlowTimer(false);
    if (!note || !PENDING.includes(note.status)) return undefined;
    const t = setTimeout(() => setTooSlowTimer(true), MAX_WAIT_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [note]);

  // Poll while the server translates; put the English into the field when it arrives.
  // Battery: every 3 s for the first 20 s, then every 6 s, and never while the app is in the background.
  const appActive = useAppActive();
  useEffect(() => {
    if (!note || !PENDING.includes(note.status) || !appActive) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const tick = () => {
      auditsApi.getVoice(auditId, note.id).then(v => {
        if (stopped) return;
        if (v.status === 'REVIEW_REQUIRED' && v.englishDraft && !textRef.current.trim()) onText(v.englishDraft);
        if (v.status !== note.status || v.attempts !== note.attempts) onNote(v);
      }).catch(() => undefined).finally(() => {
        if (!stopped) timer = setTimeout(tick, Date.now() - started < 20000 ? 2000 : 6000);
      });
    };
    timer = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [auditId, note, onNote, onText, appActive]);

  useEffect(() => {
    const r = recorder.current;
    return () => {
      r?.stopRecorder().catch(() => undefined);
      r?.stopPlayer().catch(() => undefined);
      r?.removeRecordBackListener();
      r?.removePlaybackEndListener();
    };
  }, []);

  async function start() {
    setError(null);
    if (!(await askPermission('mic'))) {
      setError('Microphone permission was denied. Enable it in Settings.');
      return;
    }
    if (!(await ensureSaved())) return;
    const r = recorder.current!;
    try {
      await r.startRecorder(undefined, undefined, true);
      r.addRecordBackListener((e: RecordBackType) => {
        setSeconds(Math.floor(e.currentPosition / 1000));
        const db = typeof e.currentMetering === 'number' ? e.currentMetering : -60 + Math.random() * 50;
        const level = Math.max(0.08, Math.min(1, (db + 60) / 60));
        setBars(b => [...b.slice(1), level]);
      });
      setRecording(true);
    } catch {
      setError('Could not start recording.');
    }
  }

  async function stop() {
    const r = recorder.current!;
    const uri = await r.stopRecorder();
    r.removeRecordBackListener();
    setRecording(false);
    const secs = seconds;
    setSeconds(0);
    setBars(Array(BARS).fill(0.15));
    setBusy(true);
    try {
      const v = await auditsApi.uploadFile(
        auditId,
        { uri, name: `${field.toLowerCase()}-${Date.now()}.m4a`, type: 'audio/m4a' },
        { kind: 'VOICE', fileId: newId(), findingId, fieldType: field, sourceLanguage: language, durationSeconds: secs, combined: combined ? '1' : undefined },
      );
      onText('');
      onNote(v as VoiceNote);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please record again.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePlay() {
    if (!note) return;
    const r = recorder.current!;
    if (playing) {
      await r.stopPlayer().catch(() => undefined);
      r.removePlayBackListener();
      setPlaying(false);
      setPlayPos(0);
      return;
    }
    setError(null);
    setLoadingAudio(true);
    try {
      const token = await getToken();
      r.addPlayBackListener((e: PlayBackType) => {
        setPlayPos(Math.floor(e.currentPosition / 1000));
        setLoadingAudio(false);
      });
      r.addPlaybackEndListener(() => {
        setPlaying(false);
        setPlayPos(0);
        r.removePlayBackListener();
        r.stopPlayer().catch(() => undefined);
      });
      await r.startPlayer(`${API_BASE_URL}${note.audioUrl}`, token ? { Authorization: `Bearer ${token}` } : undefined);
      setPlaying(true);
    } catch {
      setError('Could not play the recording. Check your connection and try again.');
    } finally {
      setLoadingAudio(false);
    }
  }

  /** Record this field again. The new recording becomes the current one; the old audio is kept as evidence. */
  const [askRetake, setAskRetake] = useState(false);
  async function doRetake() {
    setAskRetake(false);
    if (playing) {
      await recorder.current?.stopPlayer().catch(() => undefined);
      setPlaying(false);
    }
    start();
  }
  function retake() {
    if (!text.trim()) doRetake();
    else setAskRetake(true);
  }

  async function retry() {
    if (!note) return;
    setBusy(true);
    try {
      onNote(await auditsApi.retryVoice(auditId, note.id, language));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setBusy(false);
    }
  }

  // "Accept translation": saves this English for the recording now (Save Area does the same for anything left).
  const [accepting, setAccepting] = useState(false);
  async function accept() {
    if (!note || !text.trim()) return;
    setAccepting(true);
    setError(null);
    try {
      // Still translating or failed = the supervisor's own text.
      const manual = PENDING.includes(note.status) || note.status === 'FAILED';
      const res = await auditsApi.acceptVoice(auditId, note.id, text.trim(), manual);
      onNote(res.voice);
      onAccepted?.(res.finding.rowVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept the translation');
    } finally {
      setAccepting(false);
    }
  }
  const accepted = note?.status === 'ACCEPTED' || note?.status === 'MANUAL';
  const isCurrentAccepted = accepted && note?.acceptedText === text.trim();
  const acceptOff = accepting || !text.trim() || isCurrentAccepted;

  const pending = !!note && PENDING.includes(note.status);
  // After 30 s the supervisor stops waiting and types instead (translation keeps trying in the background).
  const tooSlow = pending && tooSlowTimer;
  // Gemini heard no speech: retrying the same audio will not help, so only Retake is offered.
  // No speech, or the daily translation limit is used up: "Retry" would fail again.
  const noSpeech = note?.status === 'FAILED' && /no clear speech|limit is used up/i.test(note.error || '');
  const showRecorder = recording || !note || compact === false;

  return (
    <View style={styles.vf}>
      {label ? <Text style={styles.vfLabel}>{label}</Text> : null}

      {tab === 'voice' ? (
        <View>
          {/* No language choice: the AI recognises the spoken language (Kannada, Hindi, English, mixed...) by itself. */}
          {showRecorder ? (
            <View style={[styles.recCard, compact && styles.recCardCompact]}>
              {recording ? (
                <>
                  <View style={styles.recHead}>
                    <View style={styles.recDot} />
                    <Text style={styles.recTitle}>Listening…</Text>
                  </View>
                  <Text style={styles.timer}>{fmtSecs(seconds)}</Text>
                  <View style={styles.wave}>
                    {bars.map((h, i) => <View key={i} style={[styles.bar, { height: 6 + h * 46 }]} />)}
                  </View>
                  <Pressable onPress={stop} style={styles.stopBtn} accessibilityRole="button" accessibilityLabel="Stop recording">
                    <StopIcon size={22} color={colors.textOnPrimary} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={start} disabled={busy} style={styles.micBtn} accessibilityRole="button" accessibilityLabel="Start recording">
                    {busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <MicIcon size={28} color={colors.textOnPrimary} />}
                  </Pressable>
                  <Text style={styles.micHint}>{busy ? 'Saving recording…' : note ? 'Tap to record again' : combined ? 'Tap and say all three, in any language' : 'Tap and speak in any language'}</Text>
                </>
              )}
            </View>
          ) : null}
          {!recording && !note ? (
            <Pressable onPress={() => setTab('text')} hitSlop={8} style={styles.switchLink}>
              <Text style={styles.switchText}>or ⌨ type instead</Text>
            </Pressable>
          ) : null}

          {pending && !tooSlow ? (
            <View style={styles.gemini}>
              <SparkleIcon size={16} color={colors.primary} />
              <Text style={styles.geminiText}>Translating to English…</Text>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}

          {note && note.status === 'FAILED' ? (
            <View style={styles.failBox}>
              {noSpeech ? (
                <Text style={styles.failBoxText}>{note.error}</Text>
              ) : (
                <>
                  <Text style={styles.failBoxText}>{note.error || 'Translation failed.'} You can type the English below.</Text>
                  <Pressable onPress={retry} hitSlop={8}><Text style={styles.link}>Retry</Text></Pressable>
                </>
              )}
            </View>
          ) : null}

          {note && !recording ? (
            <View style={styles.noteCard}>
              {/* Recording row: name, length, status and a round play button */}
              <View style={styles.audioRow}>
                <Text style={styles.waveGlyph}>ıılıılı</Text>
                <View style={styles.flex1}>
                  <Text style={styles.audioName} numberOfLines={1}>{field.toLowerCase()}_recording.m4a</Text>
                  <Text style={styles.audioMeta}>
                    {playing
                      ? `Playing ${fmtSecs(playPos)}${note.durationSeconds ? ` / ${fmtSecs(note.durationSeconds)}` : ''}`
                      : `Original audio${note.durationSeconds ? ` · ${fmtSecs(note.durationSeconds)}` : ''}`}
                  </Text>
                </View>
                <View style={[styles.badge, accepted ? styles.badgeOk : pending ? styles.badgeWait : styles.badgeSaved]}>
                  <Text style={[styles.badgeText, accepted ? styles.badgeTextOk : pending ? styles.badgeTextWait : styles.badgeTextSaved]}>
                    {accepted ? '✓ Accepted' : pending ? 'Translating…' : 'Audio saved'}
                  </Text>
                </View>
                <Pressable
                  onPress={togglePlay}
                  disabled={loadingAudio}
                  style={[styles.roundPlay, playing && styles.roundPlayOn]}
                  accessibilityRole="button"
                  accessibilityLabel={playing ? 'Stop playing' : 'Play original recording'}
                >
                  {loadingAudio ? (
                    <ActivityIndicator size="small" color={colors.textOnPrimary} />
                  ) : playing ? (
                    <StopIcon size={14} color={colors.textOnPrimary} />
                  ) : (
                    <PlayIcon size={14} color={colors.textOnPrimary} />
                  )}
                </Pressable>
              </View>

              <Text style={styles.trLabel}>{combined ? 'Observation (English)' : 'English translation'} <Text style={styles.trHint}>— editable</Text></Text>
              <TextInput
                style={styles.trBox}
                multiline
                value={text}
                onChangeText={onText}
                placeholder={pending && !tooSlow ? 'Waiting for the translation…' : 'Type the English here…'}
                placeholderTextColor={colors.textMuted}
              />

              <View style={styles.noteActions}>
                {/* Record again (the audio itself plays from the round ▶ button above). */}
                <Pressable
                  onPress={retake}
                  disabled={busy}
                  style={({ pressed }) => [styles.outlineBtn, styles.recordAgainBtn, pressed && styles.btnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Record again"
                >
                  <MicIcon size={16} color={ag.green} />
                  <Text style={styles.outlineBtnText}>Record again</Text>
                </Pressable>
                <Pressable
                  onPress={accept}
                  disabled={acceptOff}
                  style={({ pressed }) => [styles.solidBtn, acceptOff && styles.solidBtnOff, pressed && styles.btnPressed]}
                  accessibilityRole="button"
                >
                  {accepting ? (
                    <ActivityIndicator size="small" color={colors.textOnPrimary} />
                  ) : (
                    <Text style={styles.solidBtnText}>{isCurrentAccepted ? '✓ Accepted' : 'Accept translation'}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <TextInput
            style={styles.trBox}
            multiline
            value={text}
            onChangeText={onText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable onPress={() => setTab('voice')} hitSlop={8} style={styles.switchLink}>
            <Text style={styles.switchText}>or 🎤 speak instead</Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ConfirmDialog
        visible={askRetake}
        icon={<MicIcon size={28} color={ag.red} />}
        title="Record again?"
        message="The new recording will replace the text below. Your old recording is kept as evidence."
        confirmLabel="Retake"
        onConfirm={doRetake}
        onCancel={() => setAskRetake(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thumbBg: { backgroundColor: colors.surfaceAlt },
  takeBig: { minHeight: 120, borderRadius: radii.lg, backgroundColor: ag.green, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  takeBigPressed: { opacity: 0.85 },
  takeBigText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 17 },
  galleryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 48, marginTop: spacing.sm,
    borderRadius: radii.md, borderWidth: 1.5, borderColor: ag.green, backgroundColor: colors.surface,
  },
  galleryText: { color: ag.greenDark, fontWeight: '700' },
  markedTag: { position: 'absolute', right: 4, top: 4, backgroundColor: ag.red, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  markedText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  saved: { color: ag.greenDark, fontWeight: '600', marginTop: spacing.xs },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: spacing.xl },
  sheetTitle: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, borderRadius: radii.md, paddingHorizontal: spacing.sm },
  sheetPressed: { backgroundColor: ag.greenSofter },
  sheetIcon: { width: 28, alignItems: 'center' },
  sheetText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  sheetDanger: { color: ag.red },
  sheetCancel: { alignItems: 'center', paddingVertical: 12, marginTop: spacing.sm },
  sheetCancelText: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  viewBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  viewImg: { width: '100%', height: '85%' },
  viewHint: { color: '#CBD5E1', marginTop: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, marginVertical: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tile: { width: '31.5%', aspectRatio: 1, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tileImg: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  overlayFail: { backgroundColor: 'rgba(185,28,28,0.6)' },
  failText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 12 },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xxs },

  vf: { marginBottom: spacing.lg },
  flex1: { flex: 1 },
  noteCard: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  waveGlyph: { color: ag.green, fontSize: 16, fontWeight: '800', letterSpacing: -1 },
  audioName: { ...typography.bodyMedium, color: colors.textPrimary },
  audioMeta: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  badge: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeSaved: { backgroundColor: '#DCFCE7' },
  badgeTextSaved: { color: '#15803D' },
  badgeWait: { backgroundColor: colors.primarySoftBg },
  badgeTextWait: { color: colors.primary },
  badgeOk: { backgroundColor: ag.greenSoft },
  badgeTextOk: { color: ag.greenDark },
  badgeText: { fontSize: 11, fontWeight: '700' },
  roundPlay: { width: 36, height: 36, borderRadius: 18, backgroundColor: ag.green, alignItems: 'center', justifyContent: 'center' },
  roundPlayOn: { backgroundColor: ag.red },
  noteActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  outlineBtn: { flex: 1, minHeight: 46, borderRadius: radii.pill, borderWidth: 1.5, borderColor: ag.green, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { color: ag.greenDark, fontWeight: '700' },
  solidBtn: { flex: 1.3, minHeight: 46, borderRadius: radii.pill, backgroundColor: ag.green, alignItems: 'center', justifyContent: 'center' },
  solidBtnOff: { opacity: 0.5 },
  solidBtnText: { color: colors.textOnPrimary, fontWeight: '700' },
  btnPressed: { opacity: 0.85 },
  recordAgainBtn: { flexDirection: 'row', gap: 6 },
  vfLabel: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  langRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm, flexWrap: 'wrap' },
  lang: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  langOn: { backgroundColor: ag.greenSoft, borderColor: ag.green },
  langText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  langTextOn: { color: ag.greenDark },
  recCard: { backgroundColor: ag.greenSofter, borderRadius: radii.lg, paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: ag.greenSoft },
  recCardCompact: { paddingVertical: spacing.md },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginLeft: spacing.md },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: ag.red },
  recTitle: { ...typography.bodyMedium, color: colors.textPrimary },
  timer: { fontSize: 30, fontWeight: '700', color: colors.textPrimary, letterSpacing: 1 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 56 },
  bar: { width: 4, borderRadius: 2, backgroundColor: ag.green },
  stopBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: ag.red, alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: ag.green, alignItems: 'center', justifyContent: 'center' },
  micHint: { ...typography.captionMedium, color: ag.greenDark },
  switchLink: { alignSelf: 'center', marginTop: spacing.sm, paddingVertical: 4 },
  switchText: { color: ag.greenDark, fontWeight: '700', fontSize: 14 },
  gemini: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primarySoftBg, borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm },
  geminiText: { ...typography.captionMedium, color: colors.primary, flex: 1 },
  failBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.warningBg, borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm },
  failBoxText: { ...typography.caption, color: colors.warningText, flex: 1 },
  link: { color: ag.green, fontWeight: '700' },
  trLabel: { ...typography.bodyMedium, color: colors.textPrimary, marginTop: spacing.md, marginBottom: 6 },
  trHint: { ...typography.caption, color: colors.textMuted },
  trBox: {
    minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.sm,
    color: colors.textPrimary, fontSize: 15, textAlignVertical: 'top', backgroundColor: colors.surface,
  },
  playRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  playLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.dangerBg },
  playBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: ag.greenSofter, borderWidth: 1, borderColor: ag.greenSoft },
  playText: { fontSize: 13, color: ag.greenDark, fontWeight: '600' },
  playBtnOn: { backgroundColor: ag.green, borderColor: ag.green },
  playTextOn: { color: colors.textOnPrimary },
  accepted: { fontSize: 12, color: ag.greenDark, fontWeight: '700' },
});

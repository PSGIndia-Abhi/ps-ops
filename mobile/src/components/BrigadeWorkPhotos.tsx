import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import { Card } from './Card';
import { Button } from './Button';
import { AttachmentImage } from './AttachmentImage';
import { CameraIcon, CheckCircleIcon, CloseIcon, GalleryIcon, LockIcon } from './icons';
import { brigadeApi, jobsApi } from '../api';
import { getToken } from '../auth/tokenStorage';
import { API_BASE_URL } from '../config/env';
import type { BrigadeJobDetails, PhotoPhase, VisitPhotoStatus } from '../api/brigade';
import type { ComposerPhoto } from './CommentComposer';
import type { JobHistoryEntry } from '../types/job';
import type { JobVisit } from '../types/visit';
import { colors, radii, spacing, typography } from '../theme';

const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8 as const,
  maxWidth: 1600,
  maxHeight: 1600,
};

/** Photos picked in one go per phase; one is fine too - uploads add up. */
const MAX_PICKED = 10;
const TILE = 72;

const PHASE_ACTION: Record<PhotoPhase, string> = { before: 'BEFORE_PHOTOS', after: 'AFTER_PHOTOS' };

interface UploadedPhoto {
  id: string;
}

interface Props {
  jobId: string;
  visit: JobVisit;
  details: BrigadeJobDetails;
  status: VisitPhotoStatus | null;
  /** The job's history - the uploaded photos are read from it. */
  history: JobHistoryEntry[] | null;
  /** Reload the photo counts + job history after an upload. */
  onUploaded: () => Promise<void> | void;
  onMessage: (message: string, variant: 'success' | 'error' | 'validation') => void;
}

/** "1 photo" / "3 photos". */
export function photoCount(n: number): string {
  return `${n} photo${n === 1 ? '' : 's'}`;
}

function visitIdOf(entry: JobHistoryEntry): string | null {
  if (!entry.metadata) return null;
  try {
    const meta = typeof entry.metadata === 'string' ? JSON.parse(entry.metadata) : entry.metadata;
    return meta?.visit_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Brigade bookings only: at least `required` (3) photos before the work and
 * `required` after, before End Visit unlocks (the backend enforces the same
 * rule on submit). Photos can be added one or several at a time; each phase
 * shows what is already uploaded (tap to view full size). Uploads use the
 * same call as job updates, under a job update opened by
 * POST /api/brigade/visits/:id/photos/:phase.
 */
export function BrigadeWorkPhotos({ jobId, visit, details, status, history, onUploaded, onMessage }: Props) {
  const required = status?.required || details.min_visit_photos || 1;
  const before = status?.before ?? 0;
  const after = status?.after ?? 0;
  const beforeDone = before >= required;
  const afterDone = after >= required;
  const inProgress = visit.status === 'IN_PROGRESS';
  const ended = visit.status === 'AWAITING_APPROVAL' || visit.status === 'COMPLETED';
  const [viewing, setViewing] = useState<string | null>(null);

  // Uploaded photos of this visit, per phase, oldest first.
  const uploaded = useMemo(() => {
    const out: Record<PhotoPhase, UploadedPhoto[]> = { before: [], after: [] };
    for (const entry of [...(history ?? [])].reverse()) {
      const phase = entry.action === PHASE_ACTION.before ? 'before' : entry.action === PHASE_ACTION.after ? 'after' : null;
      if (!phase || visitIdOf(entry) !== visit.id) continue;
      for (const a of entry.attachments) if (a.type === 'IMAGE') out[phase].push({ id: a.id });
    }
    return out;
  }, [history, visit.id]);

  const flatLine = [details.flat_number, details.bhk].filter(Boolean).join(' · ');
  const beforeLeft = required - before;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Work photos</Text>
          {!!details.property && <Text style={styles.subtitle}>{details.property}</Text>}
        </View>
        {!!flatLine && (
          <View style={styles.flatChip}>
            <Text style={styles.flatChipText}>Flat {flatLine}</Text>
          </View>
        )}
      </View>

      {inProgress && !beforeDone && (
        <PulseBanner text={`Upload ${beforeLeft === 1 && required === 1 ? 'a' : beforeLeft} before-work photo${beforeLeft === 1 ? '' : 's'} before you start the work`} />
      )}
      {inProgress && beforeDone && !afterDone && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            When the work is finished, upload {required === 1 ? 'an after-work photo' : 'the after-work photos'}.
          </Text>
        </View>
      )}

      <PhotoPhasePanel
        index={1}
        title="Before work"
        hint={
          inProgress || beforeDone
            ? `At least ${photoCount(required)} of the flat before you start.`
            : `After Start Visit, take at least ${photoCount(required)} before you start the work.`
        }
        count={before}
        required={required}
        uploaded={uploaded.before}
        canAdd={inProgress}
        locked={false}
        phase="before"
        jobId={jobId}
        visitId={visit.id}
        onView={setViewing}
        onUploaded={onUploaded}
        onMessage={onMessage}
      />
      <PhotoPhasePanel
        index={2}
        title="After work"
        hint={`At least ${photoCount(required)} of the finished work.`}
        lockedHint={`Unlocks after the before-work ${required === 1 ? 'photo' : 'photos'}.`}
        count={after}
        required={required}
        uploaded={uploaded.after}
        canAdd={inProgress && beforeDone}
        locked={!beforeDone}
        phase="after"
        jobId={jobId}
        visitId={visit.id}
        onView={setViewing}
        onUploaded={onUploaded}
        onMessage={onMessage}
      />

      <View style={styles.endRow}>
        <StepMarker index={3} done={ended} />
        <Text style={styles.endText}>
          {visit.status === 'AWAITING_APPROVAL'
            ? 'Visit ended - waiting for supervisor approval.'
            : visit.status === 'COMPLETED'
              ? 'Visit approved.'
              : beforeDone && afterDone
                ? 'All photos uploaded - tap End Visit below.'
                : 'End Visit unlocks when both steps are done.'}
        </Text>
      </View>

      <PhotoViewer attachmentId={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

/** A soft blinking reminder, until the before-work photos are in. */
function PulseBanner({ text }: { text: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.pulseBanner, { opacity }]} accessibilityRole="alert">
      <CameraIcon size={18} color={colors.warningText} />
      <Text style={styles.pulseText}>{text}</Text>
    </Animated.View>
  );
}

function StepMarker({ index, done }: { index: number; done: boolean }) {
  return (
    <View style={[styles.marker, done && styles.markerDone]}>
      {done ? (
        <CheckCircleIcon size={14} color={colors.textOnPrimary} />
      ) : (
        <Text style={styles.markerText}>{index}</Text>
      )}
    </View>
  );
}

interface PanelProps {
  index: number;
  title: string;
  hint: string;
  lockedHint?: string;
  count: number;
  required: number;
  uploaded: UploadedPhoto[];
  /** Picker + upload available (visit in progress, step unlocked). */
  canAdd: boolean;
  locked: boolean;
  phase: PhotoPhase;
  jobId: string;
  visitId: string;
  onView: (attachmentId: string) => void;
  onUploaded: () => Promise<void> | void;
  onMessage: Props['onMessage'];
}

function PhotoPhasePanel({
  index,
  title,
  hint,
  lockedHint,
  count,
  required,
  uploaded,
  canAdd,
  locked,
  phase,
  jobId,
  visitId,
  onView,
  onUploaded,
  onMessage,
}: PanelProps) {
  const [picked, setPicked] = useState<ComposerPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const done = count >= required;
  const progressPct = Math.min(count / required, 1) * 100;

  function addAssets(response: { didCancel?: boolean; errorMessage?: string; assets?: Asset[] }) {
    setPickerError(null);
    if (response.didCancel) return;
    if (response.errorMessage) {
      setPickerError('Unable to open camera/gallery. Please try again.');
      return;
    }
    const assets = Object.values(response.assets ?? []).filter((a) => !!a.uri);
    const items = assets.map((a, i) => ({
      uri: a.uri as string,
      name: a.fileName || `${phase}-photo-${Date.now()}-${i}.jpg`,
      type: a.type || 'image/jpeg',
    }));
    setPicked((prev) => [...prev, ...items].slice(0, MAX_PICKED));
  }

  async function handleCamera() {
    if (picked.length >= MAX_PICKED) return;
    if (Platform.OS === 'android') {
      // Same reason as CommentComposer: the manifest declares CAMERA, so it
      // must be granted at runtime before the system camera will open.
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Camera permission',
        message: 'BestServe needs camera access to take the work photos.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setPickerError('Camera permission was denied. Enable it in Settings to take photos.');
        return;
      }
    }
    addAssets(await launchCamera(PICKER_OPTIONS));
  }

  async function handleGallery() {
    if (picked.length >= MAX_PICKED) return;
    addAssets(
      await launchImageLibrary({ ...PICKER_OPTIONS, selectionLimit: MAX_PICKED - picked.length }),
    );
  }

  async function handleUpload() {
    if (!picked.length || uploading) return;
    setUploading(true);
    setProgress(0);
    let sent = 0;
    try {
      const { history_id } = await brigadeApi.startPhotoUpload(visitId, phase);
      // One photo per call, in order - same as job updates.
      for (const photo of picked) {
        await jobsApi.uploadJobAttachment(jobId, history_id, photo);
        sent += 1;
        setProgress(sent);
      }
      setPicked([]);
      onMessage(`${sent} photo${sent === 1 ? '' : 's'} uploaded`, 'success');
    } catch (err) {
      setPicked((prev) => prev.slice(sent));
      const reason = err instanceof Error && err.message ? ` ${err.message}` : '';
      onMessage(
        sent
          ? `${sent} of ${picked.length} photos uploaded; the rest failed.${reason}`
          : `Photos could not be uploaded.${reason}`,
        'error',
      );
    } finally {
      setUploading(false);
      await onUploaded();
    }
  }

  return (
    <View style={[styles.panel, done && styles.panelDone, locked && styles.panelLocked]}>
      <View style={styles.panelHead}>
        <StepMarker index={index} done={done} />
        <Text style={styles.panelTitle}>{title}</Text>
        {locked ? (
          <LockIcon size={16} color={colors.textMuted} />
        ) : (
          <Text style={[styles.counter, done && styles.counterDone]}>
            {done ? `${count} uploaded` : `${count}/${required}`}
          </Text>
        )}
      </View>

      {!locked && (
        <View style={styles.track}>
          <View style={[styles.trackFill, done && styles.trackFillDone, { width: `${progressPct}%` }]} />
        </View>
      )}

      <Text style={styles.panelHint}>{locked ? lockedHint : hint}</Text>

      {(uploaded.length > 0 || picked.length > 0 || canAdd) && (
        <View style={styles.grid}>
          {uploaded.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => onView(p.id)}
              accessibilityRole="imagebutton"
              accessibilityLabel="View uploaded photo"
            >
              <AttachmentImage attachmentId={p.id} size={TILE} />
              <View style={styles.uploadedTick}>
                <CheckCircleIcon size={12} color={colors.textOnPrimary} />
              </View>
            </Pressable>
          ))}

          {picked.map((photo, i) => (
            <View key={`${photo.uri}-${i}`} style={styles.pendingWrap}>
              <Image source={{ uri: photo.uri }} style={[styles.tileImage, styles.pendingImage]} />
              <View style={styles.pendingTag}>
                <Text style={styles.pendingTagText}>{uploading && i < progress ? 'SENT' : 'NEW'}</Text>
              </View>
              {!uploading && (
                <Pressable
                  onPress={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                  style={styles.removeBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <CloseIcon size={12} color={colors.textOnPrimary} />
                </Pressable>
              )}
            </View>
          ))}

          {canAdd && picked.length < MAX_PICKED && (
            <>
              <Pressable
                onPress={handleCamera}
                disabled={uploading}
                style={styles.addTile}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
              >
                <CameraIcon size={22} color={colors.primary} />
                <Text style={styles.addTileText}>Camera</Text>
              </Pressable>
              <Pressable
                onPress={handleGallery}
                disabled={uploading}
                style={styles.addTile}
                accessibilityRole="button"
                accessibilityLabel="Choose from gallery"
              >
                <GalleryIcon size={22} color={colors.primary} />
                <Text style={styles.addTileText}>Gallery</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {!!pickerError && <Text style={styles.error}>{pickerError}</Text>}

      {picked.length > 0 && (
        <Button
          label={
            uploading
              ? `Uploading ${Math.min(progress + 1, picked.length)} of ${picked.length}…`
              : `Upload ${picked.length} photo${picked.length === 1 ? '' : 's'}`
          }
          onPress={handleUpload}
          loading={uploading}
          style={styles.uploadButton}
        />
      )}
    </View>
  );
}

/** Full-size view of an uploaded photo (same authenticated URL as the thumbnails). */
function PhotoViewer({ attachmentId, onClose }: { attachmentId: string | null; onClose: () => void }) {
  const [authHeader, setAuthHeader] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (attachmentId) {
      getToken().then((token) => {
        if (!cancelled && token) setAuthHeader(`Bearer ${token}`);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return (
    <Modal visible={!!attachmentId} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewerBackdrop} onPress={onClose} accessibilityLabel="Close photo">
        {!!attachmentId && !!authHeader && (
          <Image
            source={{
              uri: `${API_BASE_URL}/api/attachments/${attachmentId}/view`,
              headers: { Authorization: authHeader },
            }}
            style={styles.viewerImage}
            resizeMode="contain"
          />
        )}
        <View style={styles.viewerClose}>
          <CloseIcon size={18} color={colors.textOnPrimary} />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  flatChip: {
    backgroundColor: colors.infoBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  flatChipText: {
    ...typography.captionMedium,
    color: colors.info,
  },
  pulseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pulseText: {
    ...typography.bodyMedium,
    color: colors.warningText,
    flex: 1,
  },
  infoBanner: {
    backgroundColor: colors.infoBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  infoBannerText: {
    ...typography.caption,
    color: colors.info,
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  panelDone: {
    borderColor: colors.successBg,
  },
  panelLocked: {
    opacity: 0.55,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  panelTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  panelHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDone: {
    backgroundColor: colors.success,
  },
  markerText: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  counter: {
    ...typography.captionMedium,
    color: colors.warningText,
    backgroundColor: colors.warningBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  counterDone: {
    color: colors.successText,
    backgroundColor: colors.successBg,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  trackFillDone: {
    backgroundColor: colors.success,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  tileImage: {
    width: TILE,
    height: TILE,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  uploadedTick: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingWrap: {
    width: TILE,
    height: TILE,
  },
  pendingImage: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  pendingTag: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pendingTagText: {
    ...typography.caption,
    color: colors.textOnPrimary,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addTileText: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 11,
  },
  uploadButton: {
    marginTop: spacing.xxs,
  },
  error: {
    ...typography.caption,
    color: colors.dangerText,
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xxs,
  },
  endText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '80%',
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

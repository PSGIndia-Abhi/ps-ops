import React, { useRef, useState } from 'react';
import {
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { createSound, type RecordBackType } from 'react-native-nitro-sound';
import { CameraIcon, CloseIcon, DocumentIcon, GalleryIcon, MicIcon, SendIcon, StopIcon } from './icons';
import { colors, radii, spacing, typography } from '../theme';

export interface ComposerPhoto {
  uri: string;
  name: string;
  type: string;
}

interface CommentComposerProps {
  onSubmit: (input: { message: string; attachments: ComposerPhoto[] }) => Promise<void> | void;
  submitting?: boolean;
}

const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8 as const,
  maxWidth: 1600,
  maxHeight: 1600,
};

/** A generous cap, not a real backend limit (there isn't one - each
 * attachment is its own upload call) - just keeps one update from turning
 * into dozens of sequential uploads by accident. */
const MAX_ATTACHMENTS = 10;

function isImageAttachment(type: string): boolean {
  return type.startsWith('image/');
}

function isAudioAttachment(type: string): boolean {
  return type.startsWith('audio/');
}

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * The one "add an update" input for a job: a note plus optional attachments,
 * submitted together - mirrors the existing web app's JobUpdateComposer
 * (frontend/src/components/JobUpdateComposer.jsx), which already has all
 * four of these exact capabilities (photo/camera, generic file picker, and
 * microphone voice-note recording) - this brings mobile to parity with an
 * existing feature, not inventing a new one. A photo/attachment-only update
 * still needs *some* message, so an empty caption defaults to "Attachment
 * added" (the web's own fallback text) rather than sending a message the
 * backend would reject as empty.
 *
 * Every attachment kind normalizes to the same `{uri, name, type}` shape
 * before it ever reaches state, and the backend's own `type` field for the
 * upload call is derived the exact same way the web app already does it
 * (`file.type.startsWith('image') ? 'IMAGE' : 'FILE'` - see
 * JobDetailScreen's handleAddComment) - nothing new needed there either,
 * `POST .../attachments/upload` already accepts any file, one per call.
 */
export function CommentComposer({ onSubmit, submitting }: CommentComposerProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<ComposerPhoto[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  // One instance for this composer's lifetime, not recreated per render -
  // it owns a live native recorder/player session.
  const recorderRef = useRef<ReturnType<typeof createSound> | null>(null);
  if (!recorderRef.current) recorderRef.current = createSound();

  function addAttachments(items: ComposerPhoto[]) {
    if (!items.length) return;
    setAttachments((prev) => [...prev, ...items].slice(0, MAX_ATTACHMENTS));
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function addAssets(response: { didCancel?: boolean; errorMessage?: string; assets?: Asset[] }) {
    setPickerError(null);
    if (response.didCancel) return;
    if (response.errorMessage) {
      setPickerError('Unable to open camera/gallery. Please try again.');
      return;
    }
    const assets = Object.values(response.assets ?? []).filter((a) => !!a.uri);
    addAttachments(
      assets.map((a, i) => ({
        uri: a.uri as string,
        name: a.fileName || `photo-${Date.now()}-${i}.jpg`,
        type: a.type || 'image/jpeg',
      })),
    );
  }

  /**
   * react-native-image-picker's own docs/source are explicit about this:
   * the library does NOT request `CAMERA` at runtime itself - its stance is
   * that most apps don't need to declare the permission at all (the system
   * camera app handles its own). But `AndroidManifest.xml` here does declare
   * it (needed so `<uses-permission>` shows up honestly for what this app
   * does), and the moment an app declares it, Android requires it to
   * actually be *granted* before `ACTION_IMAGE_CAPTURE` will work - an
   * ungranted declared permission throws a `SecurityException` instead
   * (https://issuetracker.google.com/issues/37063818, referenced directly in
   * the library's own Utils.java). Nothing here was ever requesting it, so
   * the camera silently failed on every device consistently - not a
   * hardware/emulator issue at all. iOS is unaffected (no manifest to
   * mismatch; its permission prompt is driven by Info.plist).
   */
  async function handleCamera() {
    if (attachments.length >= MAX_ATTACHMENTS) return;
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Camera permission',
        message: 'BestServe needs camera access to attach a photo to this job update.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setPickerError('Camera permission was denied. Enable it in Settings to take a photo.');
        return;
      }
    }
    // One shot per tap (a real camera can't return more than one) - tapping
    // again adds another on top of whatever's already picked.
    const response = await launchCamera(PICKER_OPTIONS);
    addAssets(response);
  }

  async function handleGallery() {
    if (attachments.length >= MAX_ATTACHMENTS) return;
    const response = await launchImageLibrary({
      ...PICKER_OPTIONS,
      selectionLimit: MAX_ATTACHMENTS - attachments.length,
    });
    addAssets(response);
  }

  /** The generic "Attach Files & Photos" equivalent - any file type, not
   * just images (a PDF, a spreadsheet, anything) - matching the web app's
   * own plain `<input type="file">` picker exactly. */
  async function handleDocument() {
    if (attachments.length >= MAX_ATTACHMENTS) return;
    setPickerError(null);
    try {
      const results = await pick({ allowMultiSelection: true });
      addAttachments(
        results.map((r, i) => ({
          uri: r.uri,
          name: r.name || `file-${Date.now()}-${i}`,
          type: r.type || 'application/octet-stream',
        })),
      );
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      setPickerError('Unable to open file picker. Please try again.');
    }
  }

  /** Tap to start, tap again to stop - the recorded file is appended as a
   * normal attachment the instant recording stops, same as any other pick. */
  async function handleVoiceNote() {
    const recorder = recorderRef.current!;
    if (isRecording) {
      const uri = await recorder.stopRecorder();
      recorder.removeRecordBackListener();
      setIsRecording(false);
      const seconds = recordSeconds;
      setRecordSeconds(0);
      addAttachments([
        { uri, name: `voice-note-${Date.now()}-${formatSeconds(seconds)}.m4a`, type: 'audio/m4a' },
      ]);
      return;
    }

    if (attachments.length >= MAX_ATTACHMENTS) return;
    setPickerError(null);
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone permission',
        message: 'BestServe needs microphone access to record a voice note for this job update.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setPickerError('Microphone permission was denied. Enable it in Settings to record a voice note.');
        return;
      }
    }
    try {
      await recorder.startRecorder();
      recorder.addRecordBackListener((e: RecordBackType) =>
        setRecordSeconds(Math.floor(e.currentPosition / 1000)),
      );
      setIsRecording(true);
    } catch {
      setPickerError('Unable to start recording. Please try again.');
    }
  }

  const canSubmit = (message.trim().length > 0 || attachments.length > 0) && !submitting && !isRecording;

  async function handleSubmit() {
    if (!canSubmit) return;
    const trimmed = message.trim();
    await onSubmit({ message: trimmed || 'Attachment added', attachments });
    setMessage('');
    setAttachments([]);
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Add a note about this job..."
        placeholderTextColor={colors.textMuted}
        value={message}
        onChangeText={setMessage}
        multiline
        editable={!submitting}
      />

      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewRow}
          contentContainerStyle={styles.previewRowContent}
        >
          {attachments.map((a, index) => (
            <View key={`${a.uri}-${index}`} style={styles.previewWrap}>
              {isImageAttachment(a.type) ? (
                <Image source={{ uri: a.uri }} style={styles.previewImage} />
              ) : (
                <View style={styles.previewChip}>
                  {isAudioAttachment(a.type) ? (
                    <MicIcon size={20} color={colors.primary} />
                  ) : (
                    <DocumentIcon size={20} color={colors.primary} />
                  )}
                  <Text style={styles.previewChipText} numberOfLines={2}>
                    {a.name}
                  </Text>
                </View>
              )}
              <Pressable
                style={styles.removePhoto}
                onPress={() => removeAttachment(index)}
                hitSlop={8}
                disabled={submitting}
              >
                <CloseIcon size={14} color={colors.textOnPrimary} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {isRecording && (
        <View style={styles.recordingRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording... {formatSeconds(recordSeconds)}</Text>
        </View>
      )}

      {!!pickerError && <Text style={styles.errorText}>{pickerError}</Text>}

      <View style={styles.actionsRow}>
        <View style={styles.attachRow}>
          <Pressable
            style={styles.iconButton}
            onPress={handleCamera}
            disabled={submitting || isRecording}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
          >
            <CameraIcon size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            onPress={handleGallery}
            disabled={submitting || isRecording}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
          >
            <GalleryIcon size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            onPress={handleDocument}
            disabled={submitting || isRecording}
            accessibilityRole="button"
            accessibilityLabel="Attach a file"
          >
            <DocumentIcon size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={[styles.iconButton, isRecording && styles.iconButtonRecording]}
            onPress={handleVoiceNote}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Record voice note'}
          >
            {isRecording ? (
              <StopIcon size={16} color={colors.danger} />
            ) : (
              <MicIcon size={18} color={colors.textSecondary} />
            )}
          </Pressable>
          {attachments.length > 0 && (
            <Text style={styles.attachmentCount}>{attachments.length}</Text>
          )}
        </View>

        <Pressable
          style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Post update"
        >
          <SendIcon size={16} color={colors.textOnPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  previewRow: {
    marginTop: spacing.sm,
  },
  previewRowContent: {
    gap: spacing.sm,
  },
  previewWrap: {
    position: 'relative',
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  previewChip: {
    width: 84,
    height: 72,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxs,
    gap: 2,
  },
  previewChipText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  recordingText: {
    ...typography.captionMedium,
    color: colors.danger,
  },
  errorText: {
    ...typography.caption,
    color: colors.dangerText,
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonRecording: {
    backgroundColor: colors.dangerBg,
  },
  attachmentCount: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.xxs,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});

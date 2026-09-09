import React, { useState } from 'react';
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
import { CameraIcon, CloseIcon, GalleryIcon, SendIcon } from './icons';
import { colors, radii, spacing, typography } from '../theme';

export interface ComposerPhoto {
  uri: string;
  name: string;
  type: string;
}

interface CommentComposerProps {
  onSubmit: (input: { message: string; photos: ComposerPhoto[] }) => Promise<void> | void;
  submitting?: boolean;
}

const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8 as const,
  maxWidth: 1600,
  maxHeight: 1600,
};

/** A generous cap, not a real backend limit (there isn't one - each photo is
 * its own upload call) - just keeps one update from turning into dozens of
 * sequential uploads by accident. */
const MAX_PHOTOS = 10;

/**
 * The one "add an update" input for a job: a note plus optional photos,
 * submitted together - mirrors the existing web app's JobUpdateComposer
 * (frontend/src/components/JobUpdateComposer.jsx): a photo-only update
 * still needs *some* message, so an empty caption defaults to "Attachment
 * added" (the web's own fallback text) rather than sending a message the
 * backend would reject as empty.
 *
 * More than one photo per update - the gallery picker supports multi-select
 * (`selectionLimit: 0`) and the camera can be tapped again to add another
 * shot; both append to the same list rather than replacing it. Nothing on
 * the backend needed to change for this: `POST .../attachments/upload`
 * already takes one file per call and just inserts a new row each time, so
 * multiple photos from one update are multiple sequential calls against the
 * same `history_id` (see JobDetailScreen's handleAddComment), not a new
 * multi-file endpoint.
 */
export function CommentComposer({ onSubmit, submitting }: CommentComposerProps) {
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);

  function addAssets(response: { didCancel?: boolean; errorMessage?: string; assets?: Asset[] }) {
    setPickerError(null);
    if (response.didCancel) return;
    if (response.errorMessage) {
      setPickerError('Unable to open camera/gallery. Please try again.');
      return;
    }
    const assets = (response.assets ?? []).filter((a) => !!a.uri);
    if (!assets.length) return;
    setPhotos((prev) => [...prev, ...assets].slice(0, MAX_PHOTOS));
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
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
    if (photos.length >= MAX_PHOTOS) return;
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
    // again adds another on top of whatever's already picked, same as the
    // gallery's multi-select does.
    const response = await launchCamera(PICKER_OPTIONS);
    addAssets(response);
  }

  async function handleGallery() {
    if (photos.length >= MAX_PHOTOS) return;
    const response = await launchImageLibrary({
      ...PICKER_OPTIONS,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    addAssets(response);
  }

  const canSubmit = (message.trim().length > 0 || photos.length > 0) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    const trimmed = message.trim();
    await onSubmit({
      message: trimmed || 'Attachment added',
      photos: photos
        .filter((p) => !!p.uri)
        .map((p, i) => ({
          uri: p.uri as string,
          name: p.fileName || `photo-${Date.now()}-${i}.jpg`,
          type: p.type || 'image/jpeg',
        })),
    });
    setMessage('');
    setPhotos([]);
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

      {photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewRow}
          contentContainerStyle={styles.previewRowContent}
        >
          {photos.map((p, index) => (
            <View key={p.uri ?? index} style={styles.previewWrap}>
              <Image source={{ uri: p.uri }} style={styles.previewImage} />
              <Pressable
                style={styles.removePhoto}
                onPress={() => removePhoto(index)}
                hitSlop={8}
                disabled={submitting}
              >
                <CloseIcon size={14} color={colors.textOnPrimary} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {!!pickerError && <Text style={styles.errorText}>{pickerError}</Text>}

      <View style={styles.actionsRow}>
        <View style={styles.attachRow}>
          <Pressable
            style={styles.iconButton}
            onPress={handleCamera}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
          >
            <CameraIcon size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            onPress={handleGallery}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
          >
            <GalleryIcon size={18} color={colors.textSecondary} />
          </Pressable>
          {photos.length > 0 && (
            <Text style={styles.photoCount}>
              {photos.length} photo{photos.length === 1 ? '' : 's'}
            </Text>
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
  photoCount: {
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

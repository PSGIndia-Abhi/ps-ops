import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import { CameraIcon, CloseIcon, GalleryIcon, SendIcon } from './icons';
import { colors, radii, spacing, typography } from '../theme';

export interface ComposerPhoto {
  uri: string;
  name: string;
  type: string;
}

interface CommentComposerProps {
  onSubmit: (input: { message: string; photo: ComposerPhoto | null }) => Promise<void> | void;
  submitting?: boolean;
}

const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8 as const,
  maxWidth: 1600,
  maxHeight: 1600,
};

/**
 * The one "add an update" input for a job: a note plus an optional photo,
 * submitted together - mirrors the existing web app's JobUpdateComposer
 * exactly (frontend/src/components/JobUpdateComposer.jsx): a photo-only
 * update still needs *some* message, so an empty caption defaults to
 * "Attachment added" (the web's own fallback text) rather than sending a
 * message the backend would reject as empty.
 */
export function CommentComposer({ onSubmit, submitting }: CommentComposerProps) {
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<Asset | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  function handleAsset(response: { didCancel?: boolean; errorMessage?: string; assets?: Asset[] }) {
    setPickerError(null);
    if (response.didCancel) return;
    if (response.errorMessage) {
      setPickerError('Unable to open camera/gallery. Please try again.');
      return;
    }
    const asset = response.assets?.[0];
    if (asset?.uri) setPhoto(asset);
  }

  async function handleCamera() {
    const response = await launchCamera(PICKER_OPTIONS);
    handleAsset(response);
  }

  async function handleGallery() {
    const response = await launchImageLibrary(PICKER_OPTIONS);
    handleAsset(response);
  }

  const canSubmit = (message.trim().length > 0 || !!photo) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    const trimmed = message.trim();
    await onSubmit({
      message: trimmed || 'Attachment added',
      photo: photo?.uri
        ? {
            uri: photo.uri,
            name: photo.fileName || `photo-${Date.now()}.jpg`,
            type: photo.type || 'image/jpeg',
          }
        : null,
    });
    setMessage('');
    setPhoto(null);
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

      {!!photo?.uri && (
        <View style={styles.previewWrap}>
          <Image source={{ uri: photo.uri }} style={styles.previewImage} />
          <Pressable
            style={styles.removePhoto}
            onPress={() => setPhoto(null)}
            hitSlop={8}
            disabled={submitting}
          >
            <CloseIcon size={14} color={colors.textOnPrimary} />
          </Pressable>
        </View>
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
  previewWrap: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
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

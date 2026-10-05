import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import { crmApi } from '../../api';
import { getToken } from '../../auth/tokenStorage';
import { CameraIcon, CloseIcon, GalleryIcon } from '../../components/icons';
import { API_BASE_URL } from '../../config/env';
import { radii, spacing, typography } from '../../theme';
import { newClientRef } from '../leadHelpers';
import { useCrmStyles, type CrmTheme } from '../theme';
import {
  MAX_LEAD_PHOTOS,
  type LeadPhoto,
  type LocalLeadPhoto,
} from '../types';
import { CrmSkeleton } from './CrmScreen';

const THUMB = 84;

const factory = (t: CrmTheme) => ({
  buttons: { flexDirection: 'row' as const, gap: spacing.sm },
  addButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: t.primary,
    backgroundColor: t.primarySoftBg,
  },
  addButtonOff: { opacity: 0.45 },
  addText: { ...typography.captionMedium, color: t.primary },
  pressed: { opacity: 0.8 },
  hint: { ...typography.caption, color: t.textMuted, marginTop: spacing.sm },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
  },
  gridBelowButtons: { marginTop: spacing.md },
  thumbWrap: { width: THUMB, height: THUMB },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.md,
    backgroundColor: t.surfaceAlt,
  },
  remove: {
    position: 'absolute' as const,
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.danger,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: t.surface,
  },
  empty: { ...typography.caption, color: t.textMuted },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  viewerImage: { width: '100%' as const, height: '100%' as const },
  viewerClose: {
    position: 'absolute' as const,
    top: 44,
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

function toLocalPhotos(response: ImagePickerResponse): LocalLeadPhoto[] {
  return (response.assets ?? [])
    .filter(a => !!a.uri)
    .map(a => ({
      ref: newClientRef(),
      uri: a.uri as string,
      name: a.fileName || `photo-${Date.now()}.jpg`,
      type: a.type || 'image/jpeg',
    }));
}

// Resized on the phone before upload: a site photo does not need full camera resolution.
const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.7 as const,
  maxWidth: 1920,
  maxHeight: 1920,
};

interface LeadPhotoPickerProps {
  photos: LocalLeadPhoto[];
  onChange: (photos: LocalLeadPhoto[]) => void;
  /** Something the rep should know (permission denied, the camera would not open). */
  onProblem: (message: string) => void;
}

/** "Take photo" / "From gallery" plus the photos picked so far, each removable. Up to MAX_LEAD_PHOTOS. */
export function LeadPhotoPicker({
  photos,
  onChange,
  onProblem,
}: LeadPhotoPickerProps) {
  const { styles, theme } = useCrmStyles(factory);
  const remaining = MAX_LEAD_PHOTOS - photos.length;
  const full = remaining <= 0;

  function add(response: ImagePickerResponse) {
    if (response.didCancel) return;
    if (response.errorCode) {
      onProblem(
        response.errorCode === 'camera_unavailable'
          ? 'No camera is available on this device.'
          : 'Could not get the photo. Please try again.',
      );
      return;
    }
    onChange([...photos, ...toLocalPhotos(response)].slice(0, MAX_LEAD_PHOTOS));
  }

  async function takePhoto() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        onProblem('Camera permission was denied.');
        return;
      }
    }
    try {
      add(await launchCamera(PICKER_OPTIONS));
    } catch {
      onProblem('Could not open the camera.');
    }
  }

  async function pickFromGallery() {
    try {
      add(
        await launchImageLibrary({
          ...PICKER_OPTIONS,
          selectionLimit: remaining,
        }),
      );
    } catch {
      onProblem('Could not open the gallery.');
    }
  }

  return (
    <View>
      <View style={styles.buttons}>
        <Pressable
          onPress={takePhoto}
          disabled={full}
          accessibilityRole="button"
          accessibilityLabel="Take a photo"
          testID="photo-camera"
          style={({ pressed }) => [
            styles.addButton,
            full && styles.addButtonOff,
            pressed && styles.pressed,
          ]}
        >
          <CameraIcon size={18} color={theme.primary} />
          <Text style={styles.addText}>Take photo</Text>
        </Pressable>
        <Pressable
          onPress={pickFromGallery}
          disabled={full}
          accessibilityRole="button"
          accessibilityLabel="Choose photos from the gallery"
          testID="photo-gallery"
          style={({ pressed }) => [
            styles.addButton,
            full && styles.addButtonOff,
            pressed && styles.pressed,
          ]}
        >
          <GalleryIcon size={18} color={theme.primary} />
          <Text style={styles.addText}>From gallery</Text>
        </Pressable>
      </View>

      {photos.length > 0 && (
        <View style={[styles.grid, styles.gridBelowButtons]}>
          {photos.map((photo, index) => (
            <View key={photo.ref} style={styles.thumbWrap}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} />
              <Pressable
                onPress={() => onChange(photos.filter(p => p.ref !== photo.ref))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
                style={styles.remove}
              >
                <CloseIcon size={12} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.hint}>
        {full
          ? `${MAX_LEAD_PHOTOS} photos added - that is the most a lead can have.`
          : `${photos.length} of ${MAX_LEAD_PHOTOS} photos added (optional).`}
      </Text>
    </View>
  );
}

/** Thumbnails that open full-screen on tap. */
function PhotoThumbs({
  sources,
}: {
  sources: { key: string; source: ImageSourcePropType }[];
}) {
  const { styles } = useCrmStyles(factory);
  const [open, setOpen] = useState<ImageSourcePropType | null>(null);

  return (
    <View style={styles.grid}>
      {sources.map((item, index) => (
        <Pressable
          key={item.key}
          onPress={() => setOpen(item.source)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Open photo ${index + 1}`}
        >
          <Image source={item.source} style={styles.thumb} />
        </Pressable>
      ))}
      <Modal
        visible={open !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(null)}
      >
        <View style={styles.viewer}>
          {open !== null && (
            <Image
              source={open}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
          <Pressable
            onPress={() => setOpen(null)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            style={styles.viewerClose}
          >
            <CloseIcon size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

/** Photos that are still only on this phone (the review step, or a lead waiting to be sent). */
export function LocalLeadPhotos({ photos }: { photos: LocalLeadPhoto[] }) {
  return (
    <PhotoThumbs
      sources={photos.map(p => ({ key: p.ref, source: { uri: p.uri } }))}
    />
  );
}

/**
 * A saved lead's photos, loaded from the server. The view URL sits behind the same Bearer auth
 * as every other request, so each <Image> carries the token in its own headers.
 */
export function ServerLeadPhotos({ leadId }: { leadId: string }) {
  const { styles } = useCrmStyles(factory);
  const [photos, setPhotos] = useState<LeadPhoto[] | null>(null);
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhotos(null);
    setFailed(false);
    Promise.all([crmApi.listLeadPhotos(leadId), getToken()])
      .then(([list, token]) => {
        if (cancelled) return;
        setPhotos(list);
        setAuthHeader(token ? `Bearer ${token}` : null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (failed) {
    return <Text style={styles.empty}>The photos could not be loaded.</Text>;
  }
  if (photos === null) {
    return <CrmSkeleton width={THUMB} height={THUMB} radius={radii.md} />;
  }
  if (photos.length === 0) {
    return <Text style={styles.empty}>No photos were added to this lead.</Text>;
  }

  return (
    <PhotoThumbs
      sources={photos.map(p => ({
        key: p.id,
        source: {
          uri: `${API_BASE_URL}${crmApi.leadPhotoViewPath(leadId, p.id)}`,
          headers: authHeader ? { Authorization: authHeader } : undefined,
        },
      }))}
    />
  );
}

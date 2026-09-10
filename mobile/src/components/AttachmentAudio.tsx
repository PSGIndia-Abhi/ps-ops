import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createSound, type PlayBackType } from 'react-native-nitro-sound';
import { getToken } from '../auth/tokenStorage';
import { API_BASE_URL } from '../config/env';
import { PauseIcon, PlayIcon } from './icons';
import { colors, radii, spacing, typography } from '../theme';

interface AttachmentAudioProps {
  attachmentId: string;
  fileName?: string | null;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * A voice-note attachment, played inline - mirrors the web app's own
 * `<audio controls src={...}>` (JobTimeline.jsx) with the same intent (play
 * it right where it's attached), built instead on
 * `react-native-nitro-sound`'s player half (already a dependency for
 * recording one in CommentComposer, so this doesn't add a second library
 * just for playback). `startPlayer`'s own `httpHeaders` param
 * carries the same Bearer token `AttachmentImage` attaches via
 * `source.headers` - `GET /api/attachments/:id/view` is never a public URL.
 */
export function AttachmentAudio({ attachmentId, fileName }: AttachmentAudioProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<ReturnType<typeof createSound> | null>(null);
  if (!playerRef.current) playerRef.current = createSound();

  useEffect(() => {
    return () => {
      const player = playerRef.current;
      player?.stopPlayer().catch(() => {});
      player?.removePlayBackListener();
      player?.removePlaybackEndListener();
    };
  }, []);

  async function toggle() {
    const player = playerRef.current!;
    if (isPlaying) {
      await player.pausePlayer();
      setIsPlaying(false);
      return;
    }
    if (position > 0 && position < duration) {
      await player.resumePlayer();
      setIsPlaying(true);
      return;
    }
    const token = await getToken();
    await player.startPlayer(
      `${API_BASE_URL}/api/attachments/${attachmentId}/view`,
      token ? { Authorization: `Bearer ${token}` } : undefined,
    );
    player.addPlayBackListener((e: PlayBackType) => {
      setPosition(e.currentPosition);
      setDuration(e.duration);
    });
    // "Finished" is its own listener here (unlike the old library this
    // replaced, which folded an `isFinished` flag into the regular playback
    // progress callback) - nitro-sound fires it once, separately, exactly
    // when playback reaches the end.
    player.addPlaybackEndListener(() => {
      setIsPlaying(false);
      setPosition(0);
      player.stopPlayer().catch(() => {});
    });
    setIsPlaying(true);
  }

  return (
    <Pressable style={styles.wrap} onPress={toggle} accessibilityRole="button">
      <View style={styles.iconWrap}>
        {isPlaying ? (
          <PauseIcon size={16} color={colors.textOnPrimary} />
        ) : (
          <PlayIcon size={14} color={colors.textOnPrimary} />
        )}
      </View>
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {fileName || 'Voice note'}
        </Text>
        <Text style={styles.time}>
          {duration > 0 ? `${formatMs(position)} / ${formatMs(duration)}` : 'Tap to play'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minWidth: 160,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flexShrink: 1,
  },
  name: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  time: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
});

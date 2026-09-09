import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { getToken } from '../auth/tokenStorage';
import { API_BASE_URL } from '../config/env';
import { Skeleton } from './Skeleton';
import { colors, radii } from '../theme';

interface AttachmentImageProps {
  attachmentId: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * GET /api/attachments/:id/view streams the file behind the same Bearer
 * auth as every other request - it's not a public URL, so <Image> needs the
 * token attached to this one request via `source.headers` (RN's Image
 * supports per-request headers for network images).
 */
export function AttachmentImage({ attachmentId, size = 72, style }: AttachmentImageProps) {
  const [authHeader, setAuthHeader] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getToken().then((token) => {
      if (!cancelled && token) setAuthHeader(`Bearer ${token}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authHeader) {
    return <Skeleton width={size} height={size} radius={radii.sm} style={style as ViewStyle} />;
  }

  return (
    <View style={[{ width: size, height: size, borderRadius: radii.sm }, styles.wrap, style]}>
      <Image
        source={{
          uri: `${API_BASE_URL}/api/attachments/${attachmentId}/view`,
          headers: { Authorization: authHeader },
        }}
        style={{ width: size, height: size, borderRadius: radii.sm }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
});

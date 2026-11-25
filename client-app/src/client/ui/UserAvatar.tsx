import React, { useEffect, useState } from 'react';
import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { API_BASE_URL } from '../../config/env';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { useAuthHeader } from './page';

/**
 * The signed-in user's avatar: their profile photo (GET /api/auth/me/avatar) when they have one,
 * otherwise `fallback` - coloured initials by default. If the photo cannot load, the fallback shows.
 */
export function UserAvatar({ size, fallback, style }: { size: number; fallback?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { user } = useAuth();
  const authHeader = useAuthHeader();
  const [failed, setFailed] = useState(false);
  const version = user?.avatar_updated_at || '';

  // A new photo gets a new version - try loading it again.
  useEffect(() => setFailed(false), [version]);

  const name = user?.name || '';
  const showPhoto = !!user?.has_avatar && !!authHeader && !failed;

  const initialsView = (
    <View style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: avatarColor(user?.id ?? name) }, style]}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.34, fontWeight: '600', letterSpacing: 0.5 }}>{initials(name || '?')}</Text>
    </View>
  );

  if (!showPhoto) return <>{fallback ?? initialsView}</>;
  return (
    <Image
      source={{ uri: `${API_BASE_URL}/api/auth/me/avatar?v=${encodeURIComponent(version)}`, headers: { Authorization: authHeader } }}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E8EDF6' }, style as object]}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  );
}

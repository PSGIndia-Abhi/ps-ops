import React from 'react';
import { View } from 'react-native';
import { radii } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';

/**
 * A small soft-tinted rounded square holding a coloured icon - the icon at the start of the sales
 * app's text / select fields. The icon passed in is redrawn in the tile's colour (whatever colour
 * the caller gave it), so every field looks the same.
 */

const factory = (_t: CrmTheme) => ({
  tile: { alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: radii.sm + 2 },
  fill: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.sm + 2, opacity: 0.14 },
});

export function IconTile({ icon, color, size = 30 }: { icon: React.ReactNode; color?: string; size?: number }) {
  const { styles, theme } = useCrmStyles(factory);
  const tint = color ?? theme.primary;
  const glyph = React.isValidElement<{ color?: string; size?: number }>(icon)
    ? React.cloneElement(icon, { color: tint, size: Math.round(size * 0.55) })
    : icon;
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <View style={[styles.fill, { backgroundColor: tint }]} />
      {glyph}
    </View>
  );
}

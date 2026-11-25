import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

/**
 * A company's mark: a rounded tile with its initials ("Mahanadhi Hospital" -> "MH"), in a deep
 * colour picked from a fixed palette by the company id - so every company always gets the same
 * colour, and a rounded SQUARE never looks like a person's round avatar. No company has a logo
 * uploaded yet; when one does, it can replace the initials here.
 */

const PALETTE = ['#B8202B', '#1C6FC7', '#0F766E', '#6D28D9', '#C2410C', '#0E7490', '#4338CA', '#BE185D', '#15803D', '#A16207'];

// Words that say nothing about which company it is.
const SKIP = new Set(['pvt', 'pvt.', 'private', 'ltd', 'ltd.', 'limited', 'llp', 'inc', 'inc.', 'co', 'co.', 'the', 'and', '&', 'of', 'india']);

export function companyInitials(name: string): string {
  const words = name
    .replace(/[()[\]{}.,]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  if (words.length === 0) return (name.trim()[0] || 'B').toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function companyColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface Props {
  name: string;
  /** Stable id (company id) that picks the colour; falls back to the name. */
  colorKey?: string;
  size?: number;
  style?: ViewStyle;
}

export function CompanyMonogram({ name, colorKey, size = 44, style }: Props) {
  const letters = companyInitials(name || 'BestServe');
  return (
    <View
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: companyColor(colorKey || name || 'b') }, style]}
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      {/* A soft top highlight gives the flat tile a little depth. */}
      <View style={[styles.gloss, { borderTopLeftRadius: size * 0.3, borderTopRightRadius: size * 0.3, height: size * 0.5 }]} />
      <Text style={[styles.text, { fontSize: size * (letters.length > 1 ? 0.38 : 0.44) }]} allowFontScaling={false}>
        {letters}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.12)' },
  text: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.5 },
});

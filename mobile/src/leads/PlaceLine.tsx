import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { ExternalLinkIcon, PinIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';
import { reverseGeocode } from '../utils/reverseGeocode';
import type { Coords } from './types';

const factory = (t: CrmTheme) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const },
  text: { flex: 1 },
  label: { ...typography.caption, color: t.textMuted },
  time: { ...typography.bodyMedium, color: t.textPrimary },
  place: { ...typography.caption, color: t.textSecondary, marginTop: 1, lineHeight: 17 },
  placeMuted: { color: t.textMuted, fontStyle: 'italic' as const },
  mapBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: spacing.sm,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
  },
  mapText: { ...typography.captionMedium, color: '#FFFFFF' },
  noGps: {
    paddingHorizontal: spacing.sm,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: t.surfaceAlt,
    justifyContent: 'center' as const,
  },
  noGpsText: { ...typography.caption, color: t.textMuted },
});

// One lookup per point for the whole app session - lists re-render, the phone's geocoder is slow.
const cache = new Map<string, Promise<string | null>>();
function placeOf(c: Coords): Promise<string | null> {
  const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
  let hit = cache.get(key);
  if (!hit) {
    // Android sometimes starts the address with a Google plus code ("WHJM+8GF, ...") - drop it.
    hit = reverseGeocode(c.lat, c.lng).then((p) => (p ? p.replace(/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3},?\s*/i, '').trim() || p : p));
    cache.set(key, hit);
  }
  return hit;
}

/** The written place for a GPS point ("4th Cross, Jayanagar, Bengaluru"), or null while unknown. */
export function usePlace(coords: Coords | null | undefined): { place: string | null; looking: boolean } {
  const [place, setPlace] = useState<string | null>(null);
  const [looking, setLooking] = useState(!!coords);
  const lat = coords?.lat;
  const lng = coords?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      setLooking(false);
      return;
    }
    let alive = true;
    setLooking(true);
    placeOf({ lat, lng }).then((p) => {
      if (!alive) return;
      setPlace(p);
      setLooking(false);
    });
    return () => {
      alive = false;
    };
  }, [lat, lng]);
  return { place, looking };
}

export const mapsPoint = (c: Coords) => `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;

/**
 * One recorded moment of a visit: "Started · 11:04 AM", the place in words underneath, and a Map
 * button that opens the exact GPS point. Without a position it says so instead.
 */
export function PlaceLine({
  label,
  time,
  coords,
  tone,
}: {
  label: string;
  time: string;
  coords: Coords | null | undefined;
  /** Colour of the dot: green for a start, blue for an end, etc. */
  tone: { fg: string; bg: string };
}) {
  const { styles } = useCrmStyles(factory);
  const { place, looking } = usePlace(coords);
  const placeText = !coords ? 'Location not captured' : place ?? (looking ? 'Finding the place…' : `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: tone.bg }]}>
        <PinIcon size={15} color={tone.fg} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>
          {label} · <Text style={styles.time}>{time}</Text>
        </Text>
        <Text style={[styles.place, (!coords || (!place && looking)) && styles.placeMuted]} numberOfLines={2}>
          {placeText}
        </Text>
      </View>
      {coords ? (
        <Pressable
          onPress={() => Linking.openURL(mapsPoint(coords)).catch(() => {})}
          accessibilityRole="button"
          accessibilityLabel={`${label} location, open in Maps`}
          hitSlop={6}
          style={({ pressed }) => [styles.mapBtn, pressed && { opacity: 0.85 }]}
        >
          <ExternalLinkIcon size={13} color="#FFFFFF" />
          <Text style={styles.mapText}>Map</Text>
        </Pressable>
      ) : (
        <View style={styles.noGps}>
          <Text style={styles.noGpsText}>No GPS</Text>
        </View>
      )}
    </View>
  );
}

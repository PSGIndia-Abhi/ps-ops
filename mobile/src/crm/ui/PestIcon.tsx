import React from 'react';
import { Text } from 'react-native';

export type PestKind =
  | 'cockroach'
  | 'bedbug'
  | 'rodent'
  | 'mosquito'
  | 'ant'
  | 'general';

/** Picks an icon from the service name, so new services in the price list still get a sensible one. */
export function pestKind(service: string): PestKind {
  const s = service.toLowerCase();
  if (s.includes('cockroach') || s.includes('roach')) return 'cockroach';
  if (s.includes('bed')) return 'bedbug';
  if (/\b(rodents?|rats?|mice|mouse)\b/.test(s)) return 'rodent';
  if (s.includes('mosquito')) return 'mosquito';
  if (/\bants?\b|termite/.test(s)) return 'ant';
  return 'general';
}

/** A real, recognisable glyph per pest (not an abstract line drawing) - emoji render natively on
 * every Android device with no extra asset weight, unlike bundling actual photos would. */
const EMOJI: Record<PestKind, string> = {
  cockroach: '🪳',
  // No dedicated bedbug emoji exists - 🐛 renders as a green caterpillar (wrong shape, wrong
  // colour, easy to mistake for a different pest entirely). 🪲's small brown oval beetle shape
  // is a much closer visual match for an actual bedbug.
  bedbug: '🪲',
  rodent: '🐀',
  mosquito: '🦟',
  ant: '🐜',
  general: '🦗',
};

interface PestIconProps {
  service: string;
  size?: number;
  /** Kept for API compatibility with callers that tint other icons - emoji always render in
   * their own natural colour, so this has no effect here. */
  color?: string;
}

export function PestIcon({ service, size = 24 }: PestIconProps) {
  const kind = pestKind(service);
  return (
    <Text style={{ fontSize: size, lineHeight: size * 1.2 }}>{EMOJI[kind]}</Text>
  );
}

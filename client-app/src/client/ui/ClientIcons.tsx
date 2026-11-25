import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useCrmTheme } from '../../crm/theme';

/**
 * The client app's own icon set - two-tone glyphs drawn for BestServe (a soft fill under a deep
 * outline), in the spirit of Google Pay's custom icons rather than generic line icons.
 * All on a 24 x 24 artboard; `color` is the outline, `fill` the soft body.
 */

export const ICON_DEEP = '#0B57D0';
export const ICON_SOFT = '#A8C7FA';
export const TILE_BG = '#D3E3FD';

/** BestServe brand duotone (from the logo): deep navy outline, soft brand-red body. */
export const BRAND_NAVY = '#1F2A55';
export const BRAND_RED = '#C62835';
export const BRAND_RED_SOFT = '#FBCDD2';

type GlyphType = React.ComponentType<{ size?: number; color?: string; fill?: string }>;

/**
 * An icon in a round soft-blue circle - the glyph in deep blue with a soft blue body.
 * Dark mode: a faint blue circle with a light glyph.
 */
export function GlyphTile({ Icon, size = 64, iconSize }: { Icon: GlyphType; size?: number; iconSize?: number }) {
  const t = useCrmTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.isDark ? 'rgba(138,180,248,0.16)' : TILE_BG,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={iconSize ?? Math.round(size * 0.52)} color={t.isDark ? '#A8C7FA' : ICON_DEEP} fill={t.isDark ? 'rgba(168,199,250,0.35)' : ICON_SOFT} />
    </View>
  );
}

interface P {
  size?: number;
  color?: string;
  fill?: string;
}

const line = (color: string) => ({ stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' });

/** Book a service: a calendar with a sparkle. */
export function BookServiceGlyph({ size = 26, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.2" y="5" width="17.6" height="15.8" rx="3.2" fill={fill} />
      <Rect x="3.2" y="5" width="17.6" height="15.8" rx="3.2" {...line(color)} />
      <Path d="M3.5 9.6H20.5" {...line(color)} />
      <Path d="M8 3.2V6.4M16 3.2V6.4" {...line(color)} />
      <Path d="M12 11.6l.95 2.15 2.15.95-2.15.95L12 17.8l-.95-2.15-2.15-.95 2.15-.95z" fill={color} />
    </Svg>
  );
}

/** Raise a complaint: a speech bubble with "!". */
export function ComplaintGlyph({ size = 26, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  const d = 'M5.5 4h13A2.5 2.5 0 0 1 21 6.5v8.2a2.5 2.5 0 0 1-2.5 2.5H12l-4.6 3.4v-3.4H5.5A2.5 2.5 0 0 1 3 14.7V6.5A2.5 2.5 0 0 1 5.5 4z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={fill} />
      <Path d={d} {...line(color)} />
      <Path d="M12 7.8v3.6" {...line(color)} strokeWidth={2.1} />
      <Circle cx="12" cy="14.1" r="1.15" fill={color} />
    </Svg>
  );
}

/** Jobs: a clipboard with a tick. */
export function JobsGlyph({ size = 26, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4.6" y="4.2" width="14.8" height="17" rx="2.6" fill={fill} />
      <Rect x="4.6" y="4.2" width="14.8" height="17" rx="2.6" {...line(color)} />
      <Rect x="8.6" y="2.6" width="6.8" height="3.6" rx="1.3" fill={color} />
      <Path d="M8.6 13.4l2.3 2.3 4.6-4.8" {...line(color)} strokeWidth={2} />
    </Svg>
  );
}

/** Documents: two stacked sheets, the front one with a folded corner. */
export function DocumentsGlyph({ size = 26, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  const front = 'M7.5 6h7.2l3.8 3.8v10.4a1.8 1.8 0 0 1-1.8 1.8H7.5a1.8 1.8 0 0 1-1.8-1.8V7.8A1.8 1.8 0 0 1 7.5 6z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9.4 3.2h7.2a1.8 1.8 0 0 1 1.8 1.8" {...line(color)} opacity={0.55} />
      <Path d={front} fill={fill} />
      <Path d={front} {...line(color)} />
      <Path d="M14.6 6.2v3.7h3.7" {...line(color)} />
      <Path d="M8.8 14h6.2M8.8 17.4h4.2" {...line(color)} />
    </Svg>
  );
}

/** Audit reports: a shield with a tick. */
export function AuditGlyph({ size = 26, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  const d = 'M12 2.8l7.4 2.9v5.6c0 4.6-3.1 8.5-7.4 9.9-4.3-1.4-7.4-5.3-7.4-9.9V5.7z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={fill} />
      <Path d={d} {...line(color)} />
      <Path d="M8.7 12.1l2.3 2.3 4.4-4.6" {...line(color)} strokeWidth={2} />
    </Svg>
  );
}

/** Outlets: a storefront with an awning. */
export function OutletGlyph({ size = 26, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4.4" y="10" width="15.2" height="11" rx="1.6" fill={fill} />
      <Path d="M4.4 11v8.4A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.6-1.6V11" {...line(color)} />
      <Path d="M3 9.2L4.6 4h14.8L21 9.2a2.25 2.25 0 0 1-4.5 0 2.25 2.25 0 0 1-4.5 0 2.25 2.25 0 0 1-4.5 0A2.25 2.25 0 0 1 3 9.2z" fill={color} />
      <Path d="M10 21v-4.4a2 2 0 0 1 4 0V21" {...line(color)} />
    </Svg>
  );
}

/** Visits: a calendar with a clock badge. */
export function VisitsGlyph({ size = 26, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="2.8" y="4.6" width="15.4" height="14.6" rx="3" fill={fill} />
      <Path d="M18.2 9.4V7.6a3 3 0 0 0-3-3H5.8a3 3 0 0 0-3 3v8.6a3 3 0 0 0 3 3h4.4" {...line(color)} />
      <Path d="M3 9h15M7 3v3M14 3v3" {...line(color)} />
      <Circle cx="16.8" cy="16.6" r="4.6" fill="#FFFFFF" />
      <Circle cx="16.8" cy="16.6" r="4.6" {...line(color)} />
      <Path d="M16.8 14.4v2.4l1.6 1" {...line(color)} />
    </Svg>
  );
}

/** Support: a headset. */
export function SupportGlyph({ size = 26, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.5 13.5V12a7.5 7.5 0 0 1 15 0v1.5" {...line(color)} />
      <Rect x="3" y="12.4" width="4.6" height="6.6" rx="2" fill={fill} />
      <Rect x="3" y="12.4" width="4.6" height="6.6" rx="2" {...line(color)} />
      <Rect x="16.4" y="12.4" width="4.6" height="6.6" rx="2" fill={color} />
      <Path d="M18.7 19.4c0 1.4-1.6 2.3-4.4 2.3h-1.6" {...line(color)} />
    </Svg>
  );
}

/** Home tab: a house with a door. */
export function HomeGlyph({ size = 24, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  const d = 'M4 10.4L12 4l8 6.4V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={fill} />
      <Path d={d} {...line(color)} />
      <Path d="M9.8 21v-5.2a2.2 2.2 0 0 1 4.4 0V21" {...line(color)} />
    </Svg>
  );
}

/** More tab: four rounded squares. */
export function MoreGlyph({ size = 24, color = ICON_DEEP, fill = ICON_SOFT }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.5" y="3.5" width="7" height="7" rx="2.2" fill={fill} />
      <Rect x="3.5" y="3.5" width="7" height="7" rx="2.2" {...line(color)} />
      <Rect x="13.5" y="3.5" width="7" height="7" rx="2.2" {...line(color)} />
      <Rect x="3.5" y="13.5" width="7" height="7" rx="2.2" {...line(color)} />
      <Rect x="13.5" y="13.5" width="7" height="7" rx="3.5" fill={color} />
    </Svg>
  );
}

/** The search magnifier for the top pill. */
export function SearchGlyph({ size = 22, color = '#1F1F1F' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="10.5" cy="10.5" r="6.5" {...line(color)} strokeWidth={2.2} />
      <Path d="M15.5 15.5L20.5 20.5" {...line(color)} strokeWidth={2.4} />
    </Svg>
  );
}

/**
 * The Home banner illustration: a clean building, a BestServe shield with a tick in front of it,
 * a spray drop and a few sparkles - "your premises, protected".
 */
export function HeroArt({ width = 148, height = 118 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 148 118">
      {/* ground shadow */}
      <Rect x="18" y="106" width="118" height="6" rx="3" fill="#0B57D0" opacity={0.08} />
      {/* back tower */}
      <Rect x="70" y="18" width="46" height="90" rx="6" fill="#AECBFA" />
      {[0, 1, 2, 3, 4].map((r) => (
        <G key={`t${r}`}>
          <Rect x="78" y={28 + r * 15} width="10" height="8" rx="2" fill="#FFFFFF" opacity={0.85} />
          <Rect x="98" y={28 + r * 15} width="10" height="8" rx="2" fill="#FFFFFF" opacity={0.85} />
        </G>
      ))}
      {/* front block */}
      <Rect x="28" y="50" width="58" height="58" rx="6" fill="#D3E3FD" />
      <Path d="M28 56a6 6 0 0 1 6-6h46a6 6 0 0 1 6 6v6H28z" fill="#8AB4F8" />
      {[0, 1].map((r) => (
        <G key={`f${r}`}>
          <Rect x="36" y={70 + r * 16} width="11" height="9" rx="2" fill="#FFFFFF" />
          <Rect x="52" y={70 + r * 16} width="11" height="9" rx="2" fill="#FFFFFF" />
          <Rect x="68" y={70 + r * 16} width="11" height="9" rx="2" fill="#FFFFFF" />
        </G>
      ))}
      {/* shield */}
      <Path d="M112 52l20 7.5v14c0 11.5-8.4 21-20 24.5-11.6-3.5-20-13-20-24.5v-14z" fill="#1A73E8" />
      <Path d="M112 52l20 7.5v14c0 11.5-8.4 21-20 24.5z" fill="#0B57D0" opacity={0.35} />
      <Path d="M103 75.5l6.2 6.2 12-12.6" stroke="#FFFFFF" strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* spray drop */}
      <Path d="M22 30c4.6 6 7 9.8 7 13a7 7 0 0 1-14 0c0-3.2 2.4-7 7-13z" fill="#34A853" />
      <Path d="M19.4 43.2a3.2 3.2 0 0 0 2.6 2.6" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" fill="none" />
      {/* sparkles */}
      <Path d="M52 18l2.2 5 5 2.2-5 2.2L52 32.4l-2.2-5-5-2.2 5-2.2z" fill="#FBBC04" />
      <Path d="M138 30l1.4 3.1 3.1 1.4-3.1 1.4-1.4 3.1-1.4-3.1-3.1-1.4 3.1-1.4z" fill="#FBBC04" />
      <Circle cx="40" cy="40" r="2.4" fill="#8AB4F8" />
      <Circle cx="128" cy="16" r="2" fill="#8AB4F8" />
    </Svg>
  );
}

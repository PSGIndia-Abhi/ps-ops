import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Small hand-authored icon set (react-native-svg), grown as screens
 * actually need new glyphs - deliberately not a full icon-font library.
 * Every icon shares the same visual language: 24x24 viewBox, 1.8 stroke
 * weight, outline style, round line caps/joins.
 */

export function EyeIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function EyeOffIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 3l18 18M9.6 5.6C10.4 5.2 11.2 5 12 5c7 0 10.5 7 10.5 7-.6 1.1-1.6 2.6-3 4M6.6 6.9C4 8.7 1.5 12 1.5 12s3.5 7 10.5 7c1.4 0 2.6-.3 3.7-.7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.9 10.1a3.2 3.2 0 004.4 4.4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function WifiOffIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={2} y1={2} x2={22} y2={22} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path
        d="M8.5 16.5a5 5 0 017-.1M5 13a10 10 0 013.6-2.3M12 20h.01M19 13a10 10 0 00-1.5-1.4M15.5 8.8A14 14 0 0112 8c-.9 0-1.8.1-2.6.3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function EmailIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={5} width={19} height={14} rx={2.2} stroke={color} strokeWidth={1.8} />
      <Path
        d="M3.5 6.5l8.5 6.2 8.5-6.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LockIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={10.5} width={14} height={9.5} rx={2.2} stroke={color} strokeWidth={1.8} />
      <Path
        d="M7.8 10.5V7.6a4.2 4.2 0 018.4 0v2.9"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={15.1} r={1.15} fill={color} />
    </Svg>
  );
}

export function AlertCircleIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Line x1={12} y1={7.8} x2={12} y2={13} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={16.1} r={1} fill={color} />
    </Svg>
  );
}

export function CheckCircleIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path
        d="M8.2 12.3l2.4 2.4 5.2-5.4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HomeIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11.2L12 4l8 7.2V19a1.4 1.4 0 01-1.4 1.4h-3.2a.8.8 0 01-.8-.8v-4.4a1.6 1.6 0 00-1.6-1.6h-2a1.6 1.6 0 00-1.6 1.6v4.4a.8.8 0 01-.8.8H5.4A1.4 1.4 0 014 19v-7.8z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BriefcaseIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={7.5} width={18} height={12} rx={2} stroke={color} strokeWidth={1.8} />
      <Path
        d="M8.5 7.5V6a2 2 0 012-2h3a2 2 0 012 2v1.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={3} y1={12.5} x2={21} y2={12.5} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function CalendarIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={16} rx={2.2} stroke={color} strokeWidth={1.8} />
      <Line x1={3} y1={9.5} x2={21} y2={9.5} stroke={color} strokeWidth={1.8} />
      <Line x1={7.5} y1={3} x2={7.5} y2={6.5} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={16.5} y1={3} x2={16.5} y2={6.5} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function UsersIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8.2} r={3.2} stroke={color} strokeWidth={1.8} />
      <Path
        d="M3.2 19c.6-3 2.9-5 5.8-5s5.2 2 5.8 5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.3 5.3a3.2 3.2 0 010 5.9M17.7 19c-.4-2.1-1.5-3.7-3.1-4.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MoreHorizontalIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={1.6} fill={color} />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Circle cx={19} cy={12} r={1.6} fill={color} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5l7 7-7 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5l-7 7 7 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TagIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11.6 3.5h-5a1.5 1.5 0 00-1.06.44l-1.6 1.6A1.5 1.5 0 003.5 6.6v5c0 .4.16.78.44 1.06l8.4 8.4a1.5 1.5 0 002.12 0l6-6a1.5 1.5 0 000-2.12l-8.4-8.4a1.5 1.5 0 00-1.06-.44z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={8.5} cy={8.5} r={1.3} fill={color} />
    </Svg>
  );
}

export function PlayIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6.5 4.8v14.4a.9.9 0 001.36.77l11.5-7.2a.9.9 0 000-1.54l-11.5-7.2A.9.9 0 006.5 4.8z" fill={color} />
    </Svg>
  );
}

export function ExternalLinkIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.5 5H6.5A1.5 1.5 0 005 6.5v11A1.5 1.5 0 006.5 19h11a1.5 1.5 0 001.5-1.5v-3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.5 5H19v4.5M19 5l-8 8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PinIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s7-6.4 7-11.5A7 7 0 105 9.5C5 14.6 12 21 12 21z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={9.5} r={2.4} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function ClockIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 7v5.3l3.6 2.1"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PersonIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.2} r={3.6} stroke={color} strokeWidth={1.8} />
      <Path
        d="M4.8 19.4c.9-3.4 3.6-5.6 7.2-5.6s6.3 2.2 7.2 5.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SettingsIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 3.5v1.8M12 18.7v1.8M20.5 12h-1.8M5.3 12H3.5M17.8 6.2l-1.3 1.3M7.5 16.5l-1.3 1.3M17.8 17.8l-1.3-1.3M7.5 7.5L6.2 6.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** A solid/filled bell (not just an outline) - reads clearly at the small sizes the header actually uses it at, unlike a thin stroke. */
export function BellIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.3a1.3 1.3 0 011.3 1.3v.62a6.6 6.6 0 015.3 6.47v2.98c0 1.24.53 2.42 1.46 3.24l.1.1c.62.53.24 1.54-.57 1.54H4.41c-.81 0-1.19-1.01-.57-1.54l.1-.1a4.4 4.4 0 001.46-3.24v-2.98a6.6 6.6 0 015.3-6.47v-.62A1.3 1.3 0 0112 2.3z"
        fill={color}
      />
      <Path
        d="M9.4 19.7a2.7 2.7 0 005.2 0"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** A solid avatar glyph (head + shoulders, filled) - used as the header's profile entry point instead of initials text, and instead of a thin person outline. */
export function AvatarIcon({ size = 20, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.3} r={3.7} fill={color} />
      <Path
        d="M4.3 20.1C5.3 16.2 8.4 14 12 14s6.7 2.2 7.7 6.1a1.05 1.05 0 01-1.02 1.3H5.32a1.05 1.05 0 01-1.02-1.3z"
        fill={color}
      />
    </Svg>
  );
}

export function AlertTriangleIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4.2l9 15.6a1 1 0 01-.9 1.5H3.9a1 1 0 01-.9-1.5l9-15.6a1 1 0 011.7 0z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Line x1={12} y1={10} x2={12} y2={14} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={17} r={1} fill={color} />
    </Svg>
  );
}

export function CameraIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5A1.5 1.5 0 015.5 7h2l1-1.6A1.5 1.5 0 019.8 4.6h4.4a1.5 1.5 0 011.3.8L16.5 7h2A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.4} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function GalleryIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={16} rx={2.2} stroke={color} strokeWidth={1.8} />
      <Circle cx={8.2} cy={9} r={1.6} stroke={color} strokeWidth={1.8} />
      <Path
        d="M4 17l5-5 3.5 3.5L16 12l4.5 5.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CloseIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 5l14 14M19 5L5 19"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SendIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12l16-8-6 16-2.5-6.5L4 12z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function MenuIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={4} y1={7} x2={20} y2={7} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={4} y1={12} x2={20} y2={12} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={4} y1={17} x2={20} y2={17} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function ChartIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={4} y1={20} x2={20} y2={20} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Rect x={6} y={13} width={3.4} height={7} rx={1} fill={color} />
      <Rect x={10.3} y={8.5} width={3.4} height={11.5} rx={1} fill={color} />
      <Rect x={14.6} y={4} width={3.4} height={16} rx={1} fill={color} />
    </Svg>
  );
}

export function LogoutIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 4H6a1.5 1.5 0 00-1.5 1.5v13A1.5 1.5 0 006 20h3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15 16l4-4-4-4M19 12H9"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PhoneIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.5 4.5h3l1.5 4-2 1.5a11 11 0 006 6l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A16 16 0 014 6.1a1.5 1.5 0 011.5-1.6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function InboxIcon({ size = 40, color = '#9CA3AF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12.5L6.5 5h11L20 12.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 12.5h4.4l1.2 2.2h4.8l1.2-2.2H20V18a1.6 1.6 0 01-1.6 1.6H5.6A1.6 1.6 0 014 18v-5.5z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A filled sun - rayed circle, used on the Home greeting card only. */
export function SunIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={5} fill={color} />
      <Line x1={12} y1={1.5} x2={12} y2={4.3} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={12} y1={19.7} x2={12} y2={22.5} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={1.5} y1={12} x2={4.3} y2={12} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={19.7} y1={12} x2={22.5} y2={12} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={4.6} y1={4.6} x2={6.6} y2={6.6} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={17.4} y1={17.4} x2={19.4} y2={19.4} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={4.6} y1={19.4} x2={6.6} y2={17.4} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={17.4} y1={6.6} x2={19.4} y2={4.6} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** A plain "+" - the Technician tab bar's raised middle button glyph. */
export function PlusIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={12} y1={4} x2={12} y2={20} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={4} y1={12} x2={20} y2={12} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** A small 4-point sparkle/twinkle accent - used on illustrated empty states, not a functional glyph anywhere. */
export function SparkleIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5c.5 3.7 1.3 5.6 3 7.3 1.7 1.7 3.6 2.5 7.3 3-3.7.5-5.6 1.3-7.3 3-1.7 1.7-2.5 3.6-3 7.3-.5-3.7-1.3-5.6-3-7.3-1.7-1.7-3.6-2.5-7.3-3 3.7-.5 5.6-1.3 7.3-3 1.7-1.7 2.5-3.6 3-7.3z"
        fill={color}
      />
    </Svg>
  );
}

export function ShieldIcon({ size = 20, color = '#6B7280' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.5l7 2.6v5.4c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6.1l7-2.6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M8.7 12.2l2.3 2.3 4.3-4.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

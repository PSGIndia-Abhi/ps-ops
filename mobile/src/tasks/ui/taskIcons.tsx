import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Extra glyphs for Task Management, in the same outline style as components/icons.tsx. */
interface IconProps {
  size?: number;
  color?: string;
}

const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export function CheckIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke(color)} />
    </Svg>
  );
}

export function ArrowLeftIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M19 12H5M11 6l-6 6 6 6" {...stroke(color)} />
    </Svg>
  );
}

export function ArrowUpRightIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 17L17 7M8 7h9v9" {...stroke(color)} />
    </Svg>
  );
}

export function DotsIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={1.8} fill={color} />
      <Circle cx={12} cy={12} r={1.8} fill={color} />
      <Circle cx={19} cy={12} r={1.8} fill={color} />
    </Svg>
  );
}

export function ClipboardIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={4.5} width={14} height={16.5} rx={2.5} {...stroke(color)} />
      <Path d="M9 4.5V3.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8v.7M9 10h6M9 14h6M9 18h3" {...stroke(color)} />
    </Svg>
  );
}

export function RepeatIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4" {...stroke(color)} />
    </Svg>
  );
}

export function SearchIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={11} cy={11} r={6.5} {...stroke(color)} />
      <Path d="M20 20l-4.2-4.2" {...stroke(color)} />
    </Svg>
  );
}

export function FolderIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 7.5A2.5 2.5 0 015.5 5h3.6l2 2h7.4A2.5 2.5 0 0121 9.5v8a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5v-10z" {...stroke(color)} />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 9l6 6 6-6" {...stroke(color)} />
    </Svg>
  );
}

export function PaperclipIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20.5 11.5l-8.3 8.3a5 5 0 01-7-7l8.6-8.7a3.4 3.4 0 014.8 4.8l-8.6 8.7a1.7 1.7 0 01-2.4-2.4l7.9-7.9" {...stroke(color)} />
    </Svg>
  );
}

export function HistoryIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 12a9 9 0 103-6.7L3 8M3 3v5h5M12 7.5V12l3 2" {...stroke(color)} />
    </Svg>
  );
}

export function MessageIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 15a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2h12a2 2 0 012 2v9z" {...stroke(color)} />
    </Svg>
  );
}

export function TrashIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" {...stroke(color)} />
    </Svg>
  );
}

export function EditIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4" {...stroke(color)} />
    </Svg>
  );
}

export function SwapIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16" {...stroke(color)} />
    </Svg>
  );
}

export function SkipIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 5l9 7-9 7V5zM19 5v14" {...stroke(color)} />
    </Svg>
  );
}

export function BanIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...stroke(color)} />
      <Path d="M5.6 5.6l12.8 12.8" {...stroke(color)} />
    </Svg>
  );
}

export function MoonIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" {...stroke(color)} />
    </Svg>
  );
}

export function SunsetIcon({ size = 20, color = '#141416' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M17 18a5 5 0 00-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4" {...stroke(color)} />
    </Svg>
  );
}

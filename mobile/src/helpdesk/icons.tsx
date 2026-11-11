import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

/** Question mark in a circle - "Help & Support". */
export function HelpCircleIcon({ size = 20, color = '#2563EB' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.25} stroke={color} strokeWidth={1.8} />
      <Path d="M9.4 9.3a2.7 2.7 0 015.2 1c0 1.8-2.6 2.4-2.6 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={17.3} r={1.05} fill={color} />
    </Svg>
  );
}

/** Lifebuoy - the technical team's "Helpdesk desk". */
export function LifeBuoyIcon({ size = 20, color = '#2563EB' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.25} stroke={color} strokeWidth={1.8} />
      <Circle cx={12} cy={12} r={3.8} stroke={color} strokeWidth={1.8} />
      <Path d="M5.5 5.5l3.8 3.8M14.7 14.7l3.8 3.8M18.5 5.5l-3.8 3.8M9.3 14.7l-3.8 3.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Paperclip - attach in the chat. */
export function PaperclipIcon({ size = 20, color = '#64748B' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.4 11.6l-8.3 8.3a5.4 5.4 0 01-7.6-7.6l8.3-8.3a3.6 3.6 0 015.1 5.1l-8.3 8.3a1.8 1.8 0 01-2.6-2.6l7.7-7.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Padlock - internal note. */
export function NoteLockIcon({ size = 14, color = '#B45309' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 11h12v9H6z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Path d="M8.5 11V8a3.5 3.5 0 017 0v3" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** Person with a plus - "Pick up". */
export function UserPlusIcon({ size = 18, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9.5} cy={8} r={3.6} stroke={color} strokeWidth={2} />
      <Path d="M3 19.5c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M19 8v6M16 11h6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Speech bubble with a question mark - "Ask user". */
export function AskIcon({ size = 18, color = '#334155' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20.5 11.5a8 8 0 01-11.8 7L4 19.8l1.3-4.4A8 8 0 1120.5 11.5z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Path d="M10.2 9.4a2 2 0 013.8.8c0 1.3-1.9 1.7-1.9 2.9" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Circle cx={12.1} cy={15.4} r={0.95} fill={color} />
    </Svg>
  );
}

/** Check in a circle - "Resolve". */
export function ResolveIcon({ size = 18, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M8 12.3l2.7 2.7L16.2 9.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Flag - priority. */
export function FlagIcon({ size = 14, color = '#64748B' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 21V4.5M5 4.5c4-2 7 2 11 0v9c-4 2-7-2-11 0" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Circular arrow - "Reopen". */
export function ReopenIcon({ size = 18, color = '#2563EB' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 4v4.6h4.6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

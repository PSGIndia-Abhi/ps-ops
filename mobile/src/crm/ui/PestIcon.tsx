import React from 'react';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';

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

interface PestIconProps {
  service: string;
  size?: number;
  color?: string;
}

const STROKE = 1.7;

function Legs({
  color,
  ys,
  reach,
}: {
  color: string;
  ys: number[];
  reach: number;
}) {
  return (
    <>
      {ys.map((y, i) => (
        <React.Fragment key={y}>
          <Path
            d={`M8.6 ${y} L${8.6 - reach} ${y + (i - 1) * 2.2}`}
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <Path
            d={`M15.4 ${y} L${15.4 + reach} ${y + (i - 1) * 2.2}`}
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        </React.Fragment>
      ))}
    </>
  );
}

/** Line-art pest glyphs (24x24, round caps) in the same style as the rest of the CRM icons. */
export function PestIcon({
  service,
  size = 24,
  color = '#6B7280',
}: PestIconProps) {
  const kind = pestKind(service);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {kind === 'cockroach' && (
        <>
          <Ellipse
            cx={12}
            cy={14}
            rx={4}
            ry={6.2}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Path
            d="M12 8.2V20"
            stroke={color}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <Circle
            cx={12}
            cy={6.4}
            r={1.7}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Path
            d="M11 5 L8.2 2.4 M13 5 L15.8 2.4"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <Legs color={color} ys={[11, 14, 17.5]} reach={3.6} />
        </>
      )}

      {kind === 'bedbug' && (
        <>
          <Circle cx={12} cy={14} r={5.2} stroke={color} strokeWidth={STROKE} />
          <Circle
            cx={12}
            cy={6.8}
            r={1.9}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Circle cx={10.2} cy={13} r={0.9} fill={color} />
          <Circle cx={13.8} cy={13} r={0.9} fill={color} />
          <Circle cx={12} cy={16.4} r={0.9} fill={color} />
          <Path
            d="M11 5.2 L9.4 3.2 M13 5.2 L14.6 3.2"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <Legs color={color} ys={[11.6, 14, 16.6]} reach={3.4} />
        </>
      )}

      {kind === 'rodent' && (
        <>
          <Ellipse
            cx={11.5}
            cy={14}
            rx={6.4}
            ry={4.6}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Circle
            cx={16.4}
            cy={9.2}
            r={2.4}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Circle cx={18.6} cy={13.6} r={0.9} fill={color} />
          <Circle cx={15.4} cy={13} r={0.8} fill={color} />
          <Path
            d="M5.2 15.2 C2.6 15.6 2.2 19.6 6 20"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <Path
            d="M9 18.6 V20.6 M14 18.6 V20.6"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        </>
      )}

      {kind === 'mosquito' && (
        <>
          <Circle
            cx={12}
            cy={7.4}
            r={1.6}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Path
            d="M12 5.8 V2.4"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <Path
            d="M12 9 V17"
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <Path
            d="M12 10.4 C8 5.8 3.8 8.4 5.6 11.6 C7 13.6 10.4 12.8 12 10.4 Z"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinejoin="round"
          />
          <Path
            d="M12 10.4 C16 5.8 20.2 8.4 18.4 11.6 C17 13.6 13.6 12.8 12 10.4 Z"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinejoin="round"
          />
          <Path
            d="M12 13 L8 17.6 M12 14 L16 18.6 M12 15.4 L10 21 M12 15.4 L14 21"
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </>
      )}

      {kind === 'ant' && (
        <>
          <Circle cx={12} cy={5.6} r={2} stroke={color} strokeWidth={STROKE} />
          <Circle
            cx={12}
            cy={11.2}
            r={2.1}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Ellipse
            cx={12}
            cy={17.6}
            rx={3.1}
            ry={3.6}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Path
            d="M11 3.9 L8.6 2 M13 3.9 L15.4 2"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <Legs color={color} ys={[10, 12, 14.6]} reach={3.6} />
        </>
      )}

      {kind === 'general' && (
        <>
          <Ellipse
            cx={12}
            cy={14}
            rx={4.6}
            ry={5.6}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Line
            x1={12}
            y1={8.6}
            x2={12}
            y2={19.6}
            stroke={color}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <Circle
            cx={12}
            cy={6.4}
            r={1.7}
            stroke={color}
            strokeWidth={STROKE}
          />
          <Path
            d="M11 5 L9 3 M13 5 L15 3"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <Legs color={color} ys={[11.5, 14.5, 17.5]} reach={3.4} />
        </>
      )}
    </Svg>
  );
}

import React from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * BestServe's illustrated ("soft 3D") icon set - gradients, a gloss highlight and a soft ground
 * shadow, drawn in code so they stay sharp, tiny and fully ours. 64 x 64 artboard.
 */

interface ArtProps {
  size?: number;
}

/** Book a service: a calendar with a blue band, rings, date grid and a green tick badge. */
export function BookServiceArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="bsBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E3ECFB" />
        </LinearGradient>
        <LinearGradient id="bsBand" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5B9BFF" />
          <Stop offset="1" stopColor="#1A56D6" />
        </LinearGradient>
        <LinearGradient id="bsRing" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4B5675" />
          <Stop offset="1" stopColor="#1F2A44" />
        </LinearGradient>
        <LinearGradient id="bsBadge" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4ADE80" />
          <Stop offset="1" stopColor="#0E9F5A" />
        </LinearGradient>
      </Defs>
      {/* ground shadow */}
      <Ellipse cx="31" cy="58.5" rx="20" ry="3" fill="#1A3A7A" opacity={0.16} />
      {/* body */}
      <Rect x="8" y="12" width="46" height="42" rx="10" fill="url(#bsBody)" />
      <Rect x="8" y="12" width="46" height="42" rx="10" fill="none" stroke="#C9D8F2" strokeWidth={1} />
      {/* blue band */}
      <Path d="M18 12h26a10 10 0 0 1 10 10v3H8v-3a10 10 0 0 1 10-10z" fill="url(#bsBand)" />
      {/* gloss on the band */}
      <Path d="M18 13.5h26a8.5 8.5 0 0 1 8 5.6c-9 1.6-30 1.6-41.4.2A8.5 8.5 0 0 1 18 13.5z" fill="#FFFFFF" opacity={0.28} />
      {/* rings */}
      <Rect x="19" y="7" width="5" height="11" rx="2.5" fill="url(#bsRing)" />
      <Rect x="38" y="7" width="5" height="11" rx="2.5" fill="url(#bsRing)" />
      <Rect x="20" y="8" width="1.6" height="5" rx="0.8" fill="#FFFFFF" opacity={0.35} />
      <Rect x="39" y="8" width="1.6" height="5" rx="0.8" fill="#FFFFFF" opacity={0.35} />
      {/* date grid */}
      <G fill="#BFD0EE">
        <Rect x="15" y="31" width="7" height="6" rx="2" />
        <Rect x="25.5" y="31" width="7" height="6" rx="2" />
        <Rect x="36" y="31" width="7" height="6" rx="2" />
        <Rect x="15" y="40.5" width="7" height="6" rx="2" />
        <Rect x="25.5" y="40.5" width="7" height="6" rx="2" />
      </G>
      <Rect x="36" y="31" width="7" height="6" rx="2" fill="#5B9BFF" />
      {/* tick badge */}
      <Circle cx="47" cy="47" r="11" fill="#FFFFFF" />
      <Circle cx="47" cy="47" r="9" fill="url(#bsBadge)" />
      <Path d="M42.6 47.2l3 2.9 5.6-5.8" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M40.5 42.5a8 8 0 0 1 6-3.5" fill="none" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" opacity={0.5} />
    </Svg>
  );
}

/** Complaints: a glossy orange speech bubble with "!", a soft lilac bubble behind it. */
export function ComplaintArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="cpBack" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E9DDFF" />
          <Stop offset="1" stopColor="#C4B0F5" />
        </LinearGradient>
        <LinearGradient id="cpFront" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFB547" />
          <Stop offset="1" stopColor="#F05A28" />
        </LinearGradient>
      </Defs>
      {/* ground shadow */}
      <Ellipse cx="30" cy="58.5" rx="19" ry="3" fill="#7A2E10" opacity={0.14} />
      {/* back bubble */}
      <Path d="M30 6h18a10 10 0 0 1 10 10v10a10 10 0 0 1-10 10h-1v6l-7-6H30a10 10 0 0 1-10-10V16A10 10 0 0 1 30 6z" fill="url(#cpBack)" />
      <G fill="#FFFFFF" opacity={0.85}>
        <Circle cx="34" cy="21" r="2" />
        <Circle cx="41" cy="21" r="2" />
        <Circle cx="48" cy="21" r="2" />
      </G>
      {/* front bubble */}
      <Path d="M14 18h22a10 10 0 0 1 10 10v12a10 10 0 0 1-10 10H24l-9 7.5c-.8.6-1.9 0-1.9-1V50A10 10 0 0 1 4 40V28a10 10 0 0 1 10-10z" fill="url(#cpFront)" />
      {/* gloss */}
      <Path d="M14 20h22a8 8 0 0 1 7.7 5.8C33 28 18 28 6.6 26.3A8 8 0 0 1 14 20z" fill="#FFFFFF" opacity={0.3} />
      {/* ! */}
      <Rect x="22.6" y="27" width="5" height="12" rx="2.5" fill="#FFFFFF" />
      <Circle cx="25.1" cy="43.6" r="2.8" fill="#FFFFFF" />
    </Svg>
  );
}

/** Jobs: a green clipboard with a white sheet, checklist ticks and a dark clip. */
export function JobsArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="jbBoard" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3DDBA6" />
          <Stop offset="1" stopColor="#0C9466" />
        </LinearGradient>
        <LinearGradient id="jbPaper" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E8F6F0" />
        </LinearGradient>
        <LinearGradient id="jbClip" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4B5675" />
          <Stop offset="1" stopColor="#1F2A44" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="58.5" rx="18" ry="3" fill="#0C5A3E" opacity={0.15} />
      <Rect x="11" y="9" width="42" height="47" rx="9" fill="url(#jbBoard)" />
      <Path d="M20 10h24a8 8 0 0 1 8 6.5C40 18 25 18 12.4 16.7A8 8 0 0 1 20 10z" fill="#FFFFFF" opacity={0.25} />
      <Rect x="16" y="15" width="32" height="36" rx="5" fill="url(#jbPaper)" />
      <Rect x="23" y="5.5" width="18" height="9" rx="4.5" fill="url(#jbClip)" />
      <Rect x="25.5" y="7" width="7" height="2" rx="1" fill="#FFFFFF" opacity={0.35} />
      <Circle cx="23" cy="25" r="3.2" fill="#12B07A" />
      <Path d="M21.5 25.1l1.1 1.1 2-2.1" fill="none" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="29" y="23.5" width="13" height="3" rx="1.5" fill="#BFD6CC" />
      <Circle cx="23" cy="34" r="3.2" fill="#12B07A" />
      <Path d="M21.5 34.1l1.1 1.1 2-2.1" fill="none" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="29" y="32.5" width="13" height="3" rx="1.5" fill="#BFD6CC" />
      <Circle cx="23" cy="43" r="3.2" fill="none" stroke="#BFD6CC" strokeWidth={1.6} />
      <Rect x="29" y="41.5" width="9" height="3" rx="1.5" fill="#BFD6CC" />
    </Svg>
  );
}

/** Documents: a blue sheet behind a white sheet with a folded corner and a red tag. */
export function DocumentsArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="dcBack" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8DB8FF" />
          <Stop offset="1" stopColor="#3D74E0" />
        </LinearGradient>
        <LinearGradient id="dcFront" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E4ECFA" />
        </LinearGradient>
        <LinearGradient id="dcTag" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF7A7A" />
          <Stop offset="1" stopColor="#D93025" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="58.5" rx="18" ry="3" fill="#1A3A7A" opacity={0.15} />
      <Rect x="22" y="6" width="32" height="40" rx="6" fill="url(#dcBack)" transform="rotate(8 38 26)" />
      <Path d="M14 12h20l12 12v26a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6z" fill="url(#dcFront)" />
      <Path d="M34 12v8a4 4 0 0 0 4 4h8z" fill="#C9D8F2" />
      <Rect x="14" y="29" width="22" height="3" rx="1.5" fill="#C3D2EC" />
      <Rect x="14" y="36" width="26" height="3" rx="1.5" fill="#C3D2EC" />
      <Rect x="14" y="43" width="16" height="3" rx="1.5" fill="#C3D2EC" />
      <Rect x="13" y="17" width="15" height="7" rx="2.5" fill="url(#dcTag)" />
      <Rect x="15.5" y="19.6" width="10" height="1.8" rx="0.9" fill="#FFFFFF" opacity={0.9} />
    </Svg>
  );
}

/** Audit reports: a glossy purple shield with a white tick and a small gold star. */
export function AuditArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="auShield" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9D8CFF" />
          <Stop offset="1" stopColor="#5532D6" />
        </LinearGradient>
        <LinearGradient id="auStar" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFD976" />
          <Stop offset="1" stopColor="#F2A100" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="31" cy="58.5" rx="17" ry="3" fill="#2E1A80" opacity={0.16} />
      <Path d="M31 5l20 7.5v14.8c0 12.4-8.4 22.8-20 26.7C19.4 50.1 11 39.7 11 27.3V12.5z" fill="url(#auShield)" />
      <Path d="M31 8.2l17 6.4v4.6c-9 3.2-24 3.3-34 .2v-4.8z" fill="#FFFFFF" opacity={0.22} />
      <Path d="M22.5 29.5l6 5.8 11-11.5" fill="none" stroke="#FFFFFF" strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="48" cy="45" r="9.5" fill="#FFFFFF" />
      <Path d="M48 38.6l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="url(#auStar)" />
    </Svg>
  );
}

/** Outlets: a shopfront with a red-and-white striped awning, a blue door and a window. */
export function OutletArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="otBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E3EAF6" />
        </LinearGradient>
        <LinearGradient id="otDoor" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5B9BFF" />
          <Stop offset="1" stopColor="#1A56D6" />
        </LinearGradient>
        <LinearGradient id="otRoof" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4B5675" />
          <Stop offset="1" stopColor="#2A3552" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="58.5" rx="22" ry="3" fill="#1A3A7A" opacity={0.15} />
      <Rect x="10" y="24" width="44" height="32" rx="4" fill="url(#otBody)" />
      <Rect x="10" y="24" width="44" height="32" rx="4" fill="none" stroke="#C9D8F2" strokeWidth={1} />
      <Rect x="8" y="10" width="48" height="7" rx="3" fill="url(#otRoof)" />
      <Path d="M8 17h8v6a4 4 0 0 1-8 0z" fill="#F0503C" />
      <Path d="M16 17h8v6a4 4 0 0 1-8 0z" fill="#FFFFFF" />
      <Path d="M24 17h8v6a4 4 0 0 1-8 0z" fill="#F0503C" />
      <Path d="M32 17h8v6a4 4 0 0 1-8 0z" fill="#FFFFFF" />
      <Path d="M40 17h8v6a4 4 0 0 1-8 0z" fill="#F0503C" />
      <Path d="M48 17h8v6a4 4 0 0 1-8 0z" fill="#FFFFFF" />
      <Rect x="16" y="33" width="14" height="23" rx="3" fill="url(#otDoor)" />
      <Circle cx="27" cy="45" r="1.2" fill="#FFFFFF" />
      <Rect x="35" y="33" width="13" height="11" rx="3" fill="#BFD6FB" />
      <Path d="M36.5 35.5l4-1.5" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
    </Svg>
  );
}

/** Visits: a teal calendar with an orange-ringed clock in front. */
export function VisitsArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="vsBand" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3CD6C2" />
          <Stop offset="1" stopColor="#0E8C7B" />
        </LinearGradient>
        <LinearGradient id="vsBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E3F2EF" />
        </LinearGradient>
        <LinearGradient id="vsRing" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFB547" />
          <Stop offset="1" stopColor="#F05A28" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="58.5" rx="20" ry="3" fill="#0E5A50" opacity={0.15} />
      <Rect x="6" y="10" width="40" height="38" rx="9" fill="url(#vsBody)" />
      <Path d="M15 10h22a9 9 0 0 1 9 9v3H6v-3a9 9 0 0 1 9-9z" fill="url(#vsBand)" />
      <Path d="M15 11.5h22a7.5 7.5 0 0 1 7.2 5.2c-8 1.4-26 1.4-36.4.1A7.5 7.5 0 0 1 15 11.5z" fill="#FFFFFF" opacity={0.28} />
      <Rect x="14" y="5.5" width="4.5" height="10" rx="2.25" fill="#2A3552" />
      <Rect x="33.5" y="5.5" width="4.5" height="10" rx="2.25" fill="#2A3552" />
      <G fill="#BFDDD7">
        <Rect x="12" y="28" width="6" height="5" rx="1.8" />
        <Rect x="21" y="28" width="6" height="5" rx="1.8" />
        <Rect x="12" y="36.5" width="6" height="5" rx="1.8" />
      </G>
      <Circle cx="44" cy="42" r="15" fill="#FFFFFF" />
      <Circle cx="44" cy="42" r="12.5" fill="url(#vsRing)" />
      <Circle cx="44" cy="42" r="9.3" fill="#FFFFFF" />
      <Path d="M44 36.5V42l3.8 2.6" fill="none" stroke="#2A3552" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="44" cy="42" r="1.3" fill="#2A3552" />
    </Svg>
  );
}

/** Support: a headset with blue ear cups, a dark band and a mic with a green tip. */
export function SupportArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="spCup" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5B9BFF" />
          <Stop offset="1" stopColor="#1A56D6" />
        </LinearGradient>
        <LinearGradient id="spBand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5A6688" />
          <Stop offset="1" stopColor="#1F2A44" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="58.5" rx="18" ry="3" fill="#1A3A7A" opacity={0.15} />
      <Path d="M12 34v-4a20 20 0 0 1 40 0v4" fill="none" stroke="url(#spBand)" strokeWidth={5} strokeLinecap="round" />
      <Rect x="7" y="30" width="13" height="20" rx="6.5" fill="url(#spCup)" />
      <Rect x="44" y="30" width="13" height="20" rx="6.5" fill="url(#spCup)" />
      <Rect x="9.5" y="32.5" width="3.5" height="9" rx="1.75" fill="#FFFFFF" opacity={0.35} />
      <Rect x="46.5" y="32.5" width="3.5" height="9" rx="1.75" fill="#FFFFFF" opacity={0.35} />
      <Path d="M50 49c0 4.5-4 7-10 7h-4" fill="none" stroke="#2A3552" strokeWidth={2.6} strokeLinecap="round" />
      <Rect x="28" y="52.5" width="10" height="6.5" rx="3.25" fill="#16B575" />
      <Rect x="29.5" y="53.6" width="4" height="1.6" rx="0.8" fill="#FFFFFF" opacity={0.45} />
    </Svg>
  );
}

/** Invoices: a white receipt with a zig-zag edge and an orange rupee badge. */
export function InvoiceArt({ size = 48 }: ArtProps) {
  const receipt = 'M12 8h30a4 4 0 0 1 4 4v42l-4.3-3-4.3 3-4.3-3-4.3 3-4.3-3-4.3 3-4.3-3-4.2 3V12a4 4 0 0 1 4-4z';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="ivPaper" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E6EDF9" />
        </LinearGradient>
        <LinearGradient id="ivBadge" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFB547" />
          <Stop offset="1" stopColor="#E37400" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="30" cy="58.5" rx="17" ry="3" fill="#1A3A7A" opacity={0.15} />
      <Path d={receipt} fill="url(#ivPaper)" />
      <Path d={receipt} fill="none" stroke="#C9D8F2" strokeWidth={1} />
      <Rect x="14" y="16" width="16" height="3.2" rx="1.6" fill="#1A56D6" />
      <Rect x="14" y="24" width="24" height="2.6" rx="1.3" fill="#C3D2EC" />
      <Rect x="14" y="30" width="20" height="2.6" rx="1.3" fill="#C3D2EC" />
      <Rect x="14" y="36" width="24" height="2.6" rx="1.3" fill="#C3D2EC" />
      <Circle cx="45" cy="44" r="11" fill="#FFFFFF" />
      <Circle cx="45" cy="44" r="9" fill="url(#ivBadge)" />
      <Path d="M41.2 39.5h7.6M41.2 42.6h7.6M43.6 39.5c2.7 0 4.2 1.3 4.2 3.1s-1.6 3.1-4.2 3.1h-1.6l5 4.4" fill="none" stroke="#FFFFFF" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Certificates: a certificate with a gold seal and red ribbons. */
export function CertificateArt({ size = 48 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="ctPaper" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#ECEBFA" />
        </LinearGradient>
        <LinearGradient id="ctSeal" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFD976" />
          <Stop offset="1" stopColor="#E89A00" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="58.5" rx="20" ry="3" fill="#2E1A80" opacity={0.14} />
      <Rect x="6" y="10" width="52" height="36" rx="6" fill="url(#ctPaper)" />
      <Rect x="10" y="14" width="44" height="28" rx="3.5" fill="none" stroke="#B9AEF0" strokeWidth={1.4} />
      <Rect x="16" y="20" width="24" height="3.2" rx="1.6" fill="#7B61E8" />
      <Rect x="16" y="27" width="18" height="2.6" rx="1.3" fill="#CFC8F2" />
      <Rect x="16" y="32.5" width="14" height="2.6" rx="1.3" fill="#CFC8F2" />
      <Path d="M40 44l-3 12 5-3 3 4 2-12z" fill="#E5484D" />
      <Path d="M50 44l3 12-5-3-3 4-2-12z" fill="#C22A35" />
      <Circle cx="45" cy="40" r="8.5" fill="url(#ctSeal)" />
      <Circle cx="45" cy="40" r="5.5" fill="none" stroke="#FFFFFF" strokeWidth={1.4} opacity={0.75} />
    </Svg>
  );
}

/**
 * Home hero illustration in the illustrated style: gradient buildings with lit windows, a glossy
 * blue shield with a tick, a green leaf drop and gold sparkles, on a soft ground shadow.
 */
export function HomeHeroArt({ width = 148, height = 120 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 148 120">
      <Defs>
        <LinearGradient id="hhTower" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B9D3FF" />
          <Stop offset="1" stopColor="#7FA8F2" />
        </LinearGradient>
        <LinearGradient id="hhBlock" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#DCE7FB" />
        </LinearGradient>
        <LinearGradient id="hhRoof" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5B9BFF" />
          <Stop offset="1" stopColor="#1A56D6" />
        </LinearGradient>
        <LinearGradient id="hhShield" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4C8DFF" />
          <Stop offset="1" stopColor="#0B47C2" />
        </LinearGradient>
        <LinearGradient id="hhLeaf" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5BE38F" />
          <Stop offset="1" stopColor="#0E9F5A" />
        </LinearGradient>
        <LinearGradient id="hhGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE07A" />
          <Stop offset="1" stopColor="#F2A100" />
        </LinearGradient>
      </Defs>
      {/* ground shadow */}
      <Ellipse cx="80" cy="111" rx="62" ry="5" fill="#1A3A7A" opacity={0.12} />
      {/* back tower */}
      <Rect x="70" y="16" width="46" height="94" rx="8" fill="url(#hhTower)" />
      <Path d="M78 16h30a8 8 0 0 1 8 8v4c-12 2-34 2-46 0v-4a8 8 0 0 1 8-8z" fill="#FFFFFF" opacity={0.25} />
      {[0, 1, 2, 3, 4].map((r) => (
        <G key={`t${r}`}>
          <Rect x="79" y={30 + r * 15} width="10" height="8" rx="2.2" fill="#FFFFFF" opacity={r === 1 ? 1 : 0.8} />
          <Rect x="97" y={30 + r * 15} width="10" height="8" rx="2.2" fill={r === 2 ? '#FFE9A8' : '#FFFFFF'} opacity={0.85} />
        </G>
      ))}
      {/* front block */}
      <Rect x="26" y="50" width="60" height="60" rx="8" fill="url(#hhBlock)" />
      <Rect x="26" y="50" width="60" height="60" rx="8" fill="none" stroke="#C3D5F5" strokeWidth={1} />
      <Path d="M34 50h44a8 8 0 0 1 8 8v5H26v-5a8 8 0 0 1 8-8z" fill="url(#hhRoof)" />
      <Path d="M34 51.5h44a6.5 6.5 0 0 1 6.3 5c-12 1.6-38 1.6-56.6.1A6.5 6.5 0 0 1 34 51.5z" fill="#FFFFFF" opacity={0.3} />
      {[0, 1].map((r) => (
        <G key={`f${r}`}>
          <Rect x="34" y={71 + r * 16} width="12" height="9" rx="2.4" fill={r === 0 ? '#BFD6FB' : '#D7E5FC'} />
          <Rect x="50" y={71 + r * 16} width="12" height="9" rx="2.4" fill={r === 1 ? '#FFE9A8' : '#BFD6FB'} />
          <Rect x="66" y={71 + r * 16} width="12" height="9" rx="2.4" fill="#BFD6FB" />
        </G>
      ))}
      {/* shield */}
      <Path d="M114 50l21 8v14.5c0 12-8.8 22-21 25.5-12.2-3.5-21-13.5-21-25.5V58z" fill="#FFFFFF" />
      <Path d="M114 54l17.5 6.6v11.9c0 10-7.3 18.3-17.5 21.4-10.2-3.1-17.5-11.4-17.5-21.4V60.6z" fill="url(#hhShield)" />
      <Path d="M114 56.5l15 5.6v3.6c-8 2.6-22 2.6-30 .1v-3.7z" fill="#FFFFFF" opacity={0.25} />
      <Path d="M106 74.5l5.6 5.6 10.8-11.4" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* leaf drop */}
      <Path d="M20 26c5.4 7 8.2 11.4 8.2 15.2a8.2 8.2 0 0 1-16.4 0c0-3.8 2.8-8.2 8.2-15.2z" fill="url(#hhLeaf)" />
      <Path d="M16.8 42a3.8 3.8 0 0 0 3 3" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" fill="none" opacity={0.8} />
      {/* sparkles */}
      <Path d="M50 14l2.4 5.4 5.4 2.4-5.4 2.4L50 29.6l-2.4-5.4-5.4-2.4 5.4-2.4z" fill="url(#hhGold)" />
      <Path d="M139 30l1.5 3.3 3.3 1.5-3.3 1.5-1.5 3.3-1.5-3.3-3.3-1.5 3.3-1.5z" fill="url(#hhGold)" />
      <Circle cx="38" cy="38" r="2.4" fill="#8AB4F8" />
      <Circle cx="128" cy="14" r="2.2" fill="#B9A6FF" />
    </Svg>
  );
}

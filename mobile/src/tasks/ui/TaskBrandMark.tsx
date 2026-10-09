import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

/**
 * Task Management's logo - the contents of mobile/assets/pslogo1.svg, inlined
 * so no Metro/SVG transformer is needed. The file's CSS classes are written as
 * plain attributes, since react-native-svg doesn't apply <style> classes.
 */
const LOGO_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 610.2 934.54">
  <path fill="#ee1c4e" d="M531.54,288.4h8.34l-.28-54.66h-11.31c0,1.02,2.02,7.34-1.8,7.34-7.3,0-44.3-5.96-51.21-6.48-14.55-1.11-29.3.93-36.3,2.38-5.12,1.06-42.42,9.17-62.6,32.27-30.79,35.23-15.38,96.16-8.9,108.14,19.01,35.17,44.55,57.56,68.45,76.07,62.47,48.41,63.01,143.51.47,191.84-88.19,68.14-229.17,50.85-306.66-24.3-29.43-28.54-52-68-62.92-120.59-24.54-118.23,44.02-228.36,149.59-266.67v190.94c0,.37.3.66.66.66h40.64c.37,0,.66-.3.66-.66v-199.96c21.48-2.42,40.04-4.4,57.65-5.75,17.37-1.4,29.79-1.56,45.8-4.8,33.15-7.76,71.67-22.12,94.51-59.73,12.41-21.35,15.73-48.28,8.42-71.86C448.71,30.79,389.96,9.52,340.88,1.8c-8.42-1.33-16.94-1.88-25.46-1.79-41.38.45-150.07,5.01-150.07,5.01,0,0-7.42,11.98-7.42,11.98-2.3,3.72.49,8.49,4.86,8.29,12.25-.57,33.58-1.54,53.6-2.33-.13,45.96-.07,101.52-.17,149.74-.16,12.81.06,26.97.06,35.93-3.83,4.09-17.48,6.96-24.51,9.65-11.3,4.3-25.41,8.33-37.39,13.48-58.35,25.36-94.95,59.34-121.08,118.16-81.71,180.59,75.56,349.57,256.07,354.3h0c143.9-1.46,256.56-58.72,278.16-138.84,4.75-17.61,8.24-48.01-2.88-79.32-31.55-88.81-135.85-89.87-158.56-162.43-6.87-21.94-.44-54.62,21.34-70.08,19.26-13.66,41.89-11.74,46.11-11.19,38.93,5.07,56.7,43.14,58,46.03ZM258.36,21.65c.72-.02,1.4-.02,2.01-.02,111.23,0,156.54,37.96,156.54,89.93s-63.63,82.5-80.3,88.5c-11.35,4.09-43.77,6.96-78.25,8.57V21.65Z"/>
  <text fill="#424491" fontFamily="Arial" fontSize="167.23" fontWeight="700" textAnchor="middle" letterSpacing="-3.34" x="305.1" y="0" transform="translate(0 871.59)">GROUP</text>
</svg>`;

/** Task Management's logo, at the same height as the old one. The art is portrait, so width follows its aspect ratio. */
export function TaskBrandMark({ size = 34 }: { size?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="BestServe Group">
      <SvgXml xml={LOGO_XML} width={(size * 610.2) / 934.54} height={size} />
    </View>
  );
}

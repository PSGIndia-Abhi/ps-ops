import React from 'react';
import {
  BriefcaseIcon,
  CalendarIcon,
  ChartIcon,
  HomeIcon,
  MoreHorizontalIcon,
  UsersIcon,
} from '../components/icons';

/**
 * `tabBarIcon` render functions, defined once at module scope rather than
 * inline in each navigator's `options` - inline arrow functions there get
 * recreated every render, which is exactly what `react/no-unstable-nested-
 * components` (correctly) flags. Shared here since Admin/Supervisor both
 * use Home/Jobs, and all three roles use More.
 */
type TabIconProps = { color: string; size: number };

export const homeTabIcon = ({ color, size }: TabIconProps) => <HomeIcon size={size} color={color} />;
export const jobsTabIcon = ({ color, size }: TabIconProps) => (
  <BriefcaseIcon size={size} color={color} />
);
export const bookingsTabIcon = ({ color, size }: TabIconProps) => (
  <CalendarIcon size={size} color={color} />
);
export const scheduleTabIcon = ({ color, size }: TabIconProps) => (
  <CalendarIcon size={size} color={color} />
);
export const performanceTabIcon = ({ color, size }: TabIconProps) => (
  <ChartIcon size={size} color={color} />
);
export const teamTabIcon = ({ color, size }: TabIconProps) => <UsersIcon size={size} color={color} />;
export const moreTabIcon = ({ color, size }: TabIconProps) => (
  <MoreHorizontalIcon size={size} color={color} />
);

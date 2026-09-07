import React from 'react';
import { useUserRole } from '../auth/role';
import { AdminTabNavigator } from './AdminTabNavigator';
import { SupervisorTabNavigator } from './SupervisorTabNavigator';
import { TechnicianTabNavigator } from './TechnicianTabNavigator';
import { ProfileScreen } from '../screens/profile/ProfileScreen';

/**
 * Picks the one bottom-tab navigator that matches the signed-in user's
 * actual role (never hard-coded, never guessed - see auth/role.ts). A role
 * without a dedicated dashboard (client, telecaller, or anything future)
 * falls back to the Profile screen rather than crashing or showing the
 * wrong role's data.
 */
export function RoleTabs() {
  const role = useUserRole();

  switch (role) {
    case 'admin':
    case 'branch_admin':
      return <AdminTabNavigator />;
    case 'supervisor':
      return <SupervisorTabNavigator />;
    case 'technician':
      return <TechnicianTabNavigator />;
    default:
      return <ProfileScreen />;
  }
}

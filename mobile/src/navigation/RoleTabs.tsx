import React from 'react';
import { isTaskRole, useRawRole, useUserRole } from '../auth/role';
import { leadPersonaForRole } from '../leads/stage';
import { CrmNavigator } from './CrmNavigator';
import { LeadsNavigator } from './LeadsNavigator';
import { TaskNavigator } from './TaskNavigator';
import { SupervisorTabNavigator } from './SupervisorTabNavigator';
import { TechnicianTabNavigator } from './TechnicianTabNavigator';
import { UnsupportedRoleScreen } from '../screens/misc/UnsupportedRoleScreen';

/**
 * Picks the one bottom-tab navigator that matches the signed-in user's
 * actual role (never hard-coded, never guessed - see auth/role.ts).
 *
 * Mobile is Technician/Supervisor only (business decision: Admin continues
 * on the web app/laptop). admin and branch_admin are grouped together here
 * deliberately, not split - the existing web app itself treats branch_admin
 * as an admin-tier role (frontend/src/auth/roleBasePath.js routes it to the
 * same "/admin" experience as admin, and its granted permissions include
 * branch-level user/role management - CREATE_USER, UPDATE_ROLE,
 * ASSIGN_BRANCH_ADMIN - that supervisor never has), so it is not a
 * supervisor-equivalent role and must not be mapped to Supervisor here.
 *
 * Any other role without a dedicated mobile dashboard (client,
 * temporary_worker, or nothing decoded yet) gets the same safe fallback -
 * never a crash, never the wrong role's dashboard.
 */
export function RoleTabs() {
  const role = useUserRole();
  const rawRole = useRawRole();

  // Org-hierarchy designations get Task Management - same login split as the web app.
  if (isTaskRole(rawRole)) return <TaskNavigator />;
  // Telecallers and sales managers get Lead Management (sales executives reach it inside the CRM app).
  if (leadPersonaForRole(rawRole)) return <LeadsNavigator />;

  switch (role) {
    case 'supervisor':
      return <SupervisorTabNavigator />;
    case 'technician':
      return <TechnicianTabNavigator />;
    // Sales and Marketing get the CRM app instead of the field-service tabs.
    case 'sales':
    case 'marketing':
      return <CrmNavigator />;
    default:
      return <UnsupportedRoleScreen />;
  }
}

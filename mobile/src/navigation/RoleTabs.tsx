import React, { useMemo, useState } from 'react';
import { canSwitchToSales, isTaskRole, useRawRole, useUserRole } from '../auth/role';
import { AppSwitchProvider, type AppKind } from './AppSwitchContext';
import { AppSwitchSheet } from './AppSwitchSheet';
import { CrmNavigator } from './CrmNavigator';
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

  // Managing Director / Personal Assistant open in Task Management like every org-hierarchy role,
  // and can move to the Sales app and back without signing out.
  const canSwitch = canSwitchToSales(rawRole);
  const [inSales, setInSales] = useState(false);
  const current: AppKind = canSwitch && inSales ? 'sales' : 'tasks';
  const [sheet, setSheet] = useState<{ onProfile?: () => void } | null>(null);
  const appSwitch = useMemo(
    () => ({
      canSwitch,
      current,
      openSwitcher: (onProfile?: () => void) => setSheet({ onProfile }),
    }),
    [canSwitch, current],
  );

  // Org-hierarchy designations get Task Management - same login split as the web app.
  if (isTaskRole(rawRole)) {
    return (
      <AppSwitchProvider value={appSwitch}>
        {current === 'sales' ? <CrmNavigator /> : <TaskNavigator />}
        {canSwitch && (
          <AppSwitchSheet
            visible={sheet !== null}
            current={current}
            onPick={app => {
              setSheet(null);
              setInSales(app === 'sales');
            }}
            onProfile={sheet?.onProfile}
            onClose={() => setSheet(null)}
          />
        )}
      </AppSwitchProvider>
    );
  }

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

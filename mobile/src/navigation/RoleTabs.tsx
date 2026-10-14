import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { canSwitchToSales, isAccountantRole, isTaskRole, useRawRole, useUserRole } from '../auth/role';
import { leadPersonaForRole } from '../leads/stage';
import { AppSwitchProvider, type AppKind } from './AppSwitchContext';
import { AppSwitchSheet } from './AppSwitchSheet';
import { CrmNavigator } from './CrmNavigator';
import { LeadsNavigator } from './LeadsNavigator';
import { RemindersNavigator } from './RemindersNavigator';
import { TaskNavigator } from './TaskNavigator';
import { SupervisorTabNavigator } from './SupervisorTabNavigator';
import { TechnicianTabNavigator } from './TechnicianTabNavigator';
import { UnsupportedRoleScreen } from '../screens/misc/UnsupportedRoleScreen';
import { colors } from '../theme';

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
/** How long the screen stays blank between unmounting one app and mounting the other. */
const SWAP_MS = 80;

export function RoleTabs() {
  const role = useUserRole();
  const rawRole = useRawRole();

  // Which apps this person has, and the one they open in:
  //  - Managing Director / Personal Assistant: Task Management, can switch to Sales;
  //  - lead roles (telecaller, commercial sales, sales manager): Lead Management, can switch to
  //    Task Management - same as the web, where their follow-ups and visits are tasks too;
  //  - accountant: Payment Reminders (the web's Accountant Panel), can switch to Task Management;
  //  - other org-hierarchy roles: Task Management only.
  const leadRole = !!leadPersonaForRole(rawRole);
  const accountant = isAccountantRole(rawRole);
  const taskRole = isTaskRole(rawRole);
  const apps = useMemo<AppKind[]>(
    () =>
      leadRole
        ? ['leads', 'tasks']
        : accountant
        ? ['reminders', 'tasks']
        : taskRole
        ? canSwitchToSales(rawRole)
          ? ['tasks', 'sales']
          : ['tasks']
        : [],
    [leadRole, accountant, taskRole, rawRole],
  );
  const canSwitch = apps.length > 1;
  const [picked, setPicked] = useState<AppKind | null>(null);
  const current: AppKind = picked && apps.includes(picked) ? picked : apps[0] ?? 'tasks';
  // The app being left is unmounted first and the other one mounted a moment later: replacing one
  // navigator with the other in a single step leaves the native screen stack unable to open screens.
  const [swapping, setSwapping] = useState(false);
  const [sheet, setSheet] = useState<{ onProfile?: () => void } | null>(null);
  const appSwitch = useMemo(
    () => ({
      canSwitch,
      current,
      openSwitcher: (onProfile?: () => void) => setSheet({ onProfile }),
    }),
    [canSwitch, current],
  );

  if (apps.length > 0) {
    return (
      <AppSwitchProvider value={appSwitch}>
        {swapping ? (
          <View style={styles.blank} />
        ) : current === 'leads' ? (
          <LeadsNavigator />
        ) : current === 'sales' ? (
          <CrmNavigator />
        ) : current === 'reminders' ? (
          <RemindersNavigator />
        ) : (
          <TaskNavigator />
        )}
        {canSwitch && (
          <AppSwitchSheet
            visible={sheet !== null}
            current={current}
            apps={apps}
            onPick={app => {
              setSheet(null);
              setSwapping(true);
              setTimeout(() => {
                setPicked(app);
                setSwapping(false);
              }, SWAP_MS);
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

const styles = StyleSheet.create({ blank: { flex: 1, backgroundColor: colors.background } });

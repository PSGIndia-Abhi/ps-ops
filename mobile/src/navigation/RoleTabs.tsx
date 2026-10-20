import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { canSwitchToSales, isAccountantRole, isTaskRole, useRawRole, useUserRole } from '../auth/role';
import { loadDefaultApp, saveDefaultApp } from './defaultApp';
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
  //  - Managing Director / Personal Assistant: Task Management, can switch to Commercial and
  //    Residential Leads, where they work as a sales manager (the old Sales app is no longer used);
  //  - lead roles (telecaller, commercial sales, sales manager): Lead Management, can switch to
  //    Task Management - same as the web, where their follow-ups and visits are tasks too;
  //  - accountant: Payment Reminders (the web's Accountant Panel), can switch to Task Management;
  //  - other org-hierarchy roles: Task Management only.
  const leadPersona = leadPersonaForRole(rawRole);
  const salesSwitch = canSwitchToSales(rawRole);
  const leadRole = !!leadPersona && !salesSwitch;
  // A Sales Executive / Sales Manager also works residential leads, in their own app.
  const residentialToo = leadPersona === 'sales' || leadPersona === 'sales_manager';
  const accountant = isAccountantRole(rawRole);
  const taskRole = isTaskRole(rawRole);
  const apps = useMemo<AppKind[]>(
    () =>
      salesSwitch
        ? ['tasks', 'leads', 'residential']
        : leadRole
        ? residentialToo
          ? ['leads', 'residential', 'tasks']
          : ['leads', 'tasks']
        : accountant
        ? ['reminders', 'tasks']
        : taskRole
        ? ['tasks']
        : [],
    [salesSwitch, leadRole, residentialToo, accountant, taskRole],
  );
  const canSwitch = apps.length > 1;
  const [picked, setPicked] = useState<AppKind | null>(null);
  // The app this person chose to open in (Switch app -> Set as default). Read once before the first
  // app is shown, so it opens straight in the right one; undefined while reading.
  const { user, session } = useAuth();
  const userId = String(user?.id ?? session?.userId ?? '');
  const [defaultApp, setDefaultApp] = useState<AppKind | null | undefined>(canSwitch ? undefined : null);
  useEffect(() => {
    if (!canSwitch || !userId) {
      setDefaultApp(null);
      return;
    }
    let alive = true;
    loadDefaultApp(userId).then(app => {
      if (!alive) return;
      setDefaultApp(app);
      if (app) setPicked(prev => prev ?? app);
    });
    return () => {
      alive = false;
    };
  }, [canSwitch, userId]);
  const chooseDefault = (app: AppKind) => {
    setDefaultApp(app);
    if (userId) saveDefaultApp(userId, app);
  };
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
        {swapping || defaultApp === undefined ? (
          <View style={styles.blank} />
        ) : current === 'leads' ? (
          <LeadsNavigator />
        ) : current === 'sales' || current === 'residential' ? (
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
            defaultApp={defaultApp ?? null}
            onSetDefault={chooseDefault}
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

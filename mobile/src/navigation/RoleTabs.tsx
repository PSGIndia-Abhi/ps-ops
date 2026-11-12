import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { FeedbackNavigator } from './FeedbackNavigator';
import { getMyAccess, getOpenTicketCount } from '../feedback/api';
import { TICKET_PERMISSIONS, TICKETS_ONLY, TicketsTabContext } from '../feedback/FeedbackTicketsTab';
import { TaskNavigator } from './TaskNavigator';
import { feedbackSwitchCount, taskSwitchCount } from './switchCounts';
import { useUnseen } from '../feedback/unseen';
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
  // Customer Feedback: the feedback collector opens there and can switch to Task Management; anyone else whose role has a
  // FEEDBACK_* permission (the backend says - GET /api/feedback/me) can switch to it as well.
  const feedbackCollector = (rawRole || '').toLowerCase().trim() === 'feedback_collector';
  const [feedbackAccess, setFeedbackAccess] = useState(false);
  // Only tickets (a department's team such as Accounts, an assigned supervisor / salesperson): a
  // "Tickets" tab in their own app instead of the Customer Feedback app.
  const [ticketsTab, setTicketsTab] = useState(false);
  // The number on the Tickets tab: open tickets waiting for them (every minute, and when the list shows).
  // It clears once the list is opened; only new tickets show after (kept on this phone, per user).
  const auth = useAuth();
  const seenScope = String(auth.user?.id ?? auth.session?.userId ?? '');
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const ticketsSeen = useUnseen(seenScope, 'ticketsTab', ticketCount);
  const refreshTickets = useCallback(() => {
    getOpenTicketCount()
      .then(setTicketCount)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!ticketsTab) return undefined;
    refreshTickets();
    const timer = setInterval(refreshTickets, 60000);
    return () => clearInterval(timer);
  }, [ticketsTab, refreshTickets]);
  const ticketsValue = useMemo(
    () => ({ show: ticketsTab, count: ticketsSeen.unseen, refresh: refreshTickets, markSeen: ticketsSeen.markSeen }),
    [ticketsTab, ticketsSeen.unseen, ticketsSeen.markSeen, refreshTickets],
  );
  useEffect(() => {
    if (!rawRole) return undefined;
    let alive = true;
    getMyAccess()
      .then((perms) => {
        if (!alive) return;
        const only = perms.length > 0 && perms.every((p) => TICKETS_ONLY.includes(p));
        // The Tickets tab in their other apps (Task / Lead Management) for anyone who works tickets -
        // the desk (Service Coordinator, Operations Manager) and the collector too, as on the web.
        setTicketsTab(perms.some((p) => TICKET_PERMISSIONS.includes(p)));
        setFeedbackAccess(!feedbackCollector && perms.length > 0 && !only);
      })
      .catch(() => alive && setFeedbackAccess(false));
    return () => {
      alive = false;
    };
  }, [rawRole, feedbackCollector]);
  const baseApps = useMemo<AppKind[]>(
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
  // Service Coordinator and Operations Manager start in Customer Feedback (as on the web); Task
  // Management is one switch away. Their own "Set as default" choice still wins.
  const feedbackFirst = ['service coordinator', 'operations manager'].includes((rawRole || '').toLowerCase().trim());
  const apps = useMemo<AppKind[]>(
    () =>
      feedbackCollector
        ? ['feedback', 'tasks']
        : feedbackAccess && baseApps.length
        ? feedbackFirst
          ? ['feedback', ...baseApps]
          : [...baseApps, 'feedback']
        : baseApps,
    [feedbackCollector, feedbackAccess, feedbackFirst, baseApps],
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
  // The numbers on "Switch app" (as on the web's switch buttons) for people with both Task Management
  // and Customer Feedback: what waits in each, cleared once that app is opened (kept on this phone).
  const withBoth = apps.includes('tasks') && apps.includes('feedback');
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [fbCount, setFbCount] = useState<number | null>(null);
  useEffect(() => {
    if (!withBoth) return undefined;
    let alive = true;
    const load = () => {
      taskSwitchCount()
        .then((n) => alive && setTaskCount(n))
        .catch(() => {});
      feedbackSwitchCount()
        .then((n) => alive && setFbCount(n))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [withBoth, current]);
  const tasksSeen = useUnseen(seenScope, 'switch.tasks', withBoth ? taskCount : null);
  const fbSeen = useUnseen(seenScope, 'switch.feedback', withBoth ? fbCount : null);
  // The app being used counts as opened.
  const markTasksSeen = tasksSeen.markSeen;
  const markFbSeen = fbSeen.markSeen;
  useEffect(() => {
    if (current === 'tasks') markTasksSeen();
    if (current === 'feedback') markFbSeen();
  }, [current, taskCount, fbCount, markTasksSeen, markFbSeen]);
  const badges = useMemo<Partial<Record<AppKind, number>>>(
    () => (withBoth ? { tasks: current === 'tasks' ? 0 : tasksSeen.unseen, feedback: current === 'feedback' ? 0 : fbSeen.unseen } : {}),
    [withBoth, current, tasksSeen.unseen, fbSeen.unseen],
  );
  const badgeTotal = (badges.tasks || 0) + (badges.feedback || 0);
  const appSwitch = useMemo(
    () => ({
      canSwitch,
      current,
      openSwitcher: (onProfile?: () => void) => setSheet({ onProfile }),
      badges,
      badgeTotal,
    }),
    [canSwitch, current, badges, badgeTotal],
  );

  return (
    <TicketsTabContext.Provider value={ticketsValue}>
      {body()}
    </TicketsTabContext.Provider>
  );

  function body() {
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
          ) : current === 'feedback' ? (
            <FeedbackNavigator />
          ) : (
            <TaskNavigator />
          )}
          {canSwitch && (
            <AppSwitchSheet
              visible={sheet !== null}
              current={current}
              apps={apps}
              badges={badges}
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
}

const styles = StyleSheet.create({ blank: { flex: 1, backgroundColor: colors.background } });

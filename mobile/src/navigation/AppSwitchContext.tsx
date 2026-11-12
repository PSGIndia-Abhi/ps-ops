import { createContext, useContext } from 'react';

export type AppKind = 'tasks' | 'sales' | 'leads' | 'reminders' | 'residential' | 'feedback';

/**
 * Some Task Management roles (Managing Director, Personal Assistant) also work in the Sales app,
 * the lead roles (telecaller, commercial sales, sales manager) also work in Task Management, and
 * the accountant also works in Payment Reminders.
 * They move between the two without signing out; RoleTabs owns which one is showing and the
 * "Switch app" sheet they pick from.
 */
export interface AppSwitchValue {
  /** True for a user who has both apps. */
  canSwitch: boolean;
  /** The app showing right now. */
  current: AppKind;
  /**
   * Opens the "Switch app" sheet. `onProfile` is what its "My profile" link does - each app's
   * Home passes its own way of opening the profile, since the sheet replaces that tap.
   */
  openSwitcher: (onProfile?: () => void) => void;
  /** What waits in each of the person's other apps, not seen yet (the numbers in "Switch app"). */
  badges: Partial<Record<AppKind, number>>;
  /** All of them added up - the red number on the avatar. */
  badgeTotal: number;
}

const AppSwitchContext = createContext<AppSwitchValue>({
  canSwitch: false,
  current: 'tasks',
  openSwitcher: () => undefined,
  badges: {},
  badgeTotal: 0,
});

export const AppSwitchProvider = AppSwitchContext.Provider;

export function useAppSwitch(): AppSwitchValue {
  return useContext(AppSwitchContext);
}

/**
 * The CRM app shown as residential only: for the residential sales roles (sales / marketing), and
 * for a Sales Executive or Sales Manager who switched to their Residential app.
 */
export function useResidentialOnly(rawRole: string | null | undefined): boolean {
  const { current } = useAppSwitch();
  const r = (rawRole || '').toLowerCase().trim();
  return r === 'sales' || r === 'marketing' || current === 'residential';
}

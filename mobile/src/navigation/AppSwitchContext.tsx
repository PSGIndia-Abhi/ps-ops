import { createContext, useContext } from 'react';

export type AppKind = 'tasks' | 'sales' | 'reminders';

/**
 * Some Task Management roles (Managing Director, Personal Assistant) also work in the Sales app,
 * and the accountant also works in Payment Reminders.
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
}

const AppSwitchContext = createContext<AppSwitchValue>({
  canSwitch: false,
  current: 'tasks',
  openSwitcher: () => undefined,
});

export const AppSwitchProvider = AppSwitchContext.Provider;

export function useAppSwitch(): AppSwitchValue {
  return useContext(AppSwitchContext);
}

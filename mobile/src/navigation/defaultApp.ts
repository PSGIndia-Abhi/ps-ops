import { kvGet, kvSet } from '../crm/secureKv';
import type { AppKind } from './AppSwitchContext';

/**
 * The app a person with more than one (Commercial / Residential / Task Management, Payment Reminders,
 * Sales) opens in when they sign in - picked by them in the "Switch app" sheet. Kept on this phone
 * per signed-in user, so another user of the same phone keeps their own.
 */
const KEY = 'defaultApp';

export const loadDefaultApp = (userId: string) => kvGet<AppKind>(userId, KEY);
export const saveDefaultApp = (userId: string, app: AppKind) => kvSet(userId, KEY, app);

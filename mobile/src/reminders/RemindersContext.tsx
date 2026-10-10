import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Toast, type ToastMessage } from '../components/Toast';
import { errorMessage } from '../tasks/TasksContext';
import * as api from './api';
import { cleanReminder, customersWithOutstanding } from './format';
import type { Customer, Invoice, Reminder, ReminderSchedule } from './types';

/**
 * One shared copy of what every Payment Reminders screen reads: the invoices (for names and
 * live amounts), the reminders and the repeating schedules. The mobile twin of the web's
 * useAccountantData(); the server scopes every list to what this person may see.
 */
interface RemindersContextValue {
  /** The signed-in user: reminders are always assigned to whoever creates them. */
  userId: number;
  userName: string;
  invoices: Invoice[];
  customers: Customer[];
  reminders: Reminder[];
  schedules: ReminderSchedule[];
  ready: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  showToast: (message: string, variant?: ToastMessage['variant']) => void;
}

const RemindersContext = createContext<RemindersContextValue | undefined>(undefined);

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [schedules, setSchedules] = useState<ReminderSchedule[]>([]);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const [inv, tasks, series] = await Promise.all([api.listInvoices(), api.listReminderTasks(), api.listSchedules()]);
      const byId = new Map(inv.map((i) => [i.id, i]));
      const names = new Map(inv.map((i) => [i.customer_id, i.customer_name]));
      setInvoices(inv);
      setReminders(tasks.map((t) => cleanReminder(t, byId, names)));
      setSchedules(series);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const showToast = useCallback((message: string, variant: ToastMessage['variant'] = 'success') => {
    setToast({ message, variant });
  }, []);

  const customers = useMemo(() => customersWithOutstanding(invoices), [invoices]);
  const userId = Number(user?.id ?? session?.userId ?? 0);
  const userName = user?.name ?? '';

  const value = useMemo(
    () => ({ userId, userName, invoices, customers, reminders, schedules, ready, refreshing, error, reload, showToast }),
    [userId, userName, invoices, customers, reminders, schedules, ready, refreshing, error, reload, showToast],
  );

  return (
    <RemindersContext.Provider value={value}>
      <View style={styles.flex}>
        {children}
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </View>
    </RemindersContext.Provider>
  );
}

export function useReminders(): RemindersContextValue {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error('useReminders must be used inside RemindersProvider');
  return ctx;
}

const styles = StyleSheet.create({ flex: { flex: 1 } });

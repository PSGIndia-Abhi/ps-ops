import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { spacing, typography } from '../../theme';
import * as api from '../api';
import { fmtDateShort, fmtDateTime, recurrenceSummary, todayStr } from '../format';
import { errorMessage, useTasks } from '../TasksContext';
import type { TaskSeries } from '../types';
import { Sheet } from './sheets';

const factory = (t: CrmTheme) => ({
  flex: { flex: 1 },
  cardTitle: { ...typography.bodyMedium, color: t.textPrimary },
  fileMeta: { ...typography.caption, color: t.textMuted },
  descText: { ...typography.body, color: t.textSecondary },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
  seriesHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.sm },
  occRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: spacing.xs },
});

const LABEL = {
  ACTIVE: ['Active', 'success'],
  PAUSED: ['Paused', 'warning'],
  CANCELLED: ['Stopped', 'neutral'],
} as const;

/**
 * "Recurring schedule" — a series's rule, its next date, recent occurrences,
 * and Pause/Resume/Stop. Shared by the task detail screen (opened via a real
 * occurrence's series_id) and the task list screen (opened for a series that
 * hasn't produced its first occurrence yet — see NotStartedSeries). Either
 * way it's driven purely by `seriesId`, so it works before any occurrence
 * exists — mirrors the web's SeriesDialog.jsx exactly.
 */
export function SeriesSheet({
  visible,
  onClose,
  seriesId,
  allowManage,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  seriesId: string;
  allowManage: boolean;
  onChanged: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const { showToast } = useTasks();
  const [series, setSeries] = useState<TaskSeries | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .getSeries(seriesId)
      .then(s => {
        setSeries(s);
        setErr(null);
      })
      .catch(e => setErr(errorMessage(e)));
  }, [seriesId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  async function act(fn: () => Promise<void>, label: string) {
    setBusy(true);
    try {
      await fn();
      load();
      onChanged();
      showToast(label);
    } catch (e) {
      showToast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Recurring schedule">
      {!series && !err && <ActivityIndicator color={theme.primary} />}
      {err && <Text style={styles.sheetText}>{err}</Text>}
      {series && (
        <ScrollView style={{ maxHeight: 520 }}>
          <View style={styles.seriesHead}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{series.title}</Text>
              <Text style={styles.fileMeta}>{recurrenceSummary(series.recurrence)}</Text>
            </View>
            <StatusBadge label={LABEL[series.status][0]} tone={LABEL[series.status][1]} />
          </View>
          {series.occurrences.length === 0 && (
            <Text style={styles.sheetText}>No occurrences yet — the first one is created on its due date.</Text>
          )}
          {series.status === 'PAUSED' && series.pause_from && (
            <Text style={styles.sheetText}>
              Paused from {fmtDateShort(series.pause_from)}
              {series.pause_until ? ` to ${fmtDateShort(series.pause_until)}` : ' until resumed'}.
            </Text>
          )}
          {!!series.next_occurrence_date && (
            <Text style={styles.sheetText}>Next occurrence: {fmtDateShort(series.next_occurrence_date)}</Text>
          )}
          {series.occurrences.length > 0 && (
            <>
              <Text style={styles.cardTitle}>Recent occurrences</Text>
              {series.occurrences.slice(0, 6).map(o => (
                <View key={o.id} style={styles.occRow}>
                  <Text style={styles.descText}>{fmtDateTime(o.due_date, o.due_time)}</Text>
                  <StatusBadge
                    label={o.status === 'IN_PROGRESS' ? 'In Progress' : o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                    tone={
                      o.status === 'COMPLETED' ? 'success' : o.status === 'CANCELLED' ? 'neutral' : o.status === 'IN_PROGRESS' ? 'accent' : 'info'
                    }
                    dot={false}
                  />
                </View>
              ))}
            </>
          )}
          {!allowManage && (
            <Text style={[styles.sheetText, { marginTop: spacing.sm }]}>
              You can view this schedule. Only its creator or your manager can pause, resume or stop it.
            </Text>
          )}
          {allowManage && series.status !== 'CANCELLED' && (
            <View style={[styles.sheetButtons, { marginTop: spacing.lg }]}>
              {series.status === 'ACTIVE' && (
                <PrimaryButton
                  label="Pause"
                  variant="secondary"
                  style={styles.flex}
                  loading={busy}
                  onPress={() => act(() => api.pauseSeries(series.id, series.next_occurrence_date || todayStr()), 'Schedule paused')}
                />
              )}
              {series.status === 'PAUSED' && (
                <PrimaryButton label="Resume" style={styles.flex} loading={busy} onPress={() => act(() => api.resumeSeries(series.id), 'Schedule resumed')} />
              )}
              <PrimaryButton label="Stop" variant="brand" style={styles.flex} loading={busy} onPress={() => act(() => api.stopSeries(series.id), 'Schedule stopped')} />
            </View>
          )}
        </ScrollView>
      )}
    </Sheet>
  );
}

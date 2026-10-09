import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRightIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import { fmtDateShort, recurrenceSummary } from '../format';
import type { Viewer } from '../TasksContext';
import type { SeriesListItem } from '../types';
import { Avatar } from './parts';
import { RepeatIcon } from './taskIcons';

const factory = (t: CrmTheme) => ({
  wrap: {
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: t.primarySoft,
    backgroundColor: t.primarySoftBg,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    ...typography.captionMedium,
    color: t.primary,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  rowPressed: { opacity: 0.85 },
  text: { flex: 1 },
  title: { ...typography.bodyMedium, color: t.textPrimary },
  meta: { ...typography.caption, color: t.textMuted, marginTop: 2 },
});

/**
 * A recurring schedule only shows up as a real task once its first occurrence's
 * due date actually arrives - nothing is pre-created ahead of time. So a
 * schedule starting next month produces nothing for Upcoming to show today,
 * with no way to confirm "yes, I created that" until it starts. This fills
 * that gap with a short list of schedules that haven't produced an occurrence
 * yet, visible to the signed-in person (their own and their team's - the API
 * already scopes the list the same way it scopes everything else).
 * Mirrors frontend/src/pages/taskpro/NotStartedSeries.jsx.
 */
export function NotStartedSeries({ viewer, onOpen }: { viewer: Viewer; onOpen: (seriesId: string, allowManage: boolean) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [list, setList] = useState<SeriesListItem[] | null>(null);

  useEffect(() => {
    let live = true;
    api
      .listSeries()
      .then(rows => {
        if (!live) return;
        setList(rows.filter(s => s.status !== 'CANCELLED' && !s.occurrences_created));
      })
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, []);

  if (!list || list.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <RepeatIcon size={15} color={theme.primary} />
        <Text style={{ color: theme.primary, ...typography.captionMedium }}>
          {list.length === 1 ? "1 recurring schedule hasn't started yet" : `${list.length} recurring schedules haven't started yet`}
        </Text>
      </View>
      {list.map(s => (
        <Pressable
          key={s.id}
          onPress={() => onOpen(s.id, s.created_by === viewer.id || viewer.team.some(m => m.id === s.assigned_to))}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel={s.title}
        >
          <Avatar name={s.assigned_to_name} id={s.assigned_to} size={28} />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {s.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {recurrenceSummary({
                frequency: s.frequency,
                interval_value: s.interval_value,
                days_of_week: s.days_of_week,
                day_of_month: s.day_of_month ?? undefined,
                use_last_day_of_month: !!s.use_last_day_of_month,
                time_of_day: s.time_of_day,
                start_date: s.start_date,
                end_type: s.end_type,
              })}{' '}
              · Starts {fmtDateShort(s.start_date)} · {s.assigned_to_name}
            </Text>
          </View>
          <ChevronRightIcon size={18} color={theme.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

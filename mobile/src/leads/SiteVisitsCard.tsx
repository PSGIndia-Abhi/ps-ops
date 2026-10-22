import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BriefcaseIcon, ChevronRightIcon, PersonIcon, UsersIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { StatusBadge, toneColors, type Tone } from '../crm/ui/StatusBadge';
import { formatLeadWhen } from '../crm/format';
import { radii, spacing, typography } from '../theme';
import type { LeadVisit } from './api';
import { PlaceLine } from './PlaceLine';
import { MEETING_STATUS_META } from './ui';

const PREVIEW = 3;

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.xs, marginBottom: spacing.xs },
  title: { ...typography.overline, color: t.textMuted },
  count: { ...typography.captionMedium, color: t.textMuted },
  visit: { flexDirection: 'row' as const, gap: spacing.sm, paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: t.border },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: t.accentBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { flex: 1, gap: 4 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  when: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  meta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  metaText: { ...typography.caption, color: t.textMuted, flex: 1 },
  places: { gap: spacing.sm, marginTop: spacing.xs },
  outcome: { ...typography.caption, color: t.textSecondary, lineHeight: 18 },
  chevron: { justifyContent: 'center' as const },
  more: { alignSelf: 'center' as const, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  moreText: { ...typography.captionMedium, color: t.primary },
});

/** "2026-10-13 11:34:00" -> "Today, 11:34 AM" / "Yesterday, 8:07 PM" / "Oct 9, 8:18 PM". */
const when = (at: string) => formatLeadWhen(at.replace(' ', 'T'));


/**
 * A lead's visit history on its details page: every meeting, newest first - when, with whom,
 * whether it happened (start / end time and the GPS position captured at each), and the outcome.
 * A tap opens the meeting.
 */
export function SiteVisitsCard({ visits, onOpen }: { visits: LeadVisit[]; onOpen: (meetingId: string) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [all, setAll] = useState(false);
  if (visits.length === 0) return null;
  const shown = all ? visits : visits.slice(0, PREVIEW);

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>SITE VISITS</Text>
        <Text style={styles.count}>{visits.length}</Text>
      </View>
      {shown.map((v, i) => {
        const inProgress = v.status === 'SCHEDULED' && !!v.checkInAt;
        const meta: { label: string; tone: Tone } = inProgress ? { label: 'In progress', tone: 'warning' } : MEETING_STATUS_META[v.status];
        const office = v.type === 'OFFICE';
        return (
          <Pressable key={v.id} onPress={() => onOpen(v.id)} accessibilityRole="button" style={[styles.visit, i > 0 && styles.divider]}>
            <View style={styles.icon}>{office ? <UsersIcon size={18} color={theme.accent} /> : <BriefcaseIcon size={18} color={theme.accent} />}</View>
            <View style={styles.body}>
              <View style={styles.top}>
                <Text style={styles.when} numberOfLines={1}>
                  {when(`${v.date} ${v.time || '00:00:00'}`)}
                </Text>
                <StatusBadge label={meta.label} tone={meta.tone} />
              </View>
              <View style={styles.meta}>
                <PersonIcon size={13} color={theme.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {office ? 'Office meeting' : 'Site visit'}
                  {v.salesName ? ` · ${v.salesName}` : ''}
                </Text>
              </View>
              {(!!v.checkInAt || !!v.checkOutAt) && (
                <View style={styles.places}>
                  {!!v.checkInAt && <PlaceLine label="Started" time={when(v.checkInAt)} coords={v.checkInCoords} tone={toneColors(theme, 'success')} />}
                  {!!v.checkOutAt && <PlaceLine label="Ended" time={when(v.checkOutAt)} coords={v.checkOutCoords} tone={toneColors(theme, 'info')} />}
                </View>
              )}
              {!!v.outcomeNotes && (
                <Text style={styles.outcome} numberOfLines={2}>
                  {v.outcomeNotes}
                </Text>
              )}
            </View>
            <View style={styles.chevron}>
              <ChevronRightIcon size={16} color={theme.textMuted} />
            </View>
          </Pressable>
        );
      })}
      {visits.length > PREVIEW && (
        <Pressable onPress={() => setAll((x) => !x)} accessibilityRole="button" style={styles.more}>
          <Text style={styles.moreText}>{all ? 'Show less' : `Show all ${visits.length} visits`}</Text>
        </Pressable>
      )}
    </View>
  );
}

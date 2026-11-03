import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GlossyBadge } from '../components/GlossyBadge';
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
  // The fold: closed at first (like Details) - a tap opens the visits
  foldHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, minHeight: 60 },
  foldText: { flex: 1 },
  foldTitle: { ...typography.bodyMedium, color: t.textPrimary },
  foldHint: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: t.accentBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  countText: { ...typography.captionMedium, fontSize: 12, color: t.accentText },
  foldChevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const, transform: [{ rotate: '90deg' }] },
  foldChevronOpen: { transform: [{ rotate: '-90deg' }] },
  visit: { flexDirection: 'row' as const, gap: spacing.sm, paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: t.border },
  firstVisit: { marginTop: spacing.xs },
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
 * Folded away at first (the newest visit is named on the fold); a tap on a visit opens the meeting.
 */
export function SiteVisitsCard({ visits, onOpen }: { visits: LeadVisit[]; onOpen: (meetingId: string) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  if (visits.length === 0) return null;
  const shown = all ? visits : visits.slice(0, PREVIEW);
  const newest = visits[0];
  const newestMeta = newest.status === 'SCHEDULED' && !!newest.checkInAt ? 'In progress' : MEETING_STATUS_META[newest.status].label;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.foldHead}>
        <GlossyBadge color={theme.accent} size={38} icon={<BriefcaseIcon size={17} color="#fff" />} />
        <View style={styles.foldText}>
          <Text style={styles.foldTitle}>Site visits</Text>
          {!open && (
            <Text style={styles.foldHint} numberOfLines={1}>
              Last: {when(`${newest.date} ${newest.time || '00:00:00'}`)} · {newestMeta}
            </Text>
          )}
        </View>
        <View style={styles.count}>
          <Text style={styles.countText}>{visits.length}</Text>
        </View>
        <View style={[styles.foldChevron, open && styles.foldChevronOpen]}>
          <ChevronRightIcon size={18} color={theme.textMuted} />
        </View>
      </Pressable>
      {open && shown.map((v, i) => {
        const inProgress = v.status === 'SCHEDULED' && !!v.checkInAt;
        const meta: { label: string; tone: Tone } = inProgress ? { label: 'In progress', tone: 'warning' } : MEETING_STATUS_META[v.status];
        const office = v.type === 'OFFICE';
        return (
          <Pressable key={v.id} onPress={() => onOpen(v.id)} accessibilityRole="button" style={[styles.visit, styles.divider, i === 0 && styles.firstVisit]}>
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
      {open && visits.length > PREVIEW && (
        <Pressable onPress={() => setAll((x) => !x)} accessibilityRole="button" style={styles.more}>
          <Text style={styles.moreText}>{all ? 'Show less' : `Show all ${visits.length} visits`}</Text>
        </Pressable>
      )}
    </View>
  );
}

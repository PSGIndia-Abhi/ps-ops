import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCrmTheme } from '../crm/theme';
import { spacing, typography } from '../theme';
import * as api from './api';
import type { LeadStackParamList } from './navigation';
import type { Meeting, PipelineLead } from './types';
import { AgendaRow, StatTile, useLoad } from './ui';
import { todayStr } from '../tasks/format';

/** How many of today's meetings to list on Home before sending the user to the full list. */
const MAX_ROWS = 3;

/**
 * The sales executive's commercial-lead day, for the CRM Home: four counts
 * (today's meetings, upcoming meetings, quotations awaiting a reply, leads
 * converted) and today's meetings as an agenda. Every part opens the matching
 * lead screen.
 *
 * Renders nothing if it cannot be loaded - Home already has its own error
 * banner, and this is an extra, not the screen's main content.
 */
export function LeadTodayCard() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const theme = useCrmTheme();

  const loader = useCallback(async () => {
    const [summary, today, upcoming, leads] = await Promise.all([
      api.homeSummary(),
      api.meetingsToday().catch(() => [] as Meeting[]),
      api.meetingsUpcoming().catch(() => [] as Meeting[]),
      // Meetings carry only the lead's id; the list is what gives them a company name.
      api.listLeads().catch(() => [] as PipelineLead[]),
    ]);
    return {
      summary,
      today,
      upcomingCount: upcoming.filter((m) => m.date !== todayStr()).length,
      converted: leads.filter((l) => l.stage === 'CONVERTED' || l.stage === 'WON').length,
      names: new Map(leads.map((l) => [l.id, l.companyName])),
    };
  }, []);
  const { data } = useLoad(loader, '');
  if (!data) return null;

  const openMeetings = () => navigation.navigate('LeadMeetings');

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <StatTile label="Today" value={data.today.length} tone="success" onPress={openMeetings} />
        <StatTile label="Upcoming" value={data.upcomingCount} tone="info" onPress={openMeetings} />
        <StatTile label="Quotations" value={data.summary.pendingQuotationsCount} tone="accent" onPress={() => navigation.navigate('LeadList', { group: 'quoted' })} />
        <StatTile label="Converted" value={data.converted} tone="danger" onPress={() => navigation.navigate('LeadList', { group: 'won' })} />
      </View>

      {data.today.length > 0 && (
        <>
          <Text style={[styles.heading, { color: theme.textPrimary }]}>Today's Meetings ({data.today.length})</Text>
          {data.today.slice(0, MAX_ROWS).map((m) => (
            <AgendaRow
              key={m.id}
              meeting={m}
              title={data.names.get(m.leadId) || m.address || 'Meeting'}
              onPress={() => navigation.navigate('LeadMeeting', { meetingId: m.id })}
            />
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  heading: { ...typography.subtitle, marginBottom: spacing.sm },
});

import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, ChartIcon, CheckCircleIcon, ClockIcon, DocumentIcon } from '../components/icons';
import { spacing } from '../theme';
import { todayStr } from '../tasks/format';
import * as api from './api';
import { HomeTile, QuickAction, SectionTitle } from './homeParts';
import type { LeadStackParamList } from './navigation';
import type { Meeting, PipelineLead } from './types';
import { AgendaRow, useLoad } from './ui';

/** How many of today's meetings to list on Home before sending the user to the full list. */
const MAX_ROWS = 3;
const WHITE = '#FFFFFF';

/**
 * The sales executive's commercial-lead day, for the CRM Home: three stat
 * tiles (today's meetings, upcoming meetings, quotations awaiting a reply),
 * lead Quick Actions, and today's meetings as an agenda. Same tiles and
 * shortcuts as the telecaller / manager Home, so the three roles match.
 *
 * Renders nothing if it cannot be loaded - Home already has its own error
 * banner, and this is an extra, not the screen's main content.
 */
export function LeadTodayCard() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();

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
        <HomeTile icon={<CalendarIcon size={18} color={WHITE} />} value={data.today.length} label="Today's Meetings" tone="info" onPress={openMeetings} />
        <HomeTile icon={<ClockIcon size={18} color={WHITE} />} value={data.upcomingCount} label="Upcoming" tone="accent" onPress={openMeetings} />
        <HomeTile
          icon={<DocumentIcon size={18} color={WHITE} />}
          value={data.summary.pendingQuotationsCount}
          label="Quotations"
          tone="success"
          onPress={() => navigation.navigate('LeadList', { group: 'quoted' })}
        />
      </View>

      <SectionTitle title="Lead Quick Actions" />
      <View style={styles.row}>
        <QuickAction icon={<ClockIcon size={19} color={WHITE} />} label="Follow-ups" tone="warning" count={data.summary.todayFollowUpsCount} onPress={() => navigation.navigate('LeadTasks')} />
        <QuickAction icon={<CalendarIcon size={19} color={WHITE} />} label="Meetings" tone="accent" count={data.today.length} onPress={openMeetings} />
        <QuickAction icon={<CheckCircleIcon size={19} color={WHITE} />} label="Converted" tone="success" count={data.converted} onPress={() => navigation.navigate('LeadList', { group: 'won' })} />
        <QuickAction icon={<ChartIcon size={19} color={WHITE} />} label="Performance" tone="info" onPress={() => navigation.navigate('LeadPerformance')} />
      </View>

      {data.today.length > 0 && (
        <>
          <SectionTitle title={`Today's Meetings (${data.today.length})`} onViewAll={openMeetings} />
          {data.today.slice(0, MAX_ROWS).map((m) => (
            <AgendaRow key={m.id} meeting={m} title={data.names.get(m.leadId) || m.address || 'Meeting'} onPress={() => navigation.navigate('LeadMeeting', { meetingId: m.id })} />
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
});

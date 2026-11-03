import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ApiError } from '../../api/httpClient';
import { colors, spacing, typography } from '../../theme';
import { auditsApi, type Audit, type Readiness } from '../api';
import { addDays, fmtDate } from '../format';
import { BottomBar, ChipRow, DateField, GreenButton, Input, MessageBox, RiskBadge, auditStyles as a } from '../ui';
import { useAuth } from '../../auth/AuthContext';
import { ag } from '../theme';
import { ReportCard } from '../report';
import type { AuditsStackParamList } from '../AuditsNavigator';

type Nav = NativeStackNavigationProp<AuditsStackParamList>;
type Route = RouteProp<AuditsStackParamList, 'ReviewSubmit'>;
type Blocker = Readiness['blockers'][number] & { areaId?: string; findingId?: string };

const PAGES: [string, string][] = [
  ['riskChain', 'Risk chain page'],
  ['riskByZone', 'Risk by zone page'],
  ['priority', "This week's priority page"],
  ['ipmCycle', 'IPM cycle page'],
];

const NEXT_CHIPS = [
  { value: '2w', label: '2 weeks' },
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
];

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, last));
  return date.toISOString().slice(0, 10);
}

/** Next audit date for a quick pick, counted from the audit date. */
const nextDateFor = (auditDate: string, chip: string) =>
  chip === '2w' ? addDays(auditDate, 14) : addMonths(auditDate, chip === '1m' ? 1 : 3);

/**
 * One page: the checklist, then the sign-off (who received the report, next audit date,
 * remarks, report pages), then Submit. Submit saves the sign-off and locks the audit.
 */
export function ReviewSubmitScreen() {
  const navigation = useNavigation<Nav>();
  const { auditId } = useRoute<Route>().params;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [check, setCheck] = useState<Readiness | null>(null);
  const [excludeNotStarted, setExcludeNotStarted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // After submitting, "back" (header arrow or phone back button) goes to the Audits home,
  // where the next audit is started - not back into the locked audit.
  useEffect(() => {
    if (!done) return undefined;
    navigation.setOptions({ title: 'Audit submitted' });
    return navigation.addListener('beforeRemove', e => {
      if (e.data.action.type === 'POP_TO_TOP') return;
      e.preventDefault();
      navigation.popToTop();
    });
  }, [done, navigation]);

  // Sign-off form (on this page). Filled once from the saved sign-off.
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [pages, setPages] = useState<Record<string, boolean>>({ riskChain: true, riskByZone: true, priority: true, ipmCycle: true });
  const filled = useRef(false);

  const load = useCallback(async (exclude: boolean) => {
    try {
      const [data, ready] = await Promise.all([auditsApi.get(auditId), auditsApi.readiness(auditId, exclude)]);
      setAudit(data);
      setCheck(ready);
      if (!filled.current) {
        filled.current = true;
        // Not saved yet: the logged-in supervisor (can be changed).
        setName(data.signoff?.receivedByName || user?.name || '');
        setRole(data.signoff?.receivedByDesignation || '');
        setNextDate(data.signoff?.nextAuditDate || null);
        setRemarks(data.signoff?.remarks || '');
        if (data.reportOptions) setPages(x => ({ ...x, ...data.reportOptions }));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the audit');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId]);

  // Reload every time the screen is shown (e.g. back from fixing an area).
  useFocusEffect(useCallback(() => { load(excludeNotStarted); }, [load, excludeNotStarted]));

  // The sign-off is filled below on this page, so it does not show as a separate blocker.
  const blockers = (check?.blockers || []).filter(b => b.code !== 'SIGNOFF_MISSING') as Blocker[];
  const receivedBy = name.trim();
  const canSubmit = !!check && !blockers.length && !!receivedBy;

  function fix(b: Blocker) {
    if (!audit) return;
    if (b.code === 'NO_AREAS') return navigation.navigate('AreaInspect', { auditId });
    const areaId = b.areaId
      || audit.areas.find(x => x.findings.some(f => f.id === b.findingId))?.id
      || audit.areas.find(x => x.status !== 'COMPLETED')?.id;
    // No unfinished area to open: start a new one.
    navigation.navigate('AreaInspect', areaId ? { auditId, areaId } : { auditId });
  }

  async function submit() {
    if (!audit) return;
    if (!receivedBy) return setError('Enter who received the report');
    setBusy(true);
    setError(null);
    try {
      await auditsApi.saveSignoff(auditId, {
        receivedByName: receivedBy,
        receivedByDesignation: role,
        nextAuditDate: nextDate,
        remarks,
        reportOptions: pages,
      });
      // Saving the sign-off changes the audit version: read it again before submitting.
      const fresh = await auditsApi.get(auditId);
      setAudit(fresh);
      await auditsApi.submit(auditId, { rowVersion: fresh.rowVersion, excludeNotStartedAreas: excludeNotStarted });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        setError('The audit changed since this screen opened. It has been refreshed - submit again.');
        load(excludeNotStarted);
      } else {
        setError(e instanceof Error ? e.message : 'Could not submit');
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={[styles.screen, styles.doneWrap]}>
        <View style={styles.bigTick}><Text style={styles.bigTickText}>✓</Text></View>
        <Text style={styles.doneTitle}>Audit submitted</Text>
        <Text style={styles.doneSub}>{audit?.auditNumber} · {audit?.company.name}</Text>
        <ReportCard auditId={auditId} auditNumber={audit?.auditNumber || ''} customer={audit?.company.name || ''} auditDate={audit?.auditDate || ''} />
        <GreenButton label="Done - back to Audits" variant="outline" onPress={() => navigation.popToTop()} style={styles.doneBtn} />
      </View>
    );
  }

  const c = audit?.counts;
  const okItems: string[] = [];
  if (c) {
    if (c.areasCompleted) okItems.push(`${c.areasCompleted} of ${c.areas} area${c.areas === 1 ? '' : 's'} completed`);
    if (c.findings) okItems.push(`${c.findings} finding${c.findings === 1 ? '' : 's'} recorded (${c.CRITICAL + c.HIGH} high / critical)`);
    if (check && !check.blockers.some(b => b.code === 'VOICE_NOT_ACCEPTED')) okItems.push('All voice notes checked');
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {audit ? (
          <View style={[a.card, styles.block, styles.rowBetween]}>
            <View style={styles.flex}>
              <Text style={a.strong}>{audit.company.name}</Text>
              <Text style={a.muted}>{audit.auditNumber} · {fmtDate(audit.auditDate)}</Text>
            </View>
            <RiskBadge level={audit.overallRisk} />
          </View>
        ) : null}

        <Text style={a.section}>Checklist</Text>
        {!check && !error ? <Text style={a.muted}>Checking…</Text> : null}
        {check ? (
          <View style={[a.card, styles.block]}>
            {okItems.map(t => (
              <View key={t} style={styles.checkRow}>
                <View style={[styles.mark, styles.markOk]}><Text style={styles.markText}>✓</Text></View>
                <Text style={[styles.checkText, styles.flex]}>{t}</Text>
              </View>
            ))}
            {blockers.map((b, i) => (
              <View key={`${b.code}-${i}`} style={styles.checkRow}>
                <View style={[styles.mark, styles.markBad]}><Text style={styles.markText}>!</Text></View>
                <Text style={[styles.checkText, styles.flex]}>{b.message}</Text>
                <Pressable onPress={() => fix(b)} hitSlop={8} style={styles.fixCol}><Text style={styles.fix}>Fix →</Text></Pressable>
              </View>
            ))}
            <View style={styles.checkRow}>
              <View style={[styles.mark, receivedBy ? styles.markOk : styles.markBad]}>
                <Text style={styles.markText}>{receivedBy ? '✓' : '!'}</Text>
              </View>
              <Text style={[styles.checkText, styles.flex]}>
                {receivedBy
                  ? `Report received by ${receivedBy}${nextDate ? ` · next audit ${fmtDate(nextDate)}` : ''}`
                  : 'Enter who received the report (below)'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.rowBetween, styles.block]}>
          <Text style={[a.sub, styles.flex]}>Leave out areas that were never started</Text>
          <Switch
            value={excludeNotStarted}
            onValueChange={v => { setCheck(null); setExcludeNotStarted(v); }}
            trackColor={{ true: ag.greenBorder, false: colors.border }}
            thumbColor={excludeNotStarted ? ag.green : colors.surface}
          />
        </View>

        <Text style={a.section}>Sign-off</Text>
        <View style={[a.card, styles.block]}>
          <Text style={a.muted}>Auditor</Text>
          <Text style={a.strong}>{audit?.auditor?.name || '—'}</Text>
          <Text style={[a.muted, styles.gap]}>Escort person</Text>
          <Text style={a.strong}>{audit?.escort.name || '—'}{audit?.escort.designation ? ` (${audit.escort.designation})` : ''}</Text>
        </View>
        <Input label="Report received by (name)" required value={name} onChangeText={setName} maxLength={150} />
        <Input label="Designation" value={role} onChangeText={setRole} maxLength={100} />
        {/* Quick picks from the audit date; the date box below can set any other day. */}
        <ChipRow
          label="Next audit"
          options={NEXT_CHIPS}
          selected={audit ? NEXT_CHIPS.filter(c => nextDateFor(audit.auditDate, c.value) === nextDate).map(c => c.value) : []}
          onToggle={v => audit && setNextDate(nextDateFor(audit.auditDate, v))}
        />
        <DateField label="Next audit date" value={nextDate} onChange={setNextDate} />
        <Input label="Remarks" value={remarks} onChangeText={setRemarks} multiline maxLength={500} />
        <Text style={a.label}>Optional report pages</Text>
        <View style={[a.card, styles.block]}>
          {PAGES.map(([key, label]) => (
            <View key={key} style={styles.switchRow}>
              <Text style={[a.sub, styles.flex]}>{label}</Text>
              <Switch
                value={!!pages[key]}
                onValueChange={v => setPages(x => ({ ...x, [key]: v }))}
                trackColor={{ true: ag.greenBorder, false: colors.border }}
                thumbColor={pages[key] ? ag.green : colors.surface}
              />
            </View>
          ))}
        </View>

        {canSubmit ? <MessageBox tone="ok" title="Ready to submit" lines={['After submitting, the audit is locked.']} /> : null}
        {error ? <MessageBox tone="error" title={error} /> : null}
      </ScrollView>
      <BottomBar>
        <GreenButton label="Submit Audit" onPress={submit} loading={busy} disabled={!canSubmit} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  block: { marginBottom: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  // Icon, text and "Fix" all line up with the first line of text, so long items don't look uneven.
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 8 },
  checkText: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  mark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  fixCol: { width: 52, alignItems: 'flex-end' },
  markOk: { backgroundColor: ag.green },
  markBad: { backgroundColor: '#F59E0B' },
  markText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  fix: { color: ag.green, fontWeight: '700', lineHeight: 22 },
  gap: { marginTop: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xxs },
  doneWrap: { padding: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  doneBtn: { alignSelf: 'stretch', marginTop: spacing.sm },
  bigTick: { width: 96, height: 96, borderRadius: 48, backgroundColor: ag.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  bigTickText: { color: ag.green, fontSize: 48, fontWeight: '800' },
  doneTitle: { ...typography.title, color: colors.textPrimary, fontSize: 24 },
  doneSub: { ...typography.body, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
});

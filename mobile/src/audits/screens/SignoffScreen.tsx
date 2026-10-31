import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing } from '../../theme';
import { auditsApi, type Audit } from '../api';
import { BottomBar, ChipRow, DateField, GreenButton, Input, MessageBox, auditStyles as a } from '../ui';
import { addDays } from '../format';
import { ag } from '../theme';
import type { AuditsStackParamList } from '../AuditsNavigator';
import { useAuth } from '../../auth/AuthContext';

type Nav = NativeStackNavigationProp<AuditsStackParamList>;
type Route = RouteProp<AuditsStackParamList, 'Signoff'>;

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

/** Who received the report, next audit date, and which optional report pages to include. */
export function SignoffScreen() {
  const navigation = useNavigation<Nav>();
  const { auditId } = useRoute<Route>().params;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [pages, setPages] = useState<Record<string, boolean>>({ riskChain: true, riskByZone: true, priority: true, ipmCycle: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  useEffect(() => {
    auditsApi.get(auditId).then(data => {
      setAudit(data);
      // Not filled yet: the logged-in supervisor (can be changed).
      setName(data.signoff?.receivedByName || user?.name || '');
      setRole(data.signoff?.receivedByDesignation || '');
      setNextDate(data.signoff?.nextAuditDate || null);
      setRemarks(data.signoff?.remarks || '');
      if (data.reportOptions) setPages(p => ({ ...p, ...data.reportOptions }));
    }).catch(e => setError(e.message));
  }, [auditId]);

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Enter who received the report');
    setSaving(true);
    try {
      await auditsApi.saveSignoff(auditId, {
        receivedByName: name,
        receivedByDesignation: role,
        nextAuditDate: nextDate,
        remarks,
        reportOptions: pages,
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the sign-off');
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          options={NEXT_CHIPS.map(c => ({ value: c.value, label: c.label }))}
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
                onValueChange={v => setPages(p => ({ ...p, [key]: v }))}
                trackColor={{ true: ag.greenBorder, false: colors.border }}
                thumbColor={pages[key] ? ag.green : colors.surface}
              />
            </View>
          ))}
        </View>

        {error ? <MessageBox tone="error" title={error} /> : null}
      </ScrollView>
      <BottomBar>
        <GreenButton label="Save Sign-off" onPress={save} loading={saving} disabled={!audit} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  block: { marginBottom: spacing.md },
  gap: { marginTop: spacing.sm },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xxs },
});

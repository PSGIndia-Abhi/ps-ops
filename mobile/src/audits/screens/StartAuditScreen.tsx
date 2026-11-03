import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing } from '../../theme';
import { auditsApi, newId, type Audit, type Lookups, type SiteOption } from '../api';
import { AUDIT_TYPE_LABEL, addDays, titleCase, todayIso } from '../format';
import { BottomBar, ChipRow, DateField, GreenButton, Input, MessageBox, PickerSheet, SelectField, auditStyles as a } from '../ui';
import { ag } from '../theme';
import type { AuditsStackParamList } from '../AuditsNavigator';

type Nav = NativeStackNavigationProp<AuditsStackParamList>;
type Route = RouteProp<AuditsStackParamList, 'StartAudit'>;

/** Selected chips get a tick, as in the design. */
const tick = (label: string, on: boolean) => (on ? `${label} ✓` : label);

/**
 * Start an audit: customer/site, date, types, site contact. The signed-in supervisor is the auditor.
 * With an auditId it edits that audit's details instead (the customer / site stays fixed).
 */
export function StartAuditScreen() {
  const navigation = useNavigation<Nav>();
  const editId = useRoute<Route>().params?.auditId;
  const [editing, setEditing] = useState<Audit | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [query, setQuery] = useState('');
  const [site, setSite] = useState<SiteOption | null>(null);
  const [suggested, setSuggested] = useState<{ fromAuditNumber: string | null; areas: { areaName: string; zoneName: string | null }[] } | null>(null);
  const [copyAreas, setCopyAreas] = useState(true);
  const [auditDate, setAuditDate] = useState(todayIso());
  const [dateMode, setDateMode] = useState<'today' | 'tomorrow' | 'pick'>('today');
  // One or more audit types (e.g. General Pest Control + Rodent).
  const [auditTypes, setAuditTypes] = useState<string[]>(['PRE_SALE']);
  // "Other" audit type: the supervisor types what it is; it is sent instead of the OTHER code.
  const [otherType, setOtherType] = useState('');
  const otherTypeOn = auditTypes.includes('OTHER');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A new error scrolls the form to the top, where the message is shown.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [error]);

  useEffect(() => {
    auditsApi.lookups().then(setLookups).catch(e => setError(e.message));
  }, []);

  useLayoutEffect(() => {
    if (editId) navigation.setOptions({ title: 'Edit audit details' });
  }, [editId, navigation]);

  // Edit: fill the form from the audit once the lookups (known types) are loaded.
  useEffect(() => {
    if (!editId || !lookups) return;
    auditsApi.get(editId).then(x => {
      setEditing(x);
      setAuditDate(x.auditDate);
      setDateMode(x.auditDate === todayIso() ? 'today' : x.auditDate === addDays(todayIso(), 1) ? 'tomorrow' : 'pick');
      const types = String(x.auditType || '').split(',').map(t => t.trim()).filter(Boolean);
      const knownTypes = types.filter(t => lookups.auditTypes.includes(t) && t !== 'OTHER');
      const customType = types.find(t => !knownTypes.includes(t));
      setAuditTypes([...knownTypes, ...(customType ? ['OTHER'] : [])]);
      setOtherType(customType ? (AUDIT_TYPE_LABEL[customType] || customType).slice(0, 20) : '');
      setContactName(x.escort.name || '');
      setContactRole(x.escort.designation || '');
      setContactPhone(x.escort.contact || '');
    }).catch(e => setError(e.message));
  }, [editId, lookups]);

  useEffect(() => {
    if (editId) return undefined;
    const t = setTimeout(() => {
      auditsApi.siteOptions(query).then(r => setSites(r.items)).catch(e => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [query, editId]);

  function chooseSite(s: SiteOption) {
    setSite(s);
    setSuggested(null);
    auditsApi.areaSuggestions(s.siteId).then(setSuggested).catch(() => setSuggested(null));
  }

  async function start() {
    setError(null);
    if (!site && !editId) return setError('Choose the customer / site');
    if (!auditTypes.length) return setError('Choose at least one audit type');
    if (otherTypeOn && !otherType.trim()) return setError('Type the other audit type');
    setSaving(true);
    const details = {
      auditDate,
      auditType: [...auditTypes.filter(t => t !== 'OTHER'), ...(otherTypeOn ? [otherType.trim()] : [])],
      escortName: contactName,
      escortDesignation: contactRole,
      escortContact: contactPhone,
    };
    if (editId) {
      if (!editing) return setSaving(false);
      try {
        await auditsApi.update(editId, { rowVersion: editing.rowVersion, ...details });
        navigation.goBack();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the changes');
        setSaving(false);
      }
      return;
    }
    if (!site) return setSaving(false);
    try {
      const areas = copyAreas && suggested?.areas.length
        ? suggested.areas.map((x, i) => ({ id: newId(), areaNumber: i + 1, areaName: x.areaName, zoneName: x.zoneName }))
        : [];
      const created = await auditsApi.create({
        companyId: site.companyId,
        siteId: site.siteId,
        ...details,
        areas,
      });
      navigation.replace('AuditAreas', { auditId: created.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the audit');
      setSaving(false);
    }
  }

  const siteLabel = (s: SiteOption) => `${s.companyName}${s.siteName && s.siteName !== s.companyName ? ` — ${s.siteName}` : ''}`;

  return (
    <View style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Errors at the top, where the screen scrolls to. */}
        {error ? <MessageBox tone="error" title={error} /> : null}
        {editId ? (
          <View style={styles.fixedSite}>
            <Text style={a.muted}>Customer / Site</Text>
            <Text style={styles.bold}>{editing ? editing.company.name : 'Loading…'}</Text>
            {editing ? <Text style={a.muted} numberOfLines={2}>{[editing.site.name, editing.site.address].filter(Boolean).join(', ')}</Text> : null}
          </View>
        ) : null}
        {editId ? null : <SelectField
          label="Customer / Site"
          required
          value={site ? `🔍  ${siteLabel(site)}` : null}
          placeholder="🔍  Search customer or site"
          onPress={() => setPicker(true)}
        />}
        {!editId && site?.siteAddress ? <Text style={[a.muted, styles.below]} numberOfLines={2}>{site.siteAddress}</Text> : null}
        {!editId && suggested?.areas.length ? (
          <Pressable onPress={() => setCopyAreas(v => !v)} style={[styles.tip, !copyAreas && styles.tipOff]}>
            <Text style={[styles.tipText, !copyAreas && styles.tipTextOff]}>
              ↺ Last audit had {suggested.areas.length} area{suggested.areas.length === 1 ? '' : 's'} —{' '}
              <Text style={styles.bold}>{copyAreas ? 'copy them? ✓' : 'tap to copy them'}</Text>
            </Text>
          </Pressable>
        ) : null}

        <ChipRow
          label="Audit date *"
          options={[{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'pick', label: '📅 Pick date' }]}
          selected={[dateMode]}
          onToggle={m => {
            setDateMode(m);
            if (m === 'today') setAuditDate(todayIso());
            if (m === 'tomorrow') setAuditDate(addDays(todayIso(), 1));
          }}
        />
        {dateMode === 'pick' ? <DateField label="Pick the audit date" value={auditDate} onChange={setAuditDate} /> : null}

        <ChipRow
          label="Audit type * (choose any)"
          options={(lookups?.auditTypes || ['ROUTINE']).map(t => ({
            value: t,
            label: t === 'OTHER'
              ? (otherTypeOn ? 'Other ✓' : '＋ Other')
              : tick(AUDIT_TYPE_LABEL[t] || titleCase(t), auditTypes.includes(t)),
          }))}
          selected={auditTypes}
          onToggle={t => setAuditTypes(list => (list.includes(t) ? list.filter(x => x !== t) : [...list, t]))}
        />
        {otherTypeOn ? (
          <Input label="Other audit type" required value={otherType} onChangeText={setOtherType} placeholder="e.g. Fumigation" maxLength={20} />
        ) : null}
        <Input label="Escort person (Optional)" value={contactName} onChangeText={setContactName} placeholder="Name" maxLength={150} />
        <Input label="Designation (Optional)" value={contactRole} onChangeText={setContactRole} placeholder="e.g. Facility Manager" maxLength={100} />
        <Input label="Contact number (Optional)" value={contactPhone} onChangeText={setContactPhone} placeholder="e.g. 98765 43210" keyboardType="phone-pad" maxLength={20} />


      </ScrollView>

      <BottomBar>
        <GreenButton label={editId ? 'Save changes' : 'Start Audit →'} onPress={start} loading={saving} />
      </BottomBar>

      <PickerSheet
        visible={picker}
        title="Customer / Site"
        options={sites.map(s => ({ value: s.siteId, label: siteLabel(s), sub: s.siteAddress }))}
        selected={site ? [site.siteId] : []}
        onSelect={v => {
          const s = sites.find(x => x.siteId === v);
          if (s) chooseSite(s);
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
        searchable
        onSearch={setQuery}
        emptyText="No active customers found in your area"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  bold: { fontWeight: '700', color: colors.textPrimary },
  below: { marginTop: -spacing.sm, marginBottom: spacing.sm },
  fixedSite: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, gap: 2, marginBottom: spacing.md },
  tip: { borderWidth: 1, borderStyle: 'dashed', borderColor: ag.green, backgroundColor: ag.greenSofter, borderRadius: 10, padding: spacing.sm, marginBottom: spacing.md },
  tipOff: { borderColor: colors.border, backgroundColor: colors.surface },
  tipText: { color: ag.greenDark, fontSize: 13 },
  tipTextOff: { color: colors.textSecondary },
});

import React, { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { CloseIcon, DocumentIcon, PlusIcon } from '../../components/icons';
import { CheckIcon } from '../../crm/ui/crmIcons';
import { formatINR } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { SelectField } from '../../crm/ui/SelectField';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import * as quote from '../quotation';
import { QuotationPdfDialog, SendQuotationDialog } from '../QuotationDialogs';
import type { Billing, MasterPlan, MasterService, QuoteMaster, TreatmentRow } from '../quotation';
import { errorMessage, FieldRow, LeadButton, LeadScreen, LeadTopBar, useLoad } from '../ui';

/**
 * Build a quotation from the quotation master - the phone version of the web's Create Quotation.
 * One page of numbered sections (customer, services, price, details, discount, terms) with the
 * total and the Preview / Save & send buttons pinned to the bottom. The server draws the PDF and
 * checks everything again.
 */

type Nav = NativeStackNavigationProp<LeadStackParamList>;
type Pick = { planId: string; price: string; rows: TreatmentRow[]; open: boolean };

const BLANK_ROW: TreatmentRow = { defense_area: '', material_used: '', treatment_area: '', frequency: '' };
const ROW_KEYS: (keyof TreatmentRow)[] = ['defense_area', 'material_used', 'treatment_area', 'frequency'];
const PER: Record<Billing, string> = { MONTHLY: '/ month', YEARLY: '/ year', ONE_TIME: 'one-time' };
const MAIN_WORD: Record<Billing, string> = { MONTHLY: 'monthly', YEARLY: 'yearly (AMC)', ONE_TIME: 'one-time' };

const joinNames = (names: string[]) => (names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const defaultSubject = (names: string[], customer: string) =>
  `Proposal, recommendation and treatment method for ${joinNames(names) || 'pest control'} at your ${customer ? `${customer} ` : ''}premises.`;
const digits = (v: string) => v.replace(/[^\d.]/g, '');

export function LeadQuoteBuilderScreen() {
  const navigation = useNavigation<Nav>();
  const { leadId, name } = useRoute<RouteProp<LeadStackParamList, 'LeadQuoteBuild'>>().params;
  const { styles, theme } = useCrmStyles(factory);

  const loader = useCallback(async () => {
    const [master, lead] = await Promise.all([quote.getQuoteMaster(), api.getLead(leadId)]);
    return { master, lead };
  }, [leadId]);
  const { data, loading, error, reload } = useLoad(loader, 'Could not load the quotation master.');

  if (loading && !data) {
    return (
      <LeadScreen edges={['top', 'bottom']}>
        <LeadTopBar title="New quotation" subtitle={name} onBack={() => navigation.goBack()} icon="close" />
        <View style={styles.body}>
          <CrmSkeleton height={120} radius={radii.xl} style={{ marginBottom: spacing.md }} />
          <CrmSkeleton height={220} radius={radii.xl} style={{ marginBottom: spacing.md }} />
          <CrmSkeleton height={160} radius={radii.xl} />
        </View>
      </LeadScreen>
    );
  }
  if (!data) {
    return (
      <LeadScreen edges={['top', 'bottom']}>
        <LeadTopBar title="New quotation" subtitle={name} onBack={() => navigation.goBack()} icon="close" />
        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />
        </View>
      </LeadScreen>
    );
  }
  return (
    <Builder
      leadId={leadId}
      master={data.master}
      initial={{ name: data.lead.companyName || name, address: data.lead.address || '', phone: data.lead.phone || '' }}
      asked={data.lead.services}
      theme={theme}
    />
  );
}

/**
 * A service as it starts on the quotation: its treatment rows from the master, on the cheapest
 * monthly plan the price chart offers (else the first priced plan), every row on that plan.
 */
function startPick(service: MasterService, plans: QuoteMaster['plans'], perService: boolean): Pick {
  const priced = plans.filter((p) => service.prices.some((x) => x.plan_id === p.id));
  const first = priced.find((p) => p.billing === 'MONTHLY') || priced[0];
  const price = first ? service.prices.find((x) => x.plan_id === first.id)?.price : undefined;
  const frequency = perService ? first?.name || '' : '';
  return {
    planId: first?.id || '',
    price: price !== undefined ? String(price) : '',
    rows: service.treatments.length ? service.treatments.map((t) => ({ ...t, frequency: frequency || t.frequency })) : [{ ...BLANK_ROW, frequency }],
    open: false,
  };
}

function Builder({
  leadId,
  master,
  initial,
  asked,
  theme,
}: {
  leadId: string;
  master: QuoteMaster;
  initial: { name: string; address: string; phone: string };
  /** The services the customer asked for on the lead (master ids) - ticked to start with. */
  asked: string[];
  theme: CrmTheme;
}) {
  const navigation = useNavigation<Nav>();
  const { styles } = useCrmStyles(factory);

  const [customer, setCustomer] = useState(initial);
  const [editCustomer, setEditCustomer] = useState(false);
  const [order, setOrder] = useState<string[]>(() => asked.filter((id) => master.services.some((s) => s.id === id)));
  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(
      master.services.filter((s) => asked.includes(s.id)).map((s) => [s.id, startPick(s, master.plans, true)]),
    ),
  );
  const [mode, setMode] = useState<'PER_SERVICE' | 'PACKAGE'>('PER_SERVICE');
  const [pkg, setPkg] = useState({ amount: '', billing: 'MONTHLY' as Billing, planLabel: '', description: '' });
  const [subject, setSubject] = useState('');
  const [subjectEdited, setSubjectEdited] = useState(false);
  const [validDays, setValidDays] = useState('30');
  const [contractMonths, setContractMonths] = useState('12');
  const [revised, setRevised] = useState(false);
  const [discount, setDiscount] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<{ VALUE_ADDED: string[]; TERMS: string[] }>({ VALUE_ADDED: [], TERMS: [] });
  const [rowEdit, setRowEdit] = useState<{ serviceId: string; index: number | null; row: TreatmentRow } | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'send'>('');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [askSend, setAskSend] = useState<quote.QuotationContent | null>(null); // "Save and send?" open
  const [sent, setSent] = useState<{ id: string; number: string; name: string } | null>(null); // just saved

  const serviceById = useMemo(() => new Map(master.services.map((s) => [s.id, s])), [master]);
  const planById = useMemo(() => new Map(master.plans.map((p) => [p.id, p])), [master]);
  const frequencyNames = useMemo(() => master.plans.map((p) => p.name), [master]);
  const pickedNames = order.map((id) => serviceById.get(id)?.name || '').filter(Boolean);
  const shownSubject = subjectEdited ? subject : defaultSubject(pickedNames, customer.name.trim());

  // ---- totals (the same rules as the server)
  const totals = useMemo(() => {
    if (mode === 'PACKAGE') {
      const a = Number(pkg.amount) || 0;
      return { MONTHLY: pkg.billing === 'MONTHLY' ? a : 0, YEARLY: pkg.billing === 'YEARLY' ? a : 0, ONE_TIME: pkg.billing === 'ONE_TIME' ? a : 0 };
    }
    const t = { MONTHLY: 0, YEARLY: 0, ONE_TIME: 0 };
    for (const id of order) {
      const p = picks[id];
      const plan = planById.get(p.planId);
      t[plan?.billing ?? 'MONTHLY'] += Number(p.price) || 0;
    }
    return t;
  }, [mode, pkg, order, picks, planById]);
  const mainBilling: Billing = totals.MONTHLY > 0 ? 'MONTHLY' : totals.YEARLY > 0 ? 'YEARLY' : 'ONE_TIME';
  const mainTotal = totals[mainBilling];
  const discountValue = Number(discount) || 0;
  const finalTotal = Math.max(0, mainTotal - discountValue);
  const otherTotals = (['YEARLY', 'ONE_TIME'] as Billing[]).filter((b) => b !== mainBilling && totals[b] > 0);

  // ---- services
  function toggleService(service: MasterService) {
    if (picks[service.id]) return removeService(service.id);
    setPicks((all) => ({ ...all, [service.id]: startPick(service, master.plans, mode === 'PER_SERVICE') }));
    setOrder((o) => [...o, service.id]);
  }
  function removeService(id: string) {
    setPicks((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
    setOrder((o) => o.filter((x) => x !== id));
  }
  const updatePick = (id: string, patch: Partial<Pick>) => setPicks((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
  function choosePlan(service: MasterService, planId: string) {
    const plan = planById.get(planId);
    const price = service.prices.find((x) => x.plan_id === planId)?.price;
    const p = picks[service.id];
    // The price comes from the chart (0 when this plan has none); every row's frequency follows the plan.
    updatePick(service.id, { planId, price: price !== undefined ? String(price) : '0', rows: plan ? p.rows.map((r) => ({ ...r, frequency: plan.name })) : p.rows });
  }
  function saveRow(row: TreatmentRow) {
    if (!rowEdit) return;
    const p = picks[rowEdit.serviceId];
    const rows = rowEdit.index === null ? [...p.rows, row] : p.rows.map((r, i) => (i === rowEdit.index ? row : r));
    updatePick(rowEdit.serviceId, { rows });
    setRowEdit(null);
  }
  // Delete straight from the row list (asks first; a service keeps at least one row).
  function deleteRowAt(serviceId: string, index: number) {
    const p = picks[serviceId];
    if (p.rows.length === 1) {
      return setConfirm({ kind: 'info', title: 'Keep one row', message: 'A service needs at least one treatment row. Remove the service instead.' });
    }
    setConfirm({
      kind: 'delete',
      title: 'Delete this row?',
      name: p.rows[index].defense_area || 'This row',
      message: 'It will be removed from this quotation only. The master stays the same.',
      onConfirm: () => updatePick(serviceId, { rows: picks[serviceId].rows.filter((_, i) => i !== index) }),
    });
  }
  function deleteRow() {
    if (!rowEdit || rowEdit.index === null) return setRowEdit(null);
    const p = picks[rowEdit.serviceId];
    if (p.rows.length === 1) return Alert.alert('Keep one row', 'A service needs at least one treatment row. Remove the service instead.');
    updatePick(rowEdit.serviceId, { rows: p.rows.filter((_, i) => i !== rowEdit.index) });
    setRowEdit(null);
  }

  // ---- the request body, or what is missing
  function build(): { content?: quote.QuotationContent; problem?: string } {
    if (customer.name.trim().length < 2) return { problem: 'Enter the customer name.' };
    if (!order.length) return { problem: 'Tick at least one service.' };
    const services: quote.QuotationContent['services'] = [];
    for (const id of order) {
      const s = serviceById.get(id)!;
      const p = picks[id];
      const rows = p.rows.filter((r) => ROW_KEYS.some((k) => r[k].trim()));
      if (!rows.length) return { problem: `${s.name}: add at least one treatment row.` };
      if (rows.some((r) => ROW_KEYS.some((k) => !r[k].trim()))) return { problem: `${s.name}: a treatment row is not complete. Tap it to fill every field.` };
      const plan = planById.get(p.planId);
      if (mode === 'PER_SERVICE') {
        if (!plan) return { problem: `${s.name}: choose a plan.` };
        if (p.price === '' || !(Number(p.price) >= 0)) return { problem: `${s.name}: enter the price.` };
      }
      services.push({
        name: s.name,
        plan: plan?.name || '',
        billing: plan?.billing || 'MONTHLY',
        price: mode === 'PER_SERVICE' ? Number(p.price) : null,
        rows: rows.map((r) => ({ defense_area: r.defense_area.trim(), material_used: r.material_used.trim(), treatment_area: r.treatment_area.trim(), frequency: r.frequency.trim() })),
      });
    }
    if (mode === 'PACKAGE' && !(Number(pkg.amount) > 0)) return { problem: 'Enter the package amount.' };
    if (mainTotal <= 0) return { problem: 'The total must be more than zero.' };
    if (discountValue > 0 && discountValue >= mainTotal) return { problem: `The discount must be less than the total (${formatINR(mainTotal)} ${PER[mainBilling]}).` };
    if (shownSubject.trim().length < 5) return { problem: 'Enter the subject.' };
    const picked = (kind: 'VALUE_ADDED' | 'TERMS') => master.clauses.filter((c) => c.kind === kind && (c.is_default || checked.has(c.id))).map((c) => c.text);
    return {
      content: {
        customer: { name: customer.name.trim(), address: customer.address.trim(), attention: '', phone: customer.phone.trim() },
        subject: shownSubject.trim(),
        revised,
        validDays: Number(validDays) || 30,
        contractMonths: Number(contractMonths) || 12,
        discount: discountValue,
        services,
        pricing:
          mode === 'PACKAGE'
            ? { mode, amount: Number(pkg.amount), billing: pkg.billing, planLabel: pkg.planLabel.trim(), description: pkg.description.trim() }
            : { mode },
        valueAdded: [...picked('VALUE_ADDED'), ...extra.VALUE_ADDED],
        terms: [...picked('TERMS'), ...extra.TERMS],
      },
    };
  }

  async function onPreview() {
    const { content, problem: p } = build();
    if (!content) return setProblem(p || null);
    setProblem(null);
    setBusy('preview');
    try {
      const file = await quote.previewQuotationPdf(leadId, content);
      await quote.openPdf(file);
    } catch (err) {
      setProblem(errorMessage(err, 'Could not make the preview. Check your connection and try again.'));
    } finally {
      setBusy('');
    }
  }

  function onSend() {
    const { content, problem: p } = build();
    if (!content) return setProblem(p || null);
    setProblem(null);
    setAskSend(content);
  }

  async function send(content: quote.QuotationContent) {
    setBusy('send');
    try {
      const q = await quote.generateQuotation(leadId, content);
      setBusy('');
      // Done / Open PDF on this card go back to the lead.
      setSent({ id: q.id, number: q.number, name: content.customer.name });
    } catch (err) {
      setBusy('');
      setProblem(errorMessage(err, 'Could not save the quotation. Check your connection and try again.'));
    }
  }

  const optionalClauses = (kind: 'VALUE_ADDED' | 'TERMS') => master.clauses.filter((c) => c.kind === kind && !c.is_default);

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <LeadTopBar title="New quotation" subtitle={initial.name} onBack={() => navigation.goBack()} icon="close" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* 1. Customer */}
          <Section no={1} title="Customer" action={{ label: editCustomer ? 'Done' : 'Edit', onPress: () => setEditCustomer((v) => !v) }}>
            {editCustomer ? (
              <>
                <CrmTextField label="Customer / company name" value={customer.name} onChangeText={(v) => setCustomer({ ...customer, name: v })} maxLength={150} />
                <CrmTextField label="Address" value={customer.address} onChangeText={(v) => setCustomer({ ...customer, address: v })} multiline maxLength={400} />
                <CrmTextField label="Phone" value={customer.phone} onChangeText={(v) => setCustomer({ ...customer, phone: v })} keyboardType="phone-pad" maxLength={30} />
              </>
            ) : (
              <View>
                <Text style={styles.customerName}>{customer.name || 'Customer name'}</Text>
                {!!customer.address && <Text style={styles.muted}>{customer.address}</Text>}
                {!!customer.phone && <Text style={styles.muted}>{customer.phone}</Text>}
              </View>
            )}
          </Section>

          {/* 2. Services */}
          <Section no={2} title="Services">
            {/* A two-column grid of equal tiles, each with a tick circle */}
            <View style={styles.tiles}>
              {master.services.map((s) => {
                const on = !!picks[s.id];
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => toggleService(s)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && styles.pressed]}
                  >
                    <View style={[styles.tick, on && styles.tickOn]}>{on && <CheckIcon size={12} color="#fff" />}</View>
                    <Text style={[styles.tileText, on && styles.tileTextOn]} numberOfLines={2}>
                      {s.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {order.map((id) => {
              const s = serviceById.get(id)!;
              const p = picks[id];
              const plan = planById.get(p.planId);
              const priced = new Set(s.prices.map((x) => x.plan_id));
              const noPrice = mode === 'PER_SERVICE' && !!plan && !priced.has(plan.id);
              return (
                <View key={id} style={styles.serviceCard}>
                  <View style={styles.serviceHead}>
                    <View style={styles.serviceIcon}>
                      <DocumentIcon size={16} color={theme.primary} />
                    </View>
                    <Text style={styles.serviceName} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Pressable onPress={() => removeService(id)} hitSlop={10} accessibilityLabel={`Remove ${s.name}`} style={styles.iconButton}>
                      <CloseIcon size={16} color={theme.textMuted} />
                    </Pressable>
                  </View>

                  {mode === 'PER_SERVICE' && (
                    <View style={styles.planRow}>
                      <View style={styles.planCell}>
                      <SelectField
                        label="Plan"
                        placeholder="Choose plan"
                        sheetTitle={`Plan for ${s.name}`}
                        value={p.planId || null}
                        options={master.plans.map((pl: MasterPlan) => ({ value: pl.id, label: priced.has(pl.id) ? pl.name : `${pl.name} (no price)` }))}
                        onChange={(v) => choosePlan(s, v)}
                      />
                      </View>
                      <View style={styles.priceCell}>
                        <CrmTextField
                          label={`Price ${plan ? PER[plan.billing] : ''}`}
                          value={p.price}
                          onChangeText={(v) => updatePick(id, { price: digits(v) })}
                          prefix="₹"
                          keyboardType="decimal-pad"
                          error={noPrice ? ' ' : null}
                        />
                      </View>
                    </View>
                  )}
                  {noPrice && <Text style={styles.warn}>No price in the master for {plan!.name}. Enter the price.</Text>}

                  <Pressable onPress={() => updatePick(id, { open: !p.open })} style={styles.rowsToggle} accessibilityRole="button">
                    <Text style={styles.rowsToggleText}>
                      {p.rows.length} treatment row{p.rows.length === 1 ? '' : 's'}
                    </Text>
                    <Text style={styles.link}>{p.open ? 'Hide' : 'View & edit'}</Text>
                  </Pressable>
                  {p.open && (
                    <View style={styles.rows}>
                      {p.rows.map((r, i) => (
                        // Defence area with its frequency underneath; edit / delete right on the row.
                        <View key={i} style={styles.row}>
                          <View style={styles.rowText}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                              {r.defense_area || 'New row - tap edit to fill in'}
                            </Text>
                            {!!r.frequency && (
                              <View style={styles.freqLine}>
                                <View style={styles.freqDot} />
                                <Text style={styles.freqText}>{r.frequency}</Text>
                              </View>
                            )}
                          </View>
                          <Pressable
                            onPress={() => setRowEdit({ serviceId: id, index: i, row: { ...r } })}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${r.defense_area || 'row'}`}
                            style={({ pressed }) => [styles.rowIcon, styles.rowIconEdit, pressed && styles.pressed]}
                          >
                            <PencilIcon size={16} color={theme.primary} />
                          </Pressable>
                          <Pressable
                            onPress={() => deleteRowAt(id, i)}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${r.defense_area || 'row'}`}
                            style={({ pressed }) => [styles.rowIcon, styles.rowIconDelete, pressed && styles.pressed]}
                          >
                            <TrashIcon size={16} color={theme.danger} />
                          </Pressable>
                        </View>
                      ))}
                      <Pressable
                        onPress={() => setRowEdit({ serviceId: id, index: null, row: { ...BLANK_ROW, frequency: plan?.name || '' } })}
                        style={styles.addRow}
                        accessibilityRole="button"
                      >
                        <PlusIcon size={14} color={theme.primary} />
                        <Text style={styles.link}>Add row</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </Section>

          {/* 3. Price */}
          <Section no={3} title="Price">
            <SegmentedControl
              options={[
                { value: 'PER_SERVICE', label: 'Per service' },
                { value: 'PACKAGE', label: 'One package' },
              ]}
              value={mode}
              onChange={(v) => setMode(v as 'PER_SERVICE' | 'PACKAGE')}
            />
            {mode === 'PACKAGE' && (
              <View style={{ marginTop: spacing.md }}>
                <CrmTextField label="Package amount" value={pkg.amount} onChangeText={(v) => setPkg({ ...pkg, amount: digits(v) })} prefix="₹" keyboardType="decimal-pad" placeholder="e.g. 158000" />
                <SegmentedControl
                  options={[
                    { value: 'MONTHLY', label: 'Per month' },
                    { value: 'YEARLY', label: 'Per year' },
                    { value: 'ONE_TIME', label: 'One-time' },
                  ]}
                  value={pkg.billing}
                  onChange={(v) => setPkg({ ...pkg, billing: v as Billing })}
                />
                <View style={{ height: spacing.md }} />
                <CrmTextField label="Plan shown on the quotation (optional)" value={pkg.planLabel} onChangeText={(v) => setPkg({ ...pkg, planLabel: v })} placeholder="e.g. Daily, on-site team" maxLength={80} />
              </View>
            )}
          </Section>

          {/* 4. Details */}
          <Section no={4} title="Proposal details">
            <CrmTextField
              label="Subject"
              value={shownSubject}
              onChangeText={(v) => {
                setSubjectEdited(true);
                setSubject(v);
              }}
              multiline
              maxLength={300}
            />
            <FieldRow>
              <CrmTextField label="Valid for (days)" value={validDays} onChangeText={(v) => setValidDays(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
              <CrmTextField label="Contract (months)" value={contractMonths} onChangeText={(v) => setContractMonths(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
            </FieldRow>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>This is a revised proposal</Text>
              <Switch value={revised} onValueChange={setRevised} trackColor={{ true: theme.primary, false: theme.border }} thumbColor="#fff" />
            </View>
          </Section>

          {/* 5. Discount */}
          <Section no={5} title="Discount">
            <CrmTextField
              label={mainTotal > 0 ? `Special discount (off the ${MAIN_WORD[mainBilling]} total)` : 'Special discount'}
              value={discount}
              onChangeText={(v) => setDiscount(digits(v))}
              prefix="₹"
              keyboardType="decimal-pad"
              placeholder="e.g. 500"
            />
            {mainTotal > 0 && (
              <View style={styles.summary}>
                <View style={styles.sumLine}>
                  <Text style={styles.muted}>Subtotal</Text>
                  <Struck on={discountValue > 0} style={styles.sumOld}>
                    {`${formatINR(mainTotal)} ${PER[mainBilling]}`}
                  </Struck>
                </View>
                {discountValue > 0 && (
                  <View style={[styles.discountBar, discountValue >= mainTotal && { backgroundColor: theme.danger }]}>
                    <Text style={styles.discountLabel}>SPECIAL DISCOUNT</Text>
                    <Text style={styles.discountValue}>- {formatINR(discountValue)}</Text>
                  </View>
                )}
                <View style={[styles.sumLine, styles.sumFinal]}>
                  <Text style={styles.finalLabel}>Final amount</Text>
                  <Text style={styles.finalValue}>
                    {formatINR(finalTotal)} <Text style={styles.finalPer}>{PER[mainBilling]}</Text>
                  </Text>
                </View>
              </View>
            )}
          </Section>

          {/* 6. Terms */}
          <Section no={6} title="Terms">
            {(['VALUE_ADDED', 'TERMS'] as const).map((kind) => (
              <View key={kind} style={{ marginBottom: spacing.md }}>
                <Text style={styles.groupLabel}>{kind === 'VALUE_ADDED' ? 'Value added services' : 'Terms & conditions'}</Text>
                {optionalClauses(kind).map((c) => {
                  const on = checked.has(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() =>
                        setChecked((s) => {
                          const n = new Set(s);
                          if (on) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      style={styles.checkRow}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <View style={[styles.box, on && styles.boxOn]}>{on && <CheckIcon size={12} color="#fff" />}</View>
                      <Text style={styles.checkText}>{c.text}</Text>
                    </Pressable>
                  );
                })}
                {extra[kind].map((t, i) => (
                  <View key={`${kind}${i}`} style={styles.checkRow}>
                    <View style={[styles.box, styles.boxOn]}>
                      <CheckIcon size={12} color="#fff" />
                    </View>
                    <Text style={styles.checkText}>{t}</Text>
                    <Pressable onPress={() => setExtra((e) => ({ ...e, [kind]: e[kind].filter((_, j) => j !== i) }))} hitSlop={10}>
                      <CloseIcon size={14} color={theme.textMuted} />
                    </Pressable>
                  </View>
                ))}
                <AddLine onAdd={(t) => setExtra((e) => ({ ...e, [kind]: [...e[kind], t] }))} />
              </View>
            ))}
          </Section>

          <Pressable onPress={() => navigation.replace('LeadQuote', { leadId, name: initial.name, amount: 0 })} style={styles.uploadLink} accessibilityRole="link">
            <Text style={styles.muted}>Have a PDF already? </Text>
            <Text style={styles.link}>Upload it instead</Text>
          </Pressable>
        </ScrollView>

        {/* pinned: the total and the two buttons */}
        <View style={styles.footer}>
          {!!problem && <Text style={styles.problem}>{problem}</Text>}
          <View style={styles.footerTotals}>
            {mainTotal > 0 ? (
              <>
                {discountValue > 0 && (
                  <Struck on style={styles.footerOld}>
                    {formatINR(mainTotal)}
                  </Struck>
                )}
                <Text style={styles.footerTotal}>
                  {formatINR(finalTotal)} <Text style={styles.finalPer}>{PER[mainBilling]}</Text>
                </Text>
                {otherTotals.map((b) => (
                  <Text key={b} style={styles.footerOther}>
                    + {formatINR(totals[b])} {PER[b]}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={styles.muted}>Pick services to see the total</Text>
            )}
          </View>
          <View style={styles.footerButtons}>
            <LeadButton label="Preview" variant="secondary" onPress={onPreview} loading={busy === 'preview'} disabled={!!busy} style={{ flex: 1 }} />
            <LeadButton label="Save & send" onPress={onSend} loading={busy === 'send'} disabled={!!busy} style={{ flex: 1.4 }} />
          </View>
        </View>
      </KeyboardAvoidingView>

      {confirm && (
        <ConfirmCard
          state={confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            confirm.onConfirm?.();
            setConfirm(null);
          }}
        />
      )}

      {askSend && (
        <SendQuotationDialog
          name={askSend.customer.name}
          onCancel={() => setAskSend(null)}
          onSend={() => {
            const content = askSend;
            setAskSend(null);
            send(content);
          }}
        />
      )}

      {sent && (
        <QuotationPdfDialog
          saved
          name={sent.name}
          getFile={() => quote.savedQuotationPdf(leadId, sent.id, sent.number)}
          onOpened={() => navigation.goBack()}
          onClose={() => navigation.goBack()}
        />
      )}

      {rowEdit && (
        <RowEditor
          row={rowEdit.row}
          isNew={rowEdit.index === null}
          frequencies={frequencyNames}
          onSave={saveRow}
          onDelete={deleteRow}
          onClose={() => setRowEdit(null)}
        />
      )}
    </LeadScreen>
  );
}

/** A numbered section card. */
function Section({ no, title, hint, action, children }: { no: number; title: string; hint?: string; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionNo}>
          <Text style={styles.sectionNoText}>{no}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!action && (
          <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
            <Text style={styles.link}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
      {children}
    </View>
  );
}

/**
 * The old amount, crossed out when a discount applies. Android does not draw textDecorationLine here,
 * so the line is drawn over the text, placed from the text's measured layout: through the middle of
 * the digits (baseline minus half the cap height) and as wide as the text.
 */
function Struck({ on, style, children }: { on: boolean; style: object; children: string }) {
  const { theme } = useCrmStyles(factory);
  const [line, setLine] = useState<{ top: number; width: number } | null>(null);
  return (
    <View>
      <Text
        style={style}
        onTextLayout={(e) => {
          const l = e.nativeEvent.lines[0];
          if (l) setLine({ top: l.y + l.ascender - l.capHeight / 2, width: l.width });
        }}
      >
        {children}
      </Text>
      {on && !!line && (
        <View pointerEvents="none" style={{ position: 'absolute', left: -1, top: line.top - 0.75, width: line.width + 2, height: 1.5, backgroundColor: theme.textMuted }} />
      )}
    </View>
  );
}

type ConfirmState = { kind: 'delete' | 'info'; title: string; message: string; name?: string; onConfirm?: () => void };

/**
 * The screen's own confirm dialog (instead of the plain Android alert): an icon in a soft circle,
 * a bold title, the row's name in a chip, a short message and two full-width buttons.
 */
function ConfirmCard({ state, onClose, onConfirm }: { state: ConfirmState; onClose: () => void; onConfirm: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const del = state.kind === 'delete';
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.confirmShade} onPress={onClose}>
        <Pressable style={styles.confirmCard} onPress={() => undefined}>
          <View style={[styles.confirmIcon, { backgroundColor: del ? theme.dangerBg : theme.primarySoftBg }]}>
            {del ? <TrashIcon size={26} color={theme.danger} /> : <DocumentIcon size={26} color={theme.primary} />}
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          {!!state.name && (
            <View style={styles.confirmChip}>
              <Text style={styles.confirmChipText} numberOfLines={2}>
                {state.name}
              </Text>
            </View>
          )}
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <View style={styles.confirmButtons}>
            {del ? (
              <>
                <Pressable onPress={onClose} style={({ pressed }) => [styles.confirmBtn, styles.confirmCancel, pressed && styles.pressed]} accessibilityRole="button">
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={onConfirm} style={({ pressed }) => [styles.confirmBtn, styles.confirmDelete, pressed && styles.pressed]} accessibilityRole="button">
                  <TrashIcon size={16} color="#fff" />
                  <Text style={styles.confirmDeleteText}>Delete</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={onClose} style={({ pressed }) => [styles.confirmBtn, styles.confirmOk, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.confirmDeleteText}>Got it</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Pencil (edit) and bin (delete) for the treatment rows - same 24-grid line style as components/icons. */
function PencilIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M13.5 6.5l4 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function TrashIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** "Add a line for this customer" input with an Add button. */
function AddLine({ onAdd }: { onAdd: (text: string) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t.length < 3) return;
    onAdd(t);
    setText('');
  };
  return (
    <View style={styles.addLine}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Add a line for this customer..."
        placeholderTextColor={theme.textMuted}
        style={styles.addLineInput}
        maxLength={500}
        onSubmitEditing={add}
        returnKeyType="done"
      />
      <Pressable onPress={add} disabled={text.trim().length < 3} style={[styles.addLineButton, text.trim().length < 3 && { opacity: 0.4 }]} accessibilityRole="button">
        <PlusIcon size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

/** Bottom sheet to fill in one treatment row. */
function RowEditor({
  row,
  isNew,
  frequencies,
  onSave,
  onDelete,
  onClose,
}: {
  row: TreatmentRow;
  isNew: boolean;
  frequencies: string[];
  onSave: (row: TreatmentRow) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const insets = useSafeAreaInsets(); // keep the buttons above the phone's navigation bar
  const [r, setR] = useState(row);
  const [error, setError] = useState<string | null>(null);
  const options = (r.frequency && !frequencies.includes(r.frequency) ? [r.frequency, ...frequencies] : frequencies).map((f) => ({ value: f, label: f }));
  const save = () => {
    if (ROW_KEYS.some((k) => !r[k].trim())) return setError('Fill in every field.');
    onSave(r);
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetShade} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sectionTitle}>{isNew ? 'Add treatment row' : 'Edit treatment row'}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <CloseIcon size={18} color={theme.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <CrmTextField label="Defence area" value={r.defense_area} onChangeText={(v) => setR({ ...r, defense_area: v })} placeholder="e.g. Kitchen premises" maxLength={120} />
            <CrmTextField label="Method / material" value={r.material_used} onChangeText={(v) => setR({ ...r, material_used: v })} placeholder="e.g. Residual chemical spray" maxLength={160} />
            <CrmTextField label="Treated area" value={r.treatment_area} onChangeText={(v) => setR({ ...r, treatment_area: v })} placeholder="e.g. Kitchen and dining area" multiline maxLength={255} />
            <SelectField label="Frequency" placeholder="Choose frequency" value={r.frequency || null} options={options} onChange={(v) => setR({ ...r, frequency: v })} />
            {!!error && <Text style={styles.problem}>{error}</Text>}
            <View style={styles.footerButtons}>
              {!isNew && <LeadButton label="Remove" variant="secondary" onPress={onDelete} style={{ flex: 1 }} />}
              <LeadButton label={isNew ? 'Add row' : 'Save row'} onPress={save} style={{ flex: 1.4 }} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pressed: { opacity: 0.7 },
  muted: { ...typography.caption, color: t.textMuted },
  hint: { ...typography.caption, color: t.textMuted, marginTop: -spacing.xs, marginBottom: spacing.md },
  link: { ...typography.captionMedium, color: t.primary },
  warn: { ...typography.caption, color: t.dangerText, backgroundColor: t.dangerBg, padding: spacing.sm, borderRadius: radii.md, marginTop: -spacing.xs, marginBottom: spacing.sm },
  problem: { ...typography.captionMedium, color: t.dangerText, backgroundColor: t.dangerBg, padding: spacing.sm, borderRadius: radii.md, marginBottom: spacing.sm },

  section: { backgroundColor: t.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: t.border, padding: spacing.lg, marginBottom: spacing.md },
  sectionHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.md },
  sectionNo: { width: 24, height: 24, borderRadius: 12, backgroundColor: t.crestRed, alignItems: 'center' as const, justifyContent: 'center' as const },
  sectionNoText: { ...typography.captionMedium, color: '#fff' },
  sectionTitle: { ...typography.subtitle, color: t.textPrimary, flex: 1 },

  customerName: { ...typography.bodyMedium, color: t.textPrimary, marginBottom: 2 },

  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const, rowGap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    width: '48.5%' as const,
    height: 62, // every tile the same size, whether the name takes one line or two
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  tileOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  tick: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  tickOn: { backgroundColor: t.primary, borderColor: t.primary },
  tileText: { ...typography.captionMedium, color: t.textPrimary, flex: 1 },
  tileTextOn: { color: t.primary },

  sumOld: { fontSize: 13, lineHeight: 18, color: t.textMuted, includeFontPadding: false, textAlignVertical: 'center' as const },
  footerOld: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const, color: t.textMuted, includeFontPadding: false, textAlignVertical: 'center' as const },

  serviceCard: { borderWidth: 1, borderColor: t.border, borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.sm, backgroundColor: t.surface },
  planRow: { flexDirection: 'row' as const, gap: spacing.sm },
  planCell: { flex: 1.5 },
  priceCell: { flex: 1 },
  serviceHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.md },
  serviceIcon: { width: 30, height: 30, borderRadius: radii.md, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  serviceName: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  iconButton: { padding: 4 },

  rowsToggle: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: spacing.xs },
  rowsToggleText: { ...typography.captionMedium, color: t.textSecondary },
  rows: { marginTop: spacing.xs, gap: spacing.xs },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, backgroundColor: t.surface, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, padding: spacing.sm },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...typography.captionMedium, color: t.textPrimary },
  freqLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 3 },
  freqDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.primary },
  freqText: { ...typography.caption, color: t.primary },
  rowIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowIconEdit: { backgroundColor: t.primarySoftBg },
  rowIconDelete: { backgroundColor: t.dangerBg },
  addRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: spacing.sm, justifyContent: 'center' as const },

  switchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  switchLabel: { ...typography.body, color: t.textPrimary },

  summary: { borderWidth: 1, borderColor: t.border, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm, backgroundColor: t.surfaceAlt },
  sumLine: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  discountBar: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, backgroundColor: '#16a34a', borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  discountLabel: { ...typography.captionMedium, color: '#fff', letterSpacing: 1 },
  discountValue: { ...typography.subtitle, color: '#fff' },
  sumFinal: { borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.sm },
  finalLabel: { ...typography.bodyMedium, color: t.textPrimary },
  finalValue: { ...typography.title, color: t.textPrimary },
  finalPer: { ...typography.caption, color: t.textMuted },

  groupLabel: { ...typography.overline, color: t.textSecondary, marginBottom: spacing.xs },
  checkRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm, paddingVertical: spacing.xs },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 1 },
  boxOn: { backgroundColor: t.primary, borderColor: t.primary },
  checkText: { ...typography.body, color: t.textPrimary, flex: 1 },
  addLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs },
  addLineInput: { flex: 1, ...typography.body, color: t.textPrimary, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: t.surface },
  addLineButton: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },

  uploadLink: { flexDirection: 'row' as const, justifyContent: 'center' as const, paddingVertical: spacing.md },

  footer: { borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  footerTotals: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: spacing.sm, marginBottom: spacing.sm },
  footerTotal: { ...typography.title, color: t.textPrimary },
  footerOther: { ...typography.captionMedium, color: t.textSecondary },
  footerButtons: { flexDirection: 'row' as const, gap: spacing.sm },

  confirmShade: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.xl },
  confirmCard: { width: '100%' as const, maxWidth: 360, backgroundColor: t.surface, borderRadius: radii.xl, padding: spacing.xl, alignItems: 'center' as const },
  confirmIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: spacing.md },
  confirmTitle: { ...typography.subtitle, color: t.textPrimary, textAlign: 'center' as const },
  confirmChip: { marginTop: spacing.sm, backgroundColor: t.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, maxWidth: '100%' as const },
  confirmChipText: { ...typography.captionMedium, color: t.textPrimary, textAlign: 'center' as const },
  confirmMessage: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.sm },
  confirmButtons: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' as const },
  confirmBtn: { flex: 1, height: 46, borderRadius: radii.lg, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6 },
  confirmCancel: { borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  confirmCancelText: { ...typography.button, color: t.textPrimary },
  confirmDelete: { backgroundColor: t.danger },
  confirmOk: { backgroundColor: t.primary },
  confirmDeleteText: { ...typography.button, color: '#fff' },

  sheetShade: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: t.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, maxHeight: '88%' as const },
  sheetHandle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: spacing.md },
  sheetHead: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: spacing.md },
});

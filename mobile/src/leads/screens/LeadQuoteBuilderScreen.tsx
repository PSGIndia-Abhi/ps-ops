import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { AppDialog, appAlert } from '../AppDialog';
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
import { PriceTableEditor, priceTableForSave, priceTableFromContent, priceTableTotal, type PriceTable } from '../PriceTableEditor';
import { QuotationPdfDialog, SendQuotationDialog } from '../QuotationDialogs';
import type { Billing, ContractType, MasterPlan, MasterService, QuoteMaster, SavedQuotationContent, TreatmentRow } from '../quotation';
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
const PER_UNIT: Record<Billing, string> = { MONTHLY: 'month', YEARLY: 'year', ONE_TIME: '' };

const joinNames = (names: string[]) => (names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const defaultSubject = (names: string[], customer: string) =>
  `Proposal, recommendation and treatment method for ${joinNames(names) || 'pest control'} at your ${customer ? `${customer} ` : ''}premises.`;
const digits = (v: string) => v.replace(/[^\d.]/g, '');

export function LeadQuoteBuilderScreen() {
  const navigation = useNavigation<Nav>();
  const { leadId, name, fromId, mode } = useRoute<RouteProp<LeadStackParamList, 'LeadQuoteBuild'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  // Edit: saves a new quotation that replaces this one. Duplicate: a new one from its details.
  const editing = !!fromId && mode === 'edit';
  const title = editing ? 'Edit quotation' : fromId ? 'Duplicate quotation' : 'New quotation';

  const loader = useCallback(async () => {
    const [master, lead, saved] = await Promise.all([
      quote.getQuoteMaster(),
      api.getLead(leadId),
      fromId ? quote.getQuotationContent(leadId, fromId) : Promise.resolve(null),
    ]);
    return { master, lead, saved };
  }, [leadId, fromId]);
  const { data, loading, error, reload } = useLoad(loader, fromId ? 'Could not load the quotation.' : 'Could not load the quotation master.');

  if (loading && !data) {
    return (
      <LeadScreen edges={['top', 'bottom']}>
        <LeadTopBar title={title} subtitle={name} onBack={() => navigation.goBack()} icon="close" />
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
        <LeadTopBar title={title} subtitle={name} onBack={() => navigation.goBack()} icon="close" />
        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />
        </View>
      </LeadScreen>
    );
  }
  const leadName = data.lead.companyName || name;
  const start = data.saved
    ? startFromSaved(data.saved, data.master)
    : blankStart(data.master, { name: leadName, address: data.lead.address || '', phone: data.lead.phone || '' }, data.lead.services);
  return (
    <Builder
      leadId={leadId}
      master={data.master}
      leadName={leadName}
      title={title}
      start={start}
      from={fromId ? { id: fromId, editing } : null}
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

/** What the form starts with - a blank quotation (the lead's services ticked) or a saved one's details. */
type Start = {
  customer: { name: string; address: string; phone: string };
  order: string[];
  picks: Record<string, Pick>;
  mode: 'PER_SERVICE' | 'PACKAGE';
  pkg: { amount: string; billing: Billing; planLabel: string; description: string };
  table: PriceTable | null;
  perOutlet: boolean;
  subject: string;
  validDays: string;
  contractMonths: string;
  revised: boolean;
  discount: string;
  checked: Set<string>;
  extra: { VALUE_ADDED: string[]; TERMS: string[] };
  contractType: ContractType | null;
  /** Services on the saved quotation that are no longer in the master. */
  missing: string[];
};

function blankStart(master: QuoteMaster, customer: Start['customer'], asked: string[]): Start {
  const services = master.services.filter((s) => asked.includes(s.id));
  return {
    customer,
    order: asked.filter((id) => master.services.some((s) => s.id === id)),
    picks: Object.fromEntries(services.map((s) => [s.id, startPick(s, master.plans, true)])),
    mode: 'PER_SERVICE',
    pkg: { amount: '', billing: 'MONTHLY', planLabel: '', description: '' },
    table: null,
    perOutlet: false,
    subject: '',
    validDays: '30',
    contractMonths: '12',
    revised: false,
    discount: '',
    checked: new Set(),
    extra: { VALUE_ADDED: [], TERMS: [] },
    contractType: null,
    missing: [],
  };
}

const sameText = (a?: string, b?: string) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * A saved quotation's details as the form's start (the same as the web builder): services and plans
 * are matched to the master by name; one no longer in the master goes to `missing`. Ticked optional
 * clauses come back ticked, lines typed for that customer come back as extra lines.
 */
function startFromSaved(content: SavedQuotationContent, master: QuoteMaster): Start {
  const picks: Record<string, Pick> = {};
  const order: string[] = [];
  const missing: string[] = [];
  for (const s of content.services || []) {
    const service = master.services.find((x) => sameText(x.name, s.name));
    if (!service || picks[service.id]) {
      if (!service) missing.push(s.name);
      continue;
    }
    const plan = master.plans.find((p) => sameText(p.name, s.plan) && p.billing === s.billing) || master.plans.find((p) => sameText(p.name, s.plan));
    picks[service.id] = {
      planId: plan?.id || '',
      price: s.price === null || s.price === undefined ? '' : String(s.price),
      rows: (s.rows || []).map((r) => ({ defense_area: r.defense_area || '', material_used: r.material_used || '', treatment_area: r.treatment_area || '', frequency: r.frequency || '' })),
      open: false,
    };
    order.push(service.id);
  }
  const checked = new Set<string>();
  const extra: Start['extra'] = { VALUE_ADDED: [], TERMS: [] };
  for (const [kind, lines] of [
    ['VALUE_ADDED', content.valueAdded],
    ['TERMS', content.terms],
  ] as const) {
    for (const text of lines || []) {
      const clause = master.clauses.find((c) => c.kind === kind && sameText(c.text, text));
      if (!clause) extra[kind].push(text);
      else if (!clause.is_default) checked.add(clause.id);
    }
  }
  const p = (content.pricing || { mode: 'PER_SERVICE' }) as Partial<{ mode: string; amount: number; billing: Billing; planLabel: string; description: string }>;
  const c = content.customer || { name: '', address: '', phone: '', attention: '' };
  return {
    customer: { name: c.name || '', address: c.address || '', phone: c.phone || '' },
    order,
    picks,
    mode: p.mode === 'PACKAGE' ? 'PACKAGE' : 'PER_SERVICE',
    pkg: {
      amount: p.amount ? String(p.amount) : '',
      billing: p.billing || 'MONTHLY',
      planLabel: p.planLabel || '',
      // The server's default wording ("services 1 to N") is left out so it follows the services picked now.
      description: /^Pest management services .* as per scope above$/.test(p.description || '') ? '' : p.description || '',
    },
    table: priceTableFromContent(content.priceTable),
    perOutlet: !!content.perOutlet,
    subject: content.subject || '',
    validDays: String(content.validDays || 30),
    contractMonths: String(content.contractMonths || 12),
    revised: !!content.revised,
    discount: content.totals?.discount ? String(content.totals.discount) : '',
    checked,
    extra,
    contractType: content.contractType || null,
    missing,
  };
}

function Builder({
  leadId,
  master,
  leadName,
  title,
  start,
  from,
  theme,
}: {
  leadId: string;
  master: QuoteMaster;
  leadName: string;
  title: string;
  /** Blank, or a saved quotation's details (Edit / Duplicate). */
  start: Start;
  /** The saved quotation it was opened from; `editing` saves a replacement for it. */
  from: { id: string; editing: boolean } | null;
  theme: CrmTheme;
}) {
  const navigation = useNavigation<Nav>();
  const { styles } = useCrmStyles(factory);

  const [customer, setCustomer] = useState(start.customer);
  const [editCustomer, setEditCustomer] = useState(false);
  const [order, setOrder] = useState<string[]>(start.order);
  const [picks, setPicks] = useState<Record<string, Pick>>(start.picks);
  const [mode, setMode] = useState<'PER_SERVICE' | 'PACKAGE'>(start.mode);
  const [pkg, setPkg] = useState(start.pkg);
  // Optional price table in the client's format; its total row's amount is the package price.
  const [table, setTable] = useState<PriceTable | null>(start.table);
  const [perOutlet, setPerOutlet] = useState(start.perOutlet); // the price is for one outlet
  const [subject, setSubject] = useState(start.subject);
  // A saved quotation keeps its own subject; a new one is written from the services picked.
  const [subjectEdited, setSubjectEdited] = useState(!!start.subject);
  const [validDays, setValidDays] = useState(start.validDays);
  const [contractMonths, setContractMonths] = useState(start.contractMonths);
  // An edit goes to the customer as a revised proposal (it can be switched off).
  const [revised, setRevised] = useState(start.revised || !!from?.editing);
  const [discount, setDiscount] = useState(start.discount);
  const [checked, setChecked] = useState<Set<string>>(start.checked);
  const [extra, setExtra] = useState<{ VALUE_ADDED: string[]; TERMS: string[] }>(start.extra);
  const [rowEdit, setRowEdit] = useState<{ serviceId: string; index: number | null; row: TreatmentRow } | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'send'>('');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [askSend, setAskSend] = useState<quote.QuotationContent | null>(null); // "Save and send?" open
  const [sent, setSent] = useState<{ id: string; number: string; name: string; fileName: string } | null>(null); // just saved

  const serviceById = useMemo(() => new Map(master.services.map((s) => [s.id, s])), [master]);
  const planById = useMemo(() => new Map(master.plans.map((p) => [p.id, p])), [master]);
  const frequencyNames = useMemo(() => master.plans.map((p) => p.name), [master]);
  const pickedNames = order.map((id) => serviceById.get(id)?.name || '').filter(Boolean);
  const shownSubject = subjectEdited ? subject : defaultSubject(pickedNames, customer.name.trim());

  // ---- totals (the same rules as the server). A price table makes it one package price: its total.
  const tableTotal = priceTableTotal(table);
  const priceMode = table ? 'PACKAGE' : mode;
  const pkgAmount = table ? tableTotal : Number(pkg.amount) || 0;
  const totals = useMemo(() => {
    if (priceMode === 'PACKAGE') {
      const a = pkgAmount;
      return { MONTHLY: pkg.billing === 'MONTHLY' ? a : 0, YEARLY: pkg.billing === 'YEARLY' ? a : 0, ONE_TIME: pkg.billing === 'ONE_TIME' ? a : 0 };
    }
    const t = { MONTHLY: 0, YEARLY: 0, ONE_TIME: 0 };
    for (const id of order) {
      const p = picks[id];
      const plan = planById.get(p.planId);
      t[plan?.billing ?? 'MONTHLY'] += Number(p.price) || 0;
    }
    return t;
  }, [priceMode, pkgAmount, pkg.billing, order, picks, planById]);
  const perText = (b: Billing) => `${PER[b]}${perOutlet ? ' + per outlet' : ''}`;
  const mainBilling: Billing = totals.MONTHLY > 0 ? 'MONTHLY' : totals.YEARLY > 0 ? 'YEARLY' : 'ONE_TIME';
  const mainTotal = totals[mainBilling];
  const discountValue = Number(discount) || 0;
  const finalTotal = Math.max(0, mainTotal - discountValue);
  const otherTotals = (['YEARLY', 'ONE_TIME'] as Billing[]).filter((b) => b !== mainBilling && totals[b] > 0);

  // ---- services
  function toggleService(service: MasterService) {
    if (picks[service.id]) return removeService(service.id);
    setPicks((all) => ({ ...all, [service.id]: startPick(service, master.plans, priceMode === 'PER_SERVICE') }));
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
    if (p.rows.length === 1) return appAlert('Keep one row', 'A service needs at least one treatment row. Remove the service instead.');
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
      if (priceMode === 'PER_SERVICE') {
        if (!plan) return { problem: `${s.name}: choose a plan.` };
        if (p.price === '' || !(Number(p.price) >= 0)) return { problem: `${s.name}: enter the price.` };
      }
      services.push({
        name: s.name,
        plan: plan?.name || '',
        billing: plan?.billing || 'MONTHLY',
        price: priceMode === 'PER_SERVICE' ? Number(p.price) : null,
        rows: rows.map((r) => ({ defense_area: r.defense_area.trim(), material_used: r.material_used.trim(), treatment_area: r.treatment_area.trim(), frequency: r.frequency.trim() })),
      });
    }
    if (table) {
      if (!table.rows[0].some((c) => c.trim())) return { problem: 'Price table: fill in the headings (first row).' };
      if (!(tableTotal > 0)) return { problem: 'Price table: type the amounts in the last column.' };
    } else if (mode === 'PACKAGE' && !(Number(pkg.amount) > 0)) return { problem: 'Enter the package amount.' };
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
          priceMode === 'PACKAGE'
            ? { mode: 'PACKAGE', amount: pkgAmount, billing: pkg.billing, planLabel: pkg.planLabel.trim(), description: pkg.description.trim() }
            : { mode: 'PER_SERVICE' },
        priceTable: table ? priceTableForSave(table) : null,
        perOutlet,
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
      const q = await quote.generateQuotation(leadId, content, from?.editing ? from.id : undefined);
      setBusy('');
      // Done / Open PDF on this card go back to the lead.
      setSent({ id: q.id, number: q.number, name: content.customer.name, fileName: q.fileName });
    } catch (err) {
      setBusy('');
      setProblem(errorMessage(err, 'Could not save the quotation. Check your connection and try again.'));
    }
  }

  const optionalClauses = (kind: 'VALUE_ADDED' | 'TERMS') => master.clauses.filter((c) => c.kind === kind && !c.is_default);

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <LeadTopBar title={title} subtitle={leadName} onBack={() => navigation.goBack()} icon="close" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Opened from a saved quotation: what saving does, and services it had that the master no longer has */}
          {!!from && (
            <View style={[styles.tableNote, styles.fromNote]}>
              <Text style={styles.tableNoteText}>
                {from.editing ? (
                  <>
                    Saving makes a <Text style={styles.tableNoteStrong}>new quotation</Text>. The current one is kept, marked Cancelled - replaced.
                  </>
                ) : (
                  <>
                    Saving makes a <Text style={styles.tableNoteStrong}>new quotation</Text>. The one you copied stays as it is.
                  </>
                )}
              </Text>
            </View>
          )}
          {start.missing.length > 0 && (
            <View style={[styles.tableNote, styles.fromNote, styles.missingNote]}>
              <Text style={styles.tableNoteText}>
                Not in the Quotation Master any more, so not filled in: <Text style={styles.tableNoteStrong}>{start.missing.join(', ')}</Text>. Pick a replacement service below if needed.
              </Text>
            </View>
          )}
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
              const noPrice = priceMode === 'PER_SERVICE' && !!plan && !priced.has(plan.id);
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

                  {/* One package price (or a price table): no plan / price per service, just its rows. */}
                  {priceMode === 'PER_SERVICE' && (
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

          {/* 3. Price table (optional) */}
          <Section no={3} title="Price table">
            <PriceTableEditor table={table} onChange={setTable} />
          </Section>

          {/* 4. Price */}
          <Section no={4} title="Price">
            {table ? (
              <View style={styles.tableNote}>
                <Text style={styles.tableNoteText}>
                  One package price from the price table:{' '}
                  <Text style={styles.tableNoteStrong}>{tableTotal > 0 ? formatINR(tableTotal) : 'type the amounts in its last column'}</Text>
                </Text>
              </View>
            ) : (
              <SegmentedControl
                options={[
                  { value: 'PER_SERVICE', label: 'Per service' },
                  { value: 'PACKAGE', label: 'One package' },
                ]}
                value={mode}
                onChange={(v) => setMode(v as 'PER_SERVICE' | 'PACKAGE')}
              />
            )}
            {priceMode === 'PACKAGE' && (
              <View style={{ marginTop: spacing.md }}>
                {!table && (
                  <CrmTextField label="Package amount" value={pkg.amount} onChangeText={(v) => setPkg({ ...pkg, amount: digits(v) })} prefix="₹" keyboardType="decimal-pad" placeholder="e.g. 158000" />
                )}
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

          {/* 5. Details */}
          <Section no={5} title="Proposal details">
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

          {/* 6. Discount */}
          <Section no={6} title="Discount">
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
                    {`${formatINR(mainTotal)} ${perText(mainBilling)}`}
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
                    {formatINR(finalTotal)} <Text style={styles.finalPer}>{perText(mainBilling)}</Text>
                  </Text>
                </View>
              </View>
            )}
            <Pressable
              onPress={() => setPerOutlet((v) => !v)}
              style={[styles.outlet, perOutlet && styles.outletOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: perOutlet }}
            >
              <View style={[styles.box, perOutlet && styles.boxOn]}>{perOutlet && <CheckIcon size={12} color="#fff" />}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.outletTitle}>Price is per outlet</Text>
                <Text style={styles.muted}>The quotation says &quot;{MAIN_WORD[mainBilling] === 'one-time' ? 'one-time' : `per ${PER_UNIT[mainBilling]}`} + per outlet&quot;</Text>
              </View>
            </Pressable>
          </Section>

          {/* 7. Terms */}
          <Section no={7} title="Terms">
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

          <Pressable onPress={() => navigation.replace('LeadQuote', { leadId, name: leadName, amount: 0 })} style={styles.uploadLink} accessibilityRole="link">
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
                  {formatINR(finalTotal)} <Text style={styles.finalPer}>{perText(mainBilling)}</Text>
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
          initial={start.contractType}
          replacing={!!from?.editing}
          onCancel={() => setAskSend(null)}
          onSend={(contractType) => {
            const content = { ...askSend, contractType };
            setAskSend(null);
            send(content);
          }}
        />
      )}

      {sent && (
        <QuotationPdfDialog
          saved
          name={sent.name}
          getFile={() => quote.savedQuotationPdf(leadId, sent.id, sent.fileName)}
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

/** The screen's confirm popup, in the app's popup style (AppDialog). */
function ConfirmCard({ state, onClose, onConfirm }: { state: ConfirmState; onClose: () => void; onConfirm: () => void }) {
  const del = state.kind === 'delete';
  return (
    <AppDialog
      title={state.title}
      chip={state.name}
      message={state.message}
      tone={del ? 'danger' : 'primary'}
      Icon={del ? TrashIcon : DocumentIcon}
      buttons={del ? [{ text: 'Cancel', style: 'cancel', onPress: onClose }, { text: 'Delete', style: 'destructive', onPress: onConfirm }] : [{ text: 'Got it', onPress: onClose }]}
      onClose={onClose}
    />
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
  // Price step note when a price table sets the package price
  tableNote: { padding: spacing.md, borderRadius: radii.md, backgroundColor: t.primarySoftBg },
  tableNoteText: { ...typography.body, color: t.textSecondary },
  tableNoteStrong: { color: t.textPrimary, fontWeight: '700' as const },
  fromNote: { marginBottom: spacing.md },
  missingNote: { backgroundColor: t.warningBg },
  // "Price is per outlet" under the discount summary
  outlet: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border },
  outletOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  outletTitle: { ...typography.bodyMedium, color: t.textPrimary },
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


  sheetShade: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: t.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, maxHeight: '88%' as const },
  sheetHandle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: spacing.md },
  sheetHead: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: spacing.md },
});

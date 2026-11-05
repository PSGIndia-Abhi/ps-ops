import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BriefcaseIcon } from '../components/icons';
import { CheckIcon } from '../crm/ui/crmIcons';
import { CrmErrorBanner } from '../crm/ui/CrmScreen';
import { PrimaryButton } from '../crm/ui/PrimaryButton';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { Sheet } from '../tasks/ui/sheets';
import { radii, spacing, typography } from '../theme';
import { errorText, getCallInvoices } from './api';
import { useFeedback } from './FeedbackContext';
import { ACTIONS, OPERATIONS, PRIORITIES, PRIORITY, RAISE_ACTIONS, departmentHint, formatDay, rupees } from './format';
import type { DepartmentKind, Invoice, NewTicket, Priority, TicketAction, Visit } from './types';
import { Chips, RadioCard } from './ui';

const factory = (t: CrmTheme) => ({
  body: { maxHeight: 600 },
  label: { ...typography.captionMedium, color: t.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm },
  section: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: t.surfaceAlt },
  sectionBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: t.primary },
  sectionText: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  input: { minHeight: 64, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, padding: spacing.sm, color: t.textPrimary, textAlignVertical: 'top' as const, ...typography.body },
  box: { borderWidth: 1, borderColor: t.border, borderRadius: radii.md, paddingHorizontal: spacing.sm },
  check: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm },
  tick: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: t.textMuted, alignItems: 'center' as const, justifyContent: 'center' as const },
  tickOn: { backgroundColor: t.primary, borderColor: t.primary },
  checkText: { ...typography.body, color: t.textPrimary, flex: 1 },
  hint: { ...typography.caption, color: t.textMuted },
  dept: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, borderWidth: 1.5, borderColor: t.border, borderRadius: radii.lg, padding: spacing.sm, marginBottom: spacing.xs, backgroundColor: t.surface },
  deptOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  deptIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  deptIconOn: { backgroundColor: t.primary },
  deptName: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  invRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: t.surfaceAlt },
  invMain: { flex: 1 },
  invNo: { ...typography.bodyMedium, color: t.textPrimary },
  invAmt: { ...typography.captionMedium, color: t.textSecondary, textAlign: 'right' as const },
  buttons: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
});

/**
 * Raise a ticket for the problem the customer reported - the same choices as the web's Raise ticket.
 * Departments (one or more): Operations = the customer's words, services, priority and next step
 * ("Book a re-visit" is booked on the web); any other department = the issue for that team, its
 * priority (and the customer's invoices when it works with invoices). One ticket, a part for each.
 */
export function RaiseTicketSheet({
  visible,
  callId,
  visits,
  suggested,
  defaultSummary,
  submitLabel = 'Raise ticket',
  onSubmit,
  onClose,
}: {
  visible: boolean;
  callId: string;
  visits: Visit[];
  suggested: Priority;
  defaultSummary: string;
  submitLabel?: string;
  onSubmit: (ticket: NewTicket) => Promise<void>;
  onClose: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const { departmentList } = useFeedback();
  const departments = departmentList.length ? departmentList : [{ kind: OPERATIONS, label: 'Operations', name: 'Operations Team', org_unit_id: '' }];
  const services = [...new Set(visits.map((v) => v.service).filter((s): s is string => !!s))];
  const [depts, setDepts] = useState<DepartmentKind[]>([OPERATIONS]);
  const [summary, setSummary] = useState(defaultSummary);
  const [picked, setPicked] = useState<string[]>(services.length === 1 ? services : []);
  const [priority, setPriority] = useState<Priority>(suggested);
  const [action, setAction] = useState<TicketAction>('SCHEDULE_REVISIT');
  const [note, setNote] = useState('');
  // Each other ticked department's part: { issue_summary, priority, invoice_ids }.
  type Part = { issue_summary: string; priority: Priority; invoice_ids: string[] };
  const blank: Part = { issue_summary: '', priority: suggested, invoice_ids: [] };
  const [parts, setParts] = useState<Record<string, Part>>({});
  const partOf = (k: DepartmentKind) => parts[k] || blank;
  const setPart = (k: DepartmentKind, patch: Partial<Part>) => setParts((p) => ({ ...p, [k]: { ...(p[k] || blank), ...patch } }));
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forOps = depts.includes(OPERATIONS);
  const others = departments.filter((d) => d.kind !== OPERATIONS && depts.includes(d.kind));
  const needInvoices = others.some((d) => d.with_invoices);

  useEffect(() => {
    if (!needInvoices || invoices) return;
    getCallInvoices(callId)
      .then(setInvoices)
      .catch(() => setInvoices([]));
  }, [needInvoices, invoices, callId]);

  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const toggleDept = (k: DepartmentKind) => setDepts((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));
  const toggleInvoice = (k: DepartmentKind, id: string) => {
    const ids = partOf(k).invoice_ids;
    setPart(k, { invoice_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  };

  async function submit() {
    if (!depts.length) {
      setError('Choose at least one department');
      return;
    }
    if (forOps && action === 'OTHER' && !note.trim()) {
      setError('Type what will be done for Other');
      return;
    }
    const missing = others.find((d) => !partOf(d.kind).issue_summary.trim());
    if (missing) {
      setError(`Describe the issue for ${missing.name}`);
      return;
    }
    const chosen = services.filter((s) => picked.includes(s));
    const servicesLine = chosen.length > 1 ? `Services: ${chosen.join(', ')}` : '';
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        departments: depts,
        issue_summary: forOps ? [summary.trim(), servicesLine].filter(Boolean).join('\n').slice(0, 500) || null : null,
        visit_id: forOps ? visits.find((v) => v.service === chosen[0])?.id || null : null,
        priority,
        action,
        action_due_at: null,
        action_note: forOps ? note.trim() || null : null,
        ...(others.length
          ? {
              parts: Object.fromEntries(
                others.map((d) => {
                  const p = partOf(d.kind);
                  return [d.kind, { issue_summary: p.issue_summary.trim(), priority: p.priority, invoice_ids: d.with_invoices ? p.invoice_ids : [] }];
                }),
              ),
            }
          : {}),
      });
    } catch (err) {
      setError(errorText(err, 'Could not raise the ticket.'));
      setSaving(false);
    }
  }

  const section = (text: string) => (
    <View style={styles.section}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionText}>{text}</Text>
    </View>
  );

  return (
    <Sheet visible={visible} onClose={saving ? () => {} : onClose} title="Raise a ticket">
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <CrmErrorBanner message={error} />

        <Text style={styles.label}>Departments * (one or more)</Text>
        {departments.map((d) => {
          const on = depts.includes(d.kind);
          return (
            <Pressable key={d.kind} onPress={() => toggleDept(d.kind)} style={[styles.dept, on && styles.deptOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <View style={[styles.deptIcon, on && styles.deptIconOn]}>
                <BriefcaseIcon size={18} color={on ? theme.textOnPrimary : theme.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deptName}>{d.name}</Text>
                <Text style={styles.hint}>{departmentHint(d)}</Text>
              </View>
              <View style={[styles.tick, on && styles.tickOn]}>{on && <CheckIcon size={14} color={theme.textOnPrimary} />}</View>
            </Pressable>
          );
        })}

        {forOps && (
          <>
            {departments.length > 1 && section(departments.find((d) => d.kind === OPERATIONS)?.name || 'Operations')}
            <Text style={styles.label}>What is the problem? (in the customer's words)</Text>
            <TextInput style={styles.input} value={summary} onChangeText={setSummary} multiline maxLength={500} placeholder="The bad answers are attached already" placeholderTextColor={theme.textMuted} />

            <Text style={styles.label}>Which services?</Text>
            {services.length ? (
              <View style={styles.box}>
                {services.map((s) => {
                  const on = picked.includes(s);
                  return (
                    <Pressable key={s} onPress={() => toggle(s)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                      <View style={[styles.tick, on && styles.tickOn]}>{on && <CheckIcon size={14} color={theme.textOnPrimary} />}</View>
                      <Text style={styles.checkText}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.hint}>No services this month.</Text>
            )}

            <Text style={styles.label}>Priority</Text>
            <Chips
              options={PRIORITIES.map((p) => ({ value: p, label: `${PRIORITY[p].label}${p === suggested ? ' (suggested)' : ''}` }))}
              value={priority}
              onChange={setPriority}
            />

            <Text style={styles.label}>What happens next?</Text>
            {RAISE_ACTIONS.map((a) => (
              <RadioCard key={a} title={ACTIONS[a].label} hint={ACTIONS[a].hint} on={action === a} onPress={() => setAction(a)} />
            ))}
            {action === 'OTHER' && (
              <>
                <Text style={styles.label}>What will be done? *</Text>
                <TextInput style={styles.input} value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="e.g. Supervisor to inspect the drains" placeholderTextColor={theme.textMuted} />
              </>
            )}
          </>
        )}

        {others.map((d) => {
          const p = partOf(d.kind);
          return (
            <View key={d.kind}>
              {section(d.name)}
              <Text style={styles.label}>{d.with_invoices ? 'What is the invoice issue? *' : `What should ${d.name} look into? *`}</Text>
              <TextInput
                style={styles.input}
                value={p.issue_summary}
                onChangeText={(v) => setPart(d.kind, { issue_summary: v })}
                multiline
                maxLength={500}
                placeholder={d.with_invoices ? 'e.g. October invoice not received, send a copy' : 'Describe the issue for this team'}
                placeholderTextColor={theme.textMuted}
              />
              <Text style={styles.label}>Priority</Text>
              <Chips options={PRIORITIES.map((x) => ({ value: x, label: PRIORITY[x].label }))} value={p.priority} onChange={(v) => setPart(d.kind, { priority: v })} />
              {d.with_invoices && (
                <>
                  <Text style={styles.label}>Related invoices (optional)</Text>
                  {!invoices ? (
                    <Text style={styles.hint}>Loading invoices…</Text>
                  ) : !invoices.length ? (
                    <Text style={styles.hint}>No invoices found for this customer.</Text>
                  ) : (
                    <View style={styles.box}>
                      {invoices.map((i) => {
                        const on = p.invoice_ids.includes(i.id);
                        return (
                          <Pressable key={i.id} onPress={() => toggleInvoice(d.kind, i.id)} style={styles.invRow} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                            <View style={[styles.tick, on && styles.tickOn]}>{on && <CheckIcon size={14} color={theme.textOnPrimary} />}</View>
                            <View style={styles.invMain}>
                              <Text style={styles.invNo}>{i.number}</Text>
                              <Text style={styles.hint}>{formatDay(i.date)}</Text>
                            </View>
                            <View>
                              <Text style={styles.invAmt}>{rupees(i.amount)}</Text>
                              <Text style={[styles.hint, { textAlign: 'right', color: i.pending > 0 ? theme.dangerText : theme.textMuted }]}>{i.pending > 0 ? `${rupees(i.pending)} due` : 'Paid'}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
            </View>
          );
        })}

        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} disabled={saving} />
          <PrimaryButton label={submitLabel} variant="brand" style={{ flex: 1.4 }} onPress={submit} loading={saving} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

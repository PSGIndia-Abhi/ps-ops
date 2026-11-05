import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CheckIcon } from '../crm/ui/crmIcons';
import { CrmErrorBanner } from '../crm/ui/CrmScreen';
import { PrimaryButton } from '../crm/ui/PrimaryButton';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { Sheet } from '../tasks/ui/sheets';
import { radii, spacing, typography } from '../theme';
import { errorText } from './api';
import { ACTIONS, PRIORITIES, PRIORITY, RAISE_ACTIONS } from './format';
import type { NewTicket, Priority, TicketAction, Visit } from './types';
import { Chips, RadioCard } from './ui';

const factory = (t: CrmTheme) => ({
  body: { maxHeight: 560 },
  label: { ...typography.captionMedium, color: t.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: { minHeight: 64, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, padding: spacing.sm, color: t.textPrimary, textAlignVertical: 'top' as const, ...typography.body },
  box: { borderWidth: 1, borderColor: t.border, borderRadius: radii.md, paddingHorizontal: spacing.sm },
  check: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm },
  tick: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: t.textMuted, alignItems: 'center' as const, justifyContent: 'center' as const },
  tickOn: { backgroundColor: t.primary, borderColor: t.primary },
  checkText: { ...typography.body, color: t.textPrimary, flex: 1 },
  hint: { ...typography.caption, color: t.textMuted },
  buttons: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
});

/**
 * Raise a ticket for the problem the customer reported - the same choices as the web's Raise
 * ticket: their words, which services, priority (the answers suggest one), and the next step.
 * "Book a re-visit" is booked on the ticket afterwards (on the web Feedback Desk).
 */
export function RaiseTicketSheet({
  visible,
  visits,
  suggested,
  defaultSummary,
  submitLabel = 'Raise ticket',
  onSubmit,
  onClose,
}: {
  visible: boolean;
  visits: Visit[];
  suggested: Priority;
  defaultSummary: string;
  submitLabel?: string;
  onSubmit: (ticket: NewTicket) => Promise<void>;
  onClose: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const services = [...new Set(visits.map((v) => v.service).filter((s): s is string => !!s))];
  const [summary, setSummary] = useState(defaultSummary);
  const [picked, setPicked] = useState<string[]>(services.length === 1 ? services : []);
  const [priority, setPriority] = useState<Priority>(suggested);
  const [action, setAction] = useState<TicketAction>('SCHEDULE_REVISIT');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  async function submit() {
    if (action === 'OTHER' && !note.trim()) {
      setError('Type what will be done for Other');
      return;
    }
    const chosen = services.filter((s) => picked.includes(s));
    const servicesLine = chosen.length > 1 ? `Services: ${chosen.join(', ')}` : '';
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        issue_summary: [summary.trim(), servicesLine].filter(Boolean).join('\n').slice(0, 500) || null,
        visit_id: visits.find((v) => v.service === chosen[0])?.id || null,
        priority,
        action,
        action_due_at: null,
        action_note: note.trim() || null,
      });
    } catch (err) {
      setError(errorText(err, 'Could not raise the ticket.'));
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={saving ? () => {} : onClose} title="Raise a ticket">
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <CrmErrorBanner message={error} />
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

        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} disabled={saving} />
          <PrimaryButton label={submitLabel} variant="brand" style={{ flex: 1.4 }} onPress={submit} loading={saving} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

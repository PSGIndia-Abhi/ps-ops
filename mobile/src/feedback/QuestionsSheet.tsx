import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { CrmErrorBanner } from '../crm/ui/CrmScreen';
import { PrimaryButton } from '../crm/ui/PrimaryButton';
import { SelectField } from '../crm/ui/SelectField';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { Sheet } from '../tasks/ui/sheets';
import { radii, spacing, typography } from '../theme';
import { errorText } from './api';
import { useFeedback } from './FeedbackContext';
import { chosenAnswers, modeBody, modeCounts, questionsFor, type QuestionMode } from './format';
import type { Contact, FeedbackBody } from './types';
import { QuestionForm } from './ui';

const OTHER = '__other__';

const factory = (t: CrmTheme) => ({
  body: { maxHeight: 560 },
  hero: { borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  heroTitle: { ...typography.bodyMedium, fontWeight: '800' as const, color: '#FFFFFF' },
  heroText: { ...typography.caption, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  input: { minHeight: 46, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, paddingHorizontal: spacing.sm, color: t.textPrimary, marginTop: spacing.xs, ...typography.body },
  label: { ...typography.captionMedium, color: t.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  empty: { ...typography.caption, color: t.textMuted, padding: spacing.sm, backgroundColor: t.surfaceAlt, borderRadius: radii.md },
  buttons: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
});

/**
 * Asks the customer the feedback questions in a sheet: who they spoke with, the questions (and other
 * feedback), and an optional note. Used to reopen a ticket (the problem is back) and for the optional
 * call after a department has finished its part (mode = that department's questions only).
 */
export function QuestionsSheet({
  title,
  heading,
  text,
  color = '#4F46E5',
  contacts,
  services = [],
  mode: fixedMode,
  withNote = false,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  heading: string;
  text: string;
  /** The heading band's colour. */
  color?: string;
  contacts: Contact[];
  services?: string[];
  /** Only these questions (e.g. 'DEPT:ACCOUNTS'); else General / Service-based / Both. */
  mode?: QuestionMode;
  withNote?: boolean;
  submitLabel: string;
  onSubmit: (body: FeedbackBody, note: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const { questions, otherEnabled, departmentList } = useFeedback();
  const [mode, setMode] = useState<QuestionMode>(fixedMode || 'BOTH');
  const [spokeKey, setSpokeKey] = useState(contacts[0]?.id || OTHER);
  const [spokeWith, setSpokeWith] = useState('');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asked = useMemo(() => questionsFor(questions, mode, services), [questions, mode, services]);
  const counts = useMemo(() => (fixedMode ? { [fixedMode]: asked.length } : modeCounts(questions, services, [])), [fixedMode, asked.length, questions, services]);
  const chosen = chosenAnswers(asked, answers);
  const missing = asked.filter((q) => q.is_required && !answers[q.id]);
  const spoken = contacts.find((c) => c.id === spokeKey) || null;

  async function submit() {
    const who = spoken ? spoken.name : spokeWith.trim();
    if (!who) return setError('Choose or type who gave the feedback');
    if (!chosen.length) return setError('Ask the customer the questions first');
    if (missing.length) return setError(`Answer "${missing[0].question_text}"`);
    setSaving(true);
    setError(null);
    try {
      await onSubmit(
        {
          ...(spoken ? { contact_id: spoken.id } : {}),
          spoke_with_name: who,
          responses: chosen.map((r) => ({ question_id: r.question_id, option_id: r.option_id })),
          other_feedback: otherEnabled ? other.trim() || null : null,
          started_at: null,
          ...modeBody(mode),
        },
        note.trim() || null,
      );
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <Sheet visible onClose={saving ? () => {} : onClose} title={title}>
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: color }]}>
          <Text style={styles.heroTitle}>{heading}</Text>
          <Text style={styles.heroText}>{text}</Text>
        </View>
        <CrmErrorBanner message={error} />
        <SelectField
          label="Spoke with"
          placeholder="Choose who gave the feedback"
          sheetTitle="Who gave the feedback?"
          options={[...contacts.map((c) => ({ value: c.id, label: c.role ? `${c.name} · ${c.role}` : c.name })), { value: OTHER, label: 'Someone else' }]}
          value={spokeKey}
          onChange={setSpokeKey}
        />
        {spokeKey === OTHER && (
          <TextInput style={styles.input} placeholder="Name of the person" placeholderTextColor={theme.textMuted} value={spokeWith} onChangeText={setSpokeWith} maxLength={150} />
        )}
        {fixedMode && !asked.length ? (
          <Text style={[styles.empty, { marginTop: spacing.md }]}>There are no questions for this department yet. Add them on the web in Masters › Questions (type Department).</Text>
        ) : (
          <QuestionForm
            questions={asked}
            mode={mode}
            onMode={fixedMode ? () => {} : setMode}
            counts={counts}
            departments={departmentList}
            onSkip={(id) =>
              setAnswers((a) => {
                const next = { ...a };
                delete next[id];
                return next;
              })
            }
            answers={answers}
            onAnswer={(q, o) => setAnswers((a) => ({ ...a, [q]: o }))}
            other={other}
            onOther={setOther}
            otherEnabled={otherEnabled}
          />
        )}
        {withNote && (
          <>
            <Text style={styles.label}>Note for the team (optional)</Text>
            <TextInput style={styles.input} placeholder="e.g. Cockroaches back in the kitchen" placeholderTextColor={theme.textMuted} value={note} onChangeText={setNote} maxLength={400} />
          </>
        )}
        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} disabled={saving} />
          <PrimaryButton label={submitLabel} style={{ flex: 1 }} onPress={submit} loading={saving} disabled={!chosen.length} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

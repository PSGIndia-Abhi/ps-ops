import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { EmailIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { WhatsAppIcon } from '../crm/ui/crmIcons';
import { SelectField } from '../crm/ui/SelectField';
import { radii, spacing, typography } from '../theme';
import { errorText, prepareWhatsapp } from './api';
import { useFeedback } from './FeedbackContext';
import { EMAIL_LABELS, emailTemplateFor, fillEmail, mailtoUrl, waPhoneProblem } from './format';
import type { Contact } from './types';
import { Panel } from './ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One message to the customer: sent on WhatsApp (a template filled by the server), by email, or both. */
export interface CustomerMessage {
  key: string;
  label: string;
  /** WhatsApp template code, e.g. THANK_YOU, TICKET_RAISED, REVISIT_BOOKED, ISSUE_RESOLVED. */
  whatsapp?: string;
  /** Email template code: THANK_YOU, ISSUE_RECEIVED, ISSUE_RESOLVED. */
  email?: string;
  ticketId?: string;
  ticketNumber?: string;
  issue?: string | null;
  revisitDate?: string | null;
  closeNote?: string | null;
}

const factory = (t: CrmTheme) => ({
  msg: { borderWidth: 1, borderColor: t.border, borderRadius: radii.lg, padding: spacing.sm, marginTop: spacing.sm },
  msgTitle: { ...typography.bodyMedium, color: t.textPrimary, marginBottom: spacing.xs },
  btns: { flexDirection: 'row' as const, gap: spacing.xs },
  btn: { flex: 1, minHeight: 44, borderRadius: radii.md, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6 },
  wa: { backgroundColor: '#1FAA53' },
  mail: { backgroundColor: t.primary },
  off: { opacity: 0.45 },
  btnText: { ...typography.captionMedium, fontWeight: '700' as const, color: '#FFFFFF' },
  hint: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs },
  problem: { marginTop: spacing.xs, padding: spacing.sm, borderRadius: radii.md, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  problemText: { ...typography.caption, color: '#991B1B' },
});

/**
 * Messages to the customer after the call: pick who gets them, then open WhatsApp or the mail app
 * with the text ready - the person checks it and presses Send there.
 */
export function MessagesPanel({
  callId,
  contacts,
  messages,
  info,
  onSent,
  onError,
  defaultContactId,
}: {
  callId: string;
  contacts: Contact[];
  /** The number picked on the call - messages go to it unless another is chosen here. */
  defaultContactId?: string | null;
  messages: CustomerMessage[];
  info: { customer: string; site: string; month: string };
  onSent: (text: string) => void;
  onError: (text: string) => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const { user } = useAuth();
  const { emailTemplates } = useFeedback();
  const picked = contacts.find((c) => c.id === defaultContactId && c.phone);
  const first = picked || contacts.find((c) => c.is_primary && c.phone) || contacts.find((c) => c.phone) || contacts[0];
  const [toKey, setToKey] = useState<string>(first?.id || '');
  // Follow the number picked on the call until a different one is chosen here.
  const [chosenHere, setChosenHere] = useState(false);
  useEffect(() => {
    if (!chosenHere && picked) setToKey(picked.id);
  }, [chosenHere, picked]);
  const [busy, setBusy] = useState('');
  // A WhatsApp problem (e.g. a number it can't use), shown in this panel, not at the top.
  const [problem, setProblem] = useState<{ key: string; text: string } | null>(null);
  const to = contacts.find((c) => c.id === toKey) || null;
  const phone = !!to?.phone?.trim();
  const email = !!to?.email && EMAIL_RE.test(to.email.trim());

  if (!messages.length || !contacts.length) return null;

  async function sendWhatsapp(m: CustomerMessage) {
    if (!to || !m.whatsapp) return;
    const bad = waPhoneProblem(to);
    if (bad) {
      setProblem({ key: m.key, text: bad });
      return;
    }
    setProblem(null);
    setBusy(m.key + 'wa');
    try {
      const res = await prepareWhatsapp(callId, { template_code: m.whatsapp, contact_id: to.id, ticket_id: m.ticketId });
      await Linking.openURL(res.wa_me_url);
      onSent(`WhatsApp "${m.label}" opened for ${to.name}. Press Send there.`);
    } catch (err) {
      const text = errorText(err, 'Could not open WhatsApp.');
      setProblem({ key: m.key, text: /not a phone number whatsapp can use/i.test(text) ? waPhoneProblem(to) || text : text });
    } finally {
      setBusy('');
    }
  }

  async function sendEmail(m: CustomerMessage) {
    if (!to?.email || !m.email) return;
    const template = emailTemplateFor(emailTemplates, m.email);
    if (!template) return;
    const { subject, body } = fillEmail(template, {
      name: to.name,
      customer: info.customer,
      site: info.site,
      month: info.month,
      ticketNumber: m.ticketNumber,
      issue: m.issue,
      revisitDate: m.revisitDate,
      closeNote: m.closeNote,
      sender: user?.name,
    });
    try {
      await Linking.openURL(mailtoUrl(to.email.trim(), subject, body));
      onSent(`Email "${m.label}" opened for ${to.name}. Press Send in your mail app.`);
    } catch {
      onError('No mail app found on this phone.');
    }
  }

  return (
    <Panel title="Message the customer">
      <SelectField
        label="Send to"
        placeholder="Choose a contact"
        sheetTitle="Who gets the message?"
        options={contacts.map((c) => ({ value: c.id, label: [c.name, c.role, c.phone].filter(Boolean).join(' · ') }))}
        value={toKey || null}
        onChange={(v) => {
          setToKey(v);
          setChosenHere(true);
          setProblem(null);
        }}
      />
      {to && (!phone || !email) && (
        <Text style={styles.hint}>
          {!phone && !email ? `${to.name} has no phone or email.` : !phone ? `${to.name} has no phone number - WhatsApp is off.` : `${to.name} has no email - email is off.`}
        </Text>
      )}
      {messages.map((m) => {
        const hasEmail = !!m.email && !!emailTemplateFor(emailTemplates, m.email);
        return (
          <View key={m.key} style={styles.msg}>
            <Text style={styles.msgTitle}>{m.label}</Text>
            <View style={styles.btns}>
              {!!m.whatsapp && (
                <Pressable
                  onPress={() => sendWhatsapp(m)}
                  disabled={!phone || !!busy}
                  style={[styles.btn, styles.wa, (!phone || !!busy) && styles.off]}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.label} on WhatsApp`}
                >
                  <WhatsAppIcon size={16} />
                  <Text style={styles.btnText}>{busy === m.key + 'wa' ? 'Opening…' : 'WhatsApp'}</Text>
                </Pressable>
              )}
              {hasEmail && (
                <Pressable
                  onPress={() => sendEmail(m)}
                  disabled={!email}
                  style={[styles.btn, styles.mail, !email && styles.off]}
                  accessibilityRole="button"
                  accessibilityLabel={EMAIL_LABELS[m.email!] || 'Email'}
                >
                  <EmailIcon size={16} color={theme.textOnPrimary} />
                  <Text style={styles.btnText}>Email</Text>
                </Pressable>
              )}
            </View>
            {problem?.key === m.key && (
              <View style={styles.problem}>
                <Text style={styles.problemText}>{problem.text}</Text>
              </View>
            )}
          </View>
        );
      })}
    </Panel>
  );
}

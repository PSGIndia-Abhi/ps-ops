import React, { useRef, useState } from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { Option } from '../../crm/types';
import { CrmErrorBanner, CrmScreen } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { SelectField } from '../../crm/ui/SelectField';
import { TopBar } from '../../crm/ui/TopBar';
import { spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { SOURCE_LABELS } from '../stage';
import type { CommercialLeadSource, NewCommercialLead } from '../types';
import { errorMessage, FieldRow } from '../ui';

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  help: { ...typography.caption, color: t.textMuted, marginBottom: spacing.md },
  notes: { minHeight: 96, textAlignVertical: 'top' as const },
});

const SOURCES: Option<CommercialLeadSource>[] = (Object.keys(SOURCE_LABELS) as CommercialLeadSource[]).map((value) => ({
  value,
  label: SOURCE_LABELS[value],
}));

type Errors = Partial<Record<'companyName' | 'contactPerson' | 'phone' | 'alternatePhone' | 'email' | 'address' | 'source' | 'amount', string>>;

const digits = (v: string) => v.replace(/\D/g, '');

/** Mirrors the checks POST /api/crm/leads makes for a commercial lead, so mistakes show on the field. */
export function validateNewLead(f: {
  companyName: string;
  contactPerson: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  source: CommercialLeadSource | null;
  amount: string;
}): Errors {
  const e: Errors = {};
  if (f.companyName.trim().length < 2) e.companyName = 'Enter the company or business name';
  if (f.contactPerson.trim().length < 2) e.contactPerson = 'Enter the contact person';
  if (digits(f.phone).length !== 10) e.phone = 'Enter a 10-digit phone number';
  if (f.alternatePhone && digits(f.alternatePhone).length !== 10) e.alternatePhone = 'Enter a 10-digit number or leave it empty';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (!f.address.trim()) e.address = 'Enter the address';
  if (!f.source) e.source = 'Choose where the lead came from';
  const amount = Number(f.amount);
  if (!f.amount || !Number.isFinite(amount) || amount <= 0 || amount > 99999999) e.amount = 'Enter the approximate quote';
  return e;
}

/** A reference the server accepts (APP- + 8..36 letters, digits or dashes) to recognise a retried save. */
const newClientRef = () => `APP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Add a commercial lead (telecaller / sales manager). Sales executives use the CRM app's own form. */
export function LeadNewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { styles } = useCrmStyles(factory);
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState<CommercialLeadSource | null>(null);
  const [amount, setAmount] = useState('');
  const [requirement, setRequirement] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One reference for this form's lifetime: pressing Save again after a lost reply returns the same lead.
  const clientRef = useRef(newClientRef());

  const onSave = async () => {
    const found = validateNewLead({ companyName, contactPerson, phone, alternatePhone, email, address, source, amount });
    setErrors(found);
    if (Object.keys(found).length > 0 || !source || saving) return;

    const input: NewCommercialLead = {
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      phone: digits(phone),
      alternatePhone: digits(alternatePhone),
      email: email.trim(),
      address: address.trim(),
      source,
      amount: Number(amount),
      requirement: requirement.trim(),
    };
    setSaving(true);
    setError(null);
    try {
      const lead = await api.createLead(input, clientRef.current);
      navigation.replace('LeadWork', { leadId: lead.id });
    } catch (err) {
      setError(errorMessage(err, 'Could not save the lead. Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <TopBar title="New commercial lead" onBack={() => navigation.goBack()} icon="close" />
      <CrmScreen edges={[]} contentStyle={styles.body}>
        <Text style={styles.help}>Offices, factories, warehouses, malls, schools, hospitals and other businesses.</Text>
        <CrmErrorBanner message={error} />
        <CrmTextField label="Company / business name" value={companyName} onChangeText={setCompanyName} error={errors.companyName} maxLength={150} autoCapitalize="words" />
        <CrmTextField label="Contact person" value={contactPerson} onChangeText={setContactPerson} error={errors.contactPerson} maxLength={150} autoCapitalize="words" />
        <FieldRow>
          <CrmTextField label="Phone number" value={phone} onChangeText={setPhone} error={errors.phone} keyboardType="number-pad" maxLength={10} />
          <CrmTextField label="Alt. phone" value={alternatePhone} onChangeText={setAlternatePhone} error={errors.alternatePhone} keyboardType="number-pad" maxLength={10} />
        </FieldRow>
        <CrmTextField label="Email (optional)" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={150} />
        <FieldRow>
          <SelectField label="Source of lead" placeholder="Choose" options={SOURCES} value={source} onChange={setSource} error={errors.source} />
          <CrmTextField label="Approx. quote (₹)" value={amount} onChangeText={(v) => setAmount(digits(v))} error={errors.amount} keyboardType="number-pad" maxLength={8} />
        </FieldRow>
        <CrmTextField label="Address" value={address} onChangeText={setAddress} error={errors.address} maxLength={255} />
        <CrmTextField label="Requirement / notes" value={requirement} onChangeText={setRequirement} placeholder="e.g. Annual pest control contract" multiline maxLength={2000} style={styles.notes} />
        <PrimaryButton label="Save lead" onPress={onSave} loading={saving} />
      </CrmScreen>
    </CrmScreen>
  );
}

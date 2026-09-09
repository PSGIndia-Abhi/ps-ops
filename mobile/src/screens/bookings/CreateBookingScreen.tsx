import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { TextField } from '../../components/TextField';
import { PillSelect } from '../../components/PillSelect';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Banner';
import { ListRow } from '../../components/ListRow';
import { CheckCircleIcon } from '../../components/icons';
import { contactsApi, bookingsApi, usersApi, ApiError } from '../../api';
import { colors, radii, spacing, typography } from '../../theme';
import type { Contact } from '../../types/contact';
import type { TeamMember } from '../../types/team';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

// Exact list from the real web app (frontend/src/components/CreateBookingModal.jsx)
// - not invented.
const PEST_SERVICES = [
  'General Pest Control (GPC)',
  'General Pest Control + Rodent Control (GPC + RC)',
  'Mosquito Treatment',
  'Mosquito Fogging',
  'Mosquito IRS (Indoor Residual Spray)',
  'Mosquito Larval Treatment',
  'Cockroach Treatment',
  'Cockroach Gel Treatment',
  'Ant Treatment',
  'Fly Treatment',
  'Bed Bug Treatment',
  'Snake Control',
  'Honey Bee Treatment',
  'Rodent Control',
  'Drainage Treatment',
  'Termite Pre-Construction Treatment',
  'Termite Post-Construction Treatment',
  'Lizard Control',
  'Deep Fumigation',
];

const DEEP_CLEANING_SERVICES = [
  'Floor Protection',
  'Electrical Shifting',
  'Electrical New Point Installation',
  'Plumbing Work',
  'Painting Work',
  'Regular Cleaning',
  'Deep Cleaning',
  'Deep Cleaning with Scrubbing',
  'Deep Cleaning with Sticker Removal',
  'Debris Removal',
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mirrors the real web form's actual scope (frontend/src/components/
 * CreateBookingModal.jsx / backend/src/controllers/bookings.controller.js)
 * with one deliberate simplification: a single start/end date applies to
 * the whole booking rather than a per-service schedule matrix, and
 * recurrence isn't offered - both are real, more advanced capabilities of
 * the same endpoint, intentionally deferred (see the Phase 5 report) rather
 * than half-built here.
 */
export function CreateBookingScreen() {
  const navigation = useNavigation<Nav>();

  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const [serviceType, setServiceType] = useState<'PEST' | 'DEEP' | 'BOTH'>('BOTH');
  const [subServices, setSubServices] = useState<Set<string>>(new Set());

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [supervisors, setSupervisors] = useState<TeamMember[]>([]);
  const [technicians, setTechnicians] = useState<TeamMember[]>([]);
  const [supervisorId, setSupervisorId] = useState<string | number | null>(null);
  const [technicianIds, setTechnicianIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    contactsApi
      .listContacts()
      .then(setContacts)
      .catch(() => setContacts([]));
    usersApi
      .listUsersByRole('supervisor')
      .then(setSupervisors)
      .catch(() => setSupervisors([]));
    usersApi
      .listUsersByRole('technician')
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
  }, []);

  const visibleServices = useMemo(() => {
    if (serviceType === 'PEST') return PEST_SERVICES;
    if (serviceType === 'DEEP') return DEEP_CLEANING_SERVICES;
    return [...PEST_SERVICES, ...DEEP_CLEANING_SERVICES];
  }, [serviceType]);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    const query = contactSearch.trim().toLowerCase();
    if (!query) return contacts.slice(0, 20);
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(query) || (c.phone ?? '').includes(query),
    );
  }, [contacts, contactSearch]);

  function toggleService(service: string) {
    setSubServices((prev) => {
      const next = new Set(prev);
      if (next.has(service)) next.delete(service);
      else next.add(service);
      return next;
    });
  }

  function toggleTechnician(id: string | number) {
    setTechnicianIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);

    if (!selectedContact) {
      setError('Please select who is requesting this booking.');
      return;
    }
    if (subServices.size === 0) {
      setError('Please select at least one service.');
      return;
    }
    if (!DATE_PATTERN.test(startDate)) {
      setError('Enter the service date as YYYY-MM-DD.');
      return;
    }
    if (endDate && !DATE_PATTERN.test(endDate)) {
      setError('Enter the end date as YYYY-MM-DD, or leave it blank.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('End date cannot be before the start date.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await bookingsApi.createBooking({
        contact_id: selectedContact.id,
        serviceType,
        subServices: Array.from(subServices),
        start_date: startDate,
        end_date: endDate || null,
        location: address.trim() || undefined,
        notes: notes.trim() || undefined,
        supervisor_id: supervisorId ?? undefined,
        technician_ids: technicianIds.size ? Array.from(technicianIds) : undefined,
      });
      const firstJob = result.jobs[0];
      if (firstJob?.booking_id) {
        navigation.replace('BookingDetail', { bookingId: firstJob.booking_id });
      } else {
        navigation.goBack();
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to create booking. Please check the required fields.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer edges={['bottom']}>
      <Text style={styles.title}>New booking</Text>

      {!!error && <Banner message={error} variant="validation" />}

      <Text style={styles.sectionTitle}>Requested by</Text>
      {selectedContact ? (
        <View style={styles.selectedContact}>
          <View style={styles.selectedContactText}>
            <Text style={styles.selectedContactName}>{selectedContact.name}</Text>
            {!!selectedContact.company_name && (
              <Text style={styles.selectedContactMeta}>{selectedContact.company_name}</Text>
            )}
          </View>
          <Pressable onPress={() => setSelectedContact(null)} hitSlop={8}>
            <Text style={styles.changeLink}>Change</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <TextField
            value={contactSearch}
            onChangeText={setContactSearch}
            placeholder="Search contact by name or phone"
            autoCapitalize="none"
          />
          <View style={styles.contactList}>
            {filteredContacts.map((contact) => (
              <ListRow
                key={contact.id}
                title={contact.name}
                subtitle={contact.company_name ?? contact.phone ?? undefined}
                onPress={() => setSelectedContact(contact)}
              />
            ))}
            {contacts && filteredContacts.length === 0 && (
              <Text style={styles.emptyText}>No matching contacts.</Text>
            )}
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Service</Text>
      <PillSelect
        options={[
          { value: 'PEST', label: 'Pest Control' },
          { value: 'DEEP', label: 'Deep Cleaning' },
        ]}
        value={serviceType === 'BOTH' ? null : serviceType}
        onChange={(v) => setServiceType(v)}
      />
      <View style={styles.card}>
        {visibleServices.map((service) => {
          const selected = subServices.has(service);
          return (
            <Pressable key={service} style={styles.serviceRow} onPress={() => toggleService(service)}>
              <Text style={styles.serviceLabel}>{service}</Text>
              {selected && <CheckCircleIcon size={18} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Schedule</Text>
      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <TextField label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
        </View>
        <View style={styles.dateField}>
          <TextField label="End date (optional)" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Details</Text>
      <TextField label="Address" value={address} onChangeText={setAddress} placeholder="Service address" />
      <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

      {(supervisors.length > 0 || technicians.length > 0) && (
        <>
          <Text style={styles.sectionTitle}>Assignment (optional)</Text>
          {supervisors.length > 0 && (
            <PillSelect
              label="Supervisor"
              options={supervisors.map((s) => ({ value: String(s.id), label: s.name }))}
              value={supervisorId !== null ? String(supervisorId) : null}
              onChange={(v) => setSupervisorId(v)}
            />
          )}
          {technicians.length > 0 && (
            <View style={styles.card}>
              {technicians.map((tech) => (
                <ListRow
                  key={tech.id}
                  title={tech.name}
                  onPress={() => toggleTechnician(tech.id)}
                  trailing={
                    technicianIds.has(String(tech.id)) ? (
                      <CheckCircleIcon size={18} color={colors.primary} />
                    ) : undefined
                  }
                />
              ))}
            </View>
          )}
        </>
      )}

      <Button label="Create Booking" onPress={handleSubmit} loading={submitting} style={styles.submit} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  contactList: {
    marginTop: spacing.sm,
    maxHeight: 260,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  selectedContact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoftBg,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  selectedContactText: {
    flexShrink: 1,
  },
  selectedContactName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  selectedContactMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  changeLink: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  serviceLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateField: {
    flex: 1,
  },
  submit: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
});

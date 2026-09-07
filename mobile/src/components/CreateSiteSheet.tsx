import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { Banner } from './Banner';
import { TextField } from './TextField';
import { colors, radii, spacing, typography } from '../theme';

interface CreateSiteSheetProps {
  visible: boolean;
  companyName: string;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  }) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

/**
 * No map/place picker here (the web uses Google Places autocomplete for
 * lat/lng, which this mobile flow doesn't integrate) - address fields are
 * plain text. latitude/longitude/place_id are optional on the backend and
 * simply omitted, not fabricated.
 */
export function CreateSiteSheet({
  visible,
  companyName,
  onClose,
  onCreate,
  submitting,
  error,
}: CreateSiteSheetProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setAddress('');
    setCity('');
    setState('');
    setPostalCode('');
    setCountry('');
    setValidationError(null);
  }, [visible]);

  async function handleSubmit() {
    if (!name.trim()) {
      setValidationError('Site name is required.');
      return;
    }
    setValidationError(null);
    await onCreate({
      name: name.trim(),
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      postal_code: postalCode.trim() || undefined,
      country: country.trim() || undefined,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={submitting ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>New site</Text>
          <Text style={styles.subtitle}>Under {companyName}</Text>

          {!!validationError && <Banner message={validationError} variant="validation" />}
          {!!error && <Banner message={error} variant="error" />}

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            <TextField label="Site name" value={name} onChangeText={setName} placeholder="Head Office" editable={!submitting} />
            <TextField label="Address" value={address} onChangeText={setAddress} placeholder="Street, building" editable={!submitting} />
            <TextField label="City" value={city} onChangeText={setCity} editable={!submitting} />
            <TextField label="State" value={state} onChangeText={setState} editable={!submitting} />
            <TextField label="Postal code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" editable={!submitting} />
            <TextField label="Country" value={country} onChangeText={setCountry} editable={!submitting} />
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} disabled={submitting} style={styles.action} />
            <Button label="Create" onPress={handleSubmit} loading={submitting} style={styles.action} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  form: {
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});

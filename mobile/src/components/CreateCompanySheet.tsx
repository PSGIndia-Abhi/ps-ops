import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { Banner } from './Banner';
import { TextField } from './TextField';
import { PillSelect } from './PillSelect';
import { groupsApi } from '../api';
import type { CompanyType } from '../types/company';
import type { Group } from '../types/group';
import { colors, radii, spacing, typography } from '../theme';

interface CreateCompanySheetProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    code?: string;
    gst_number?: string;
    type?: CompanyType;
    group_id?: string;
  }) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

const TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'CORPORATE', label: 'Corporate' },
  { value: 'RWA', label: 'RWA' },
];

export function CreateCompanySheet({ visible, onClose, onCreate, submitting, error }: CreateCompanySheetProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [gst, setGst] = useState('');
  const [type, setType] = useState<CompanyType | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setCode('');
    setGst('');
    setType(null);
    setGroupId(null);
    setValidationError(null);
    groupsApi
      .listGroups()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [visible]);

  async function handleSubmit() {
    if (!name.trim()) {
      setValidationError('Company name is required.');
      return;
    }
    setValidationError(null);
    await onCreate({
      name: name.trim(),
      code: code.trim() || undefined,
      gst_number: gst.trim() || undefined,
      type: type ?? undefined,
      group_id: groupId ?? undefined,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={submitting ? undefined : onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>New company</Text>

          {!!validationError && <Banner message={validationError} variant="validation" />}
          {!!error && <Banner message={error} variant="error" />}

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            <TextField label="Company name" value={name} onChangeText={setName} placeholder="ABC Enterprises" editable={!submitting} />
            <TextField label="Code" value={code} onChangeText={setCode} placeholder="ABC" autoCapitalize="characters" editable={!submitting} />
            <TextField label="GST number" value={gst} onChangeText={setGst} placeholder="Optional" editable={!submitting} />
            <PillSelect label="Type" options={TYPE_OPTIONS} value={type} onChange={setType} />
            {groups.length > 0 && (
              <PillSelect
                label="Group"
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
                value={groupId}
                onChange={setGroupId}
              />
            )}
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
    // paddingBottom set inline (see below) - a fixed value here would sit
    // flush against, or underneath, a 3-button Android nav bar.
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

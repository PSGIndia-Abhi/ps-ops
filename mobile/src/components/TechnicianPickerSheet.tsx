import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { Banner } from './Banner';
import { CheckCircleIcon } from './icons';
import { teamsApi, ApiError } from '../api';
import { colors, radii, spacing, typography } from '../theme';

interface TechnicianPickerSheetProps {
  visible: boolean;
  title: string;
  currentTechnicianIds: Array<string | number>;
  onClose: () => void;
  onConfirm: (technicianIds: Array<string | number>) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

/**
 * A technician-only multi-select, reused for changing who's assigned to a
 * specific visit (PATCH /api/visits/:id/technicians) - no supervisor
 * picker here, unlike ReassignSheet's job-level reassignment.
 */
export function TechnicianPickerSheet({
  visible,
  title,
  currentTechnicianIds,
  onClose,
  onConfirm,
  submitting,
  error,
}: TechnicianPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<{ id: string | number; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(currentTechnicianIds.map(String)));
    setLoading(true);
    setLoadError(null);
    teamsApi
      .getTeamOverview()
      .then((overview) => {
        const all = [
          ...overview.supervisors.flatMap((s) => s.technicians),
          ...overview.unassignedTechnicians,
        ];
        setTechnicians(all);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Unable to load technicians right now.');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function toggle(id: string | number) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
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
          <Text style={styles.title}>{title}</Text>

          {!!loadError && <Banner message={loadError} variant="error" />}
          {!!error && <Banner message={error} variant="error" />}

          {loading ? (
            <Text style={styles.loadingText}>Loading technicians...</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {technicians.map((tech) => (
                <Pressable key={tech.id} style={styles.optionRow} onPress={() => toggle(tech.id)}>
                  <Text style={styles.optionLabel}>{tech.name}</Text>
                  {selected.has(String(tech.id)) && <CheckCircleIcon size={18} color={colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} disabled={submitting} style={styles.action} />
            <Button
              label="Confirm"
              onPress={() => onConfirm(Array.from(selected))}
              loading={submitting}
              disabled={loading}
              style={styles.action}
            />
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
    maxHeight: '80%',
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
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  list: {
    marginBottom: spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    marginBottom: spacing.xs,
  },
  optionLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});

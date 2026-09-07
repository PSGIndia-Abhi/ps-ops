import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { Banner } from './Banner';
import { TextField } from './TextField';
import { PillSelect } from './PillSelect';
import { CheckCircleIcon } from './icons';
import { useAuth } from '../auth/AuthContext';
import { teamsApi, usersApi, ApiError } from '../api';
import type { ReassignScope } from '../api/jobs';
import type { TeamMember } from '../types/team';
import { colors, radii, spacing, typography } from '../theme';

interface ReassignSheetProps {
  visible: boolean;
  currentTechnicianIds: Array<string | number>;
  currentSupervisorId: string | number | null;
  isAdmin: boolean;
  /** Only offered when the job belongs to a recurring booking (has_recurring). */
  supportsRecurringScope: boolean;
  onConfirm: (
    supervisorId: string | number,
    technicianIds: Array<string | number>,
    scope: ReassignScope,
    range?: { start: string; end: string },
  ) => Promise<void>;
  onClose: () => void;
  submitting: boolean;
  error: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reassigns technicians (and, for admins, the supervisor) on a job.
 * Supervisor/technician lists come from GET /api/users?role= for admins -
 * the actual data source the real web app's AssignWorkOrderModal uses -
 * and from the supervisor's own GET /api/teams/my/team when they're
 * reassigning their own job (they can't hand it to a different supervisor
 * through this screen, matching how the role is actually used in
 * practice).
 */
export function ReassignSheet({
  visible,
  currentTechnicianIds,
  currentSupervisorId,
  isAdmin,
  supportsRecurringScope,
  onConfirm,
  onClose,
  submitting,
  error,
}: ReassignSheetProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supervisors, setSupervisors] = useState<TeamMember[]>([]);
  const [technicians, setTechnicians] = useState<TeamMember[]>([]);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | number | null>(
    currentSupervisorId,
  );
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<Set<string>>(
    new Set(currentTechnicianIds.map(String)),
  );
  const [scope, setScope] = useState<ReassignScope>('current');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setScope('current');
    setRangeStart('');
    setRangeEnd('');
    setValidationError(null);

    (async () => {
      try {
        if (isAdmin) {
          const [sups, techs] = await Promise.all([
            usersApi.listUsersByRole('supervisor'),
            usersApi.listUsersByRole('technician'),
          ]);
          if (cancelled) return;
          setSupervisors(sups);
          setTechnicians(techs);
          setSelectedSupervisorId(currentSupervisorId ?? sups[0]?.id ?? null);
        } else {
          const myTeam = await teamsApi.listMyTeam();
          if (cancelled) return;
          setTechnicians(myTeam);
          setSelectedSupervisorId(user?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Unable to load technicians right now.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isAdmin]);

  function toggleTechnician(id: string | number) {
    setSelectedTechnicianIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    if (!selectedSupervisorId) return;
    if (scope === 'range') {
      if (!DATE_PATTERN.test(rangeStart) || !DATE_PATTERN.test(rangeEnd)) {
        setValidationError('Enter both dates as YYYY-MM-DD.');
        return;
      }
      if (rangeEnd < rangeStart) {
        setValidationError('End date cannot be before start date.');
        return;
      }
    }
    setValidationError(null);
    onConfirm(
      selectedSupervisorId,
      Array.from(selectedTechnicianIds),
      scope,
      scope === 'range' ? { start: rangeStart, end: rangeEnd } : undefined,
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={submitting ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Reassign this job</Text>

          {!!validationError && <Banner message={validationError} variant="validation" />}
          {!!error && <Banner message={error} variant="error" />}
          {!!loadError && <Banner message={loadError} variant="error" />}

          {loading ? (
            <Text style={styles.loadingText}>Loading team...</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {supportsRecurringScope && (
                <PillSelect
                  label="Apply to"
                  options={[
                    { value: 'current', label: 'This job only' },
                    { value: 'range', label: 'Date range' },
                    { value: 'future', label: 'All following jobs' },
                  ]}
                  value={scope}
                  onChange={setScope}
                />
              )}

              {scope === 'range' && (
                <View style={styles.dateRow}>
                  <View style={styles.dateField}>
                    <TextField label="From" value={rangeStart} onChangeText={setRangeStart} placeholder="YYYY-MM-DD" />
                  </View>
                  <View style={styles.dateField}>
                    <TextField label="To" value={rangeEnd} onChangeText={setRangeEnd} placeholder="YYYY-MM-DD" />
                  </View>
                </View>
              )}

              {isAdmin && (
                <>
                  <Text style={styles.sectionLabel}>Supervisor</Text>
                  {supervisors.map((s) => (
                    <Pressable
                      key={s.id}
                      style={styles.optionRow}
                      onPress={() => setSelectedSupervisorId(s.id)}
                    >
                      <Text style={styles.optionLabel}>
                        {s.branch_name ? `${s.name} · ${s.branch_name}` : s.name}
                      </Text>
                      {String(s.id) === String(selectedSupervisorId) && (
                        <CheckCircleIcon size={18} color={colors.primary} />
                      )}
                    </Pressable>
                  ))}
                </>
              )}

              <Text style={styles.sectionLabel}>Technicians</Text>
              {technicians.length === 0 ? (
                <Text style={styles.emptyText}>No technicians available.</Text>
              ) : (
                technicians.map((tech) => (
                  <Pressable
                    key={tech.id}
                    style={styles.optionRow}
                    onPress={() => toggleTechnician(tech.id)}
                  >
                    <Text style={styles.optionLabel}>
                      {tech.branch_name ? `${tech.name} · ${tech.branch_name}` : tech.name}
                    </Text>
                    {selectedTechnicianIds.has(String(tech.id)) && (
                      <CheckCircleIcon size={18} color={colors.primary} />
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} disabled={submitting} style={styles.action} />
            <Button
              label="Confirm"
              onPress={handleConfirm}
              loading={submitting}
              disabled={loading || !selectedSupervisorId}
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
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dateField: {
    flex: 1,
  },
  sectionLabel: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
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
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});

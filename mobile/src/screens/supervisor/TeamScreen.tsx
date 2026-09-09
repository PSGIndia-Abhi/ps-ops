import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ListRow } from '../../components/ListRow';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { UsersIcon } from '../../components/icons';
import { teamsApi, ApiError } from '../../api';
import { colors, spacing, typography } from '../../theme';
import type { TeamMember } from '../../types/team';

interface TeamRow extends TeamMember {
  onShift: boolean | null; // null = unknown (shift status call failed independently)
}

export function TeamScreen() {
  const [team, setTeam] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const members = await teamsApi.listMyTeam();

      // Shift status is a nice-to-have overlay, not core to the roster - a
      // failure here shouldn't block showing the team itself.
      let onlineIds = new Set<string>();
      try {
        const shifts = await teamsApi.getShiftStatusByTechnician();
        onlineIds = new Set(shifts.online.map((t) => String(t.technician_id)));
      } catch {
        // leave onShift as unknown for everyone below
      }

      setTeam(
        members.map((member) => ({
          ...member,
          onShift: onlineIds.size ? onlineIds.has(String(member.id)) : null,
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <Text style={styles.title}>My Technicians</Text>

      {!!error && <Banner message={error} variant="error" />}

      {team === null && !error ? (
        <View>
          <Skeleton height={60} radius={12} style={styles.skeletonRow} />
          <Skeleton height={60} radius={12} style={styles.skeletonRow} />
          <Skeleton height={60} radius={12} style={styles.skeletonRow} />
        </View>
      ) : team && team.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={32} color={colors.textMuted} />}
          title="No technicians assigned"
          subtitle="Technicians assigned to you will appear here."
        />
      ) : (
        team?.map((member) => (
          <ListRow
            key={member.id}
            leadingInitial={member.name.charAt(0).toUpperCase()}
            title={member.name}
            subtitle="Technician"
            trailing={
              member.onShift !== null ? (
                <View style={styles.shiftPill}>
                  <View
                    style={[
                      styles.shiftDot,
                      { backgroundColor: member.onShift ? colors.success : colors.textMuted },
                    ]}
                  />
                  <Text style={styles.shiftText}>{member.onShift ? 'On shift' : 'Off shift'}</Text>
                </View>
              ) : undefined
            }
          />
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  skeletonRow: {
    marginBottom: spacing.xs,
  },
  shiftPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginRight: spacing.xs,
  },
  shiftDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  shiftText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

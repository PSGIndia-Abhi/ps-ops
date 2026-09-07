import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ListRow } from '../../components/ListRow';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { UsersIcon } from '../../components/icons';
import { groupsApi, ApiError } from '../../api';
import { colors, radii, spacing, typography } from '../../theme';
import type { Group } from '../../types/group';

/**
 * A "Group" is a company-organization umbrella (a Company optionally
 * belongs to one) - not a technician team, see types/group.ts. The backend
 * has no edit endpoint, so this screen is list + create only, matching the
 * web app exactly.
 */
export function GroupsListScreen() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setGroups(await groupsApi.listGroups());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError('Group name is required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setSuccessMessage(null);
    try {
      await groupsApi.createGroup(trimmed);
      setName('');
      setSuccessMessage('Group created successfully');
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create group. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <Text style={styles.title}>Groups</Text>

      <View style={styles.createCard}>
        <Text style={styles.createLabel}>New group</Text>
        {!!createError && <Banner message={createError} variant="validation" />}
        {!!successMessage && <Banner message={successMessage} variant="success" />}
        <View style={styles.createRow}>
          <View style={styles.createInput}>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder="Group name"
              editable={!creating}
            />
          </View>
          <Button label="Add" onPress={handleCreate} loading={creating} style={styles.createButton} />
        </View>
      </View>

      {!!error && <Banner message={error} variant="error" />}

      {groups === null && !error ? (
        <Skeleton height={56} radius={12} />
      ) : groups && groups.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={28} color={colors.textMuted} />}
          title="No groups yet"
          subtitle="Groups you create will appear here."
        />
      ) : (
        groups?.map((group) => <ListRow key={group.id} title={group.name} />)
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
  createCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  createLabel: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  createInput: {
    flex: 1,
  },
  createButton: {
    minHeight: 48,
    marginTop: 2,
  },
});

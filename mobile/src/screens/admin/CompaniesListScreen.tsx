import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ListRow } from '../../components/ListRow';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { TextField } from '../../components/TextField';
import { CreateCompanySheet } from '../../components/CreateCompanySheet';
import { BriefcaseIcon } from '../../components/icons';
import { companiesApi, ApiError } from '../../api';
import { colors, spacing, typography } from '../../theme';
import type { Company, CompanyType } from '../../types/company';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

export function CompaniesListScreen() {
  const navigation = useNavigation<Nav>();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [sheetVisible, setSheetVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setCompanies(await companiesApi.listCompanies());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!companies) return null;
    const query = search.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.code ?? '').toLowerCase().includes(query) ||
        (c.group_name ?? '').toLowerCase().includes(query),
    );
  }, [companies, search]);

  async function handleCreate(input: {
    name: string;
    code?: string;
    gst_number?: string;
    type?: CompanyType;
    group_id?: string;
  }) {
    setCreating(true);
    setCreateError(null);
    try {
      await companiesApi.createCompany(input);
      setSheetVisible(false);
      setSuccessMessage('Company created successfully');
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create company. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Companies</Text>
        <Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
          <Text style={styles.addLink}>+ New</Text>
        </Pressable>
      </View>

      {!!successMessage && <Banner message={successMessage} variant="success" />}
      {!!error && <Banner message={error} variant="error" />}

      {companies && companies.length > 0 && (
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, code, or group"
          autoCapitalize="none"
        />
      )}

      {!filtered && !error ? (
        <View>
          <Skeleton height={60} radius={12} style={styles.skeletonRow} />
          <Skeleton height={60} radius={12} style={styles.skeletonRow} />
        </View>
      ) : !filtered ? null : filtered.length === 0 ? (
        <EmptyState
          icon={<BriefcaseIcon size={28} color={colors.textMuted} />}
          title={search ? 'No matching companies' : 'No companies yet'}
          subtitle={search ? 'Try a different search term.' : 'Companies you create will appear here.'}
        />
      ) : (
        filtered.map((company) => (
          <ListRow
            key={company.id}
            title={company.name}
            subtitle={[company.code, company.group_name].filter(Boolean).join(' · ') || company.type || undefined}
            onPress={() =>
              navigation.navigate('CompanyDetail', { companyId: company.id, companyName: company.name })
            }
          />
        ))
      )}

      <CreateCompanySheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onCreate={handleCreate}
        submitting={creating}
        error={createError}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  addLink: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  skeletonRow: {
    marginBottom: spacing.xs,
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ListRow } from '../../components/ListRow';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { CreateSiteSheet } from '../../components/CreateSiteSheet';
import { PinIcon } from '../../components/icons';
import { companiesApi, sitesApi, ApiError } from '../../api';
import { colors, radii, spacing, typography } from '../../theme';
import type { Company } from '../../types/company';
import type { Site } from '../../types/site';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthenticatedStackParamList, 'CompanyDetail'>;

export function CompanyDetailScreen({ route }: Props) {
  const { companyId, companyName } = route.params;

  const [company, setCompany] = useState<Company | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        const [companies, siteRows] = await Promise.all([
          companiesApi.listCompanies(),
          sitesApi.listSites(companyId),
        ]);
        setCompany(companies.find((c) => c.id === companyId) ?? null);
        setSites(siteRows);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setRefreshing(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateSite(input: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  }) {
    setCreating(true);
    setCreateError(null);
    try {
      await sitesApi.createSite({ ...input, company_id: companyId });
      setSheetVisible(false);
      setSuccessMessage('Site created successfully');
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create site. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['bottom']}>
      <Text style={styles.title}>{companyName}</Text>

      {!!successMessage && <Banner message={successMessage} variant="success" />}
      {!!error && <Banner message={error} variant="error" />}

      {!company && !error ? (
        <Skeleton height={80} radius={16} style={styles.skeletonGap} />
      ) : (
        !!company && (
          <View style={styles.infoCard}>
            {!!company.code && <Row label="Code" value={company.code} />}
            {!!company.type && <Row label="Type" value={company.type} />}
            {!!company.group_name && <Row label="Group" value={company.group_name} />}
            {!!company.gst_number && <Row label="GST" value={company.gst_number} />}
          </View>
        )
      )}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Sites</Text>
        <Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
          <Text style={styles.addLink}>+ New</Text>
        </Pressable>
      </View>

      {!sites && !error ? (
        <Skeleton height={60} radius={12} />
      ) : !sites ? null : sites.length === 0 ? (
        <EmptyState
          icon={<PinIcon size={28} color={colors.textMuted} />}
          title="No sites yet"
          subtitle="Sites you add for this company will appear here."
        />
      ) : (
        sites.map((site) => (
          <ListRow
            key={site.id}
            title={site.name ?? 'Site'}
            subtitle={[site.address, site.city].filter(Boolean).join(', ') || undefined}
          />
        ))
      )}

      <CreateSiteSheet
        visible={sheetVisible}
        companyName={companyName}
        onClose={() => setSheetVisible(false)}
        onCreate={handleCreateSite}
        submitting={creating}
        error={createError}
      />
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  skeletonGap: {
    marginBottom: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xxs,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  rowValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  addLink: {
    ...typography.captionMedium,
    color: colors.primary,
  },
});

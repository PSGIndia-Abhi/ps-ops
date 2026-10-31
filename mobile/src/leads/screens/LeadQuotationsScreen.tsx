import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRightIcon, DocumentIcon } from '../../components/icons';
import { formatINR, formatLeadWhen } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { savedQuotationPdf } from '../quotation';
import { QuotationPdfDialog } from '../QuotationDialogs';
import { actionLabel, isTerminal } from '../stage';
import type { Quotation } from '../types';
import { useLoad, useMe, LeadTopBar as TopBar, LeadScreen } from '../ui';

// A lead's quotations on their own page (opened from Manage lead): newest first, the latest one
// that still stands tagged LATEST, cancelled ones greyed. A tap opens the PDF card - Share, Open,
// Save to Downloads, and Edit / Duplicate while the lead is open (as before on Manage lead).

export function LeadQuotationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { leadId, name } = useRoute<RouteProp<LeadStackParamList, 'LeadQuotations'>>().params;
  const { myId, persona } = useMe();
  const { styles, theme } = useCrmStyles(factory);
  const loader = useCallback(async () => {
    const [lead, quotations] = await Promise.all([api.getLead(leadId), api.getQuotations(leadId)]);
    return { lead, quotations };
  }, [leadId]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load the quotations.');
  const [pdfFor, setPdfFor] = useState<Quotation | null>(null);

  const lead = data?.lead;
  const list = data?.quotations ?? [];
  const latestId = list.find((x) => x.status !== 'CANCELLED')?.id;
  // A saved quotation can be opened again to edit or duplicate while the lead is still open.
  const reopenable = (q: Quotation) => !!lead && !isTerminal(lead.stage) && q.status !== 'CANCELLED' && q.hasContent;
  const reopen = (q: Quotation, mode: 'edit' | 'duplicate') => {
    setPdfFor(null);
    if (lead) navigation.navigate('LeadQuoteBuild', { leadId: lead.id, name: lead.companyName, fromId: q.id, mode });
  };

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="Quotations" subtitle={name} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <CrmErrorBanner message={error} onRetry={reload} />
        {loading && !data ? (
          <>
            <CrmSkeleton height={130} radius={18} />
            <CrmSkeleton height={130} radius={18} />
          </>
        ) : list.length === 0 ? (
          <CrmEmptyState title="No quotations yet" subtitle="Create one from Manage lead - Next step." icon={<DocumentIcon size={30} color={theme.textMuted} />} />
        ) : (
          <>
            <View style={styles.head}>
              <Text style={styles.section}>QUOTATIONS</Text>
              <View style={styles.count}>
                <Text style={styles.countText}>{list.length}</Text>
              </View>
            </View>
            {list.map((q) => {
              const cancelled = q.status === 'CANCELLED';
              // The newest one that still stands is the one the customer is looking at.
              const latest = q.id === latestId;
              return (
                // A tap opens the PDF card: Share, Open, Save to Downloads, Edit, Duplicate.
                <Pressable
                  key={q.id}
                  disabled={!q.hasPdf}
                  onPress={() => setPdfFor(q)}
                  accessibilityRole="button"
                  accessibilityLabel={`${q.fileName}, ${formatINR(q.total)}${q.contractType ? `, ${q.contractType === 'AMC' ? 'AMC' : 'one-time'}` : ''}, ${cancelled ? 'cancelled' : 'sent'}`}
                  style={({ pressed }) => [styles.qCard, latest && styles.qCardLatest, cancelled && styles.qCardCancelled, pressed && styles.pressed]}
                >
                  {latest && (
                    <View style={styles.qLatest}>
                      <Text style={styles.qLatestText}>LATEST</Text>
                    </View>
                  )}
                  <View style={styles.qTop}>
                    <View style={styles.qPdf}>
                      <DocumentIcon size={20} color="#dc2626" />
                      <Text style={styles.qPdfText}>PDF</Text>
                    </View>
                    <View style={styles.qTitleBox}>
                      {/* The PDF's name (CLIENTNAME_PROPOSAL_YEAR.pdf); it wraps at its underscores. */}
                      <Text style={styles.qTitle} numberOfLines={3}>
                        {q.fileName.replace(/_/g, '_​')}
                      </Text>
                      <Text style={styles.qSub} numberOfLines={2}>
                        {[q.number, q.sentAt ? formatLeadWhen(q.sentAt) : ''].filter(Boolean).join('  ·  ')}
                      </Text>
                    </View>
                    {q.hasPdf && <ChevronRightIcon size={18} color={theme.textMuted} />}
                  </View>
                  <View style={styles.qBottom}>
                    <Text style={[styles.qAmount, cancelled && styles.qAmountCancelled]}>{formatINR(q.total)}</Text>
                    <View style={styles.qChips}>
                      {!!q.contractType && (
                        <View style={[styles.qChip, q.contractType === 'AMC' ? styles.qChipAmc : styles.qChipOnce]}>
                          <Text style={[styles.qChipText, q.contractType === 'AMC' ? styles.amcText : styles.onceText]}>{q.contractType === 'AMC' ? 'AMC' : 'One-time'}</Text>
                        </View>
                      )}
                      <View style={[styles.qChip, cancelled ? styles.qChipCancelled : styles.qChipSent]}>
                        <View style={[styles.qDot, { backgroundColor: cancelled ? theme.textMuted : theme.success }]} />
                        <Text style={[styles.qChipText, { color: cancelled ? theme.textMuted : theme.successText }]}>{cancelled ? 'Cancelled' : actionLabel(q.status)}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </CrmScreen>
      {pdfFor && lead && (
        <QuotationPdfDialog
          name={pdfFor.clientName || lead.companyName || ''}
          getFile={() => savedQuotationPdf(leadId, pdfFor.id, pdfFor.fileName)}
          onOpened={() => setPdfFor(null)}
          onClose={() => setPdfFor(null)}
          // Built in the app or on the web (its details are saved), on a lead still open. Editing it
          // saves a replacement - for whoever sent it or a sales manager, as on the web.
          onEdit={reopenable(pdfFor) && (pdfFor.createdBy === myId || persona === 'sales_manager') ? () => reopen(pdfFor, 'edit') : undefined}
          onDuplicate={reopenable(pdfFor) ? () => reopen(pdfFor, 'duplicate') : undefined}
        />
      )}
    </LeadScreen>
  );
}

const factory = (t: CrmTheme) => ({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs },
  section: { ...typography.overline, color: t.textMuted },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  countText: { ...typography.captionMedium, fontSize: 12, color: t.primary },
  // one small card each - PDF tile, file name, amount, One-time/AMC and status chips
  qCard: {
    marginTop: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    overflow: 'hidden' as const,
    ...t.cardShadow,
  },
  qCardLatest: { borderColor: t.primary, borderLeftWidth: 4, backgroundColor: t.primarySoftBg },
  qCardCancelled: { opacity: 0.6, backgroundColor: t.surfaceAlt },
  pressed: { opacity: 0.8 },
  qLatest: { position: 'absolute' as const, top: 0, right: 0, paddingHorizontal: spacing.sm, paddingVertical: 3, borderBottomLeftRadius: radii.md, backgroundColor: t.primary },
  qLatestText: { ...typography.caption, fontSize: 9, fontWeight: '800' as const, letterSpacing: 1, color: '#fff' },
  qTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  qPdf: { width: 44, height: 50, borderRadius: radii.md, backgroundColor: '#fee2e2', alignItems: 'center' as const, justifyContent: 'center' as const, gap: 1 },
  qPdfText: { ...typography.caption, fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.5, color: '#dc2626' },
  qTitleBox: { flex: 1, paddingRight: spacing.lg },
  qTitle: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  qSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  qBottom: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  qAmount: { ...typography.title, fontSize: 20, fontWeight: '800' as const, color: t.textPrimary },
  qAmountCancelled: { color: t.textMuted },
  qChips: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  qChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  qChipAmc: { backgroundColor: '#ffedd5' },
  qChipOnce: { backgroundColor: '#ccfbf1' },
  qChipSent: { backgroundColor: t.successBg },
  qChipCancelled: { backgroundColor: t.surfaceAlt },
  qChipText: { ...typography.captionMedium, fontSize: 12 },
  amcText: { color: '#c2410c' },
  onceText: { color: '#0f766e' },
  qDot: { width: 6, height: 6, borderRadius: 3 },
});

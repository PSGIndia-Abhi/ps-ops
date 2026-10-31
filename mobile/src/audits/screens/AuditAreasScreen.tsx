import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, CameraIcon, ChevronRightIcon, DocumentIcon, MicIcon, PencilIcon, PinIcon } from '../../components/icons';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { auditsApi, type Audit, type RiskLevelCode } from '../api';
import { fmtDate } from '../format';
import { AuditThumb } from '../media';
import { AreaStatusPill, AuditStatusPill, BottomBar, GreenButton, MessageBox, RiskBadge, RiskText, auditStyles as a } from '../ui';
import { ag } from '../theme';
import { ReportCard } from '../report';
import type { AuditsStackParamList } from '../AuditsNavigator';

type Nav = NativeStackNavigationProp<AuditsStackParamList>;
type Route = RouteProp<AuditsStackParamList, 'AuditAreas'>;

const RISK_RANK: Record<RiskLevelCode, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

/** The control screen of a long audit: every area with its status, risk and first photo. */
export function AuditAreasScreen() {
  const navigation = useNavigation<Nav>();
  const { auditId, savedArea } = useRoute<Route>().params;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setAudit(await auditsApi.get(auditId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the audit');
    } finally {
      setRefreshing(false);
    }
  }, [auditId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const editable = audit?.status === 'IN_PROGRESS' || audit?.status === 'AMENDING';

  // Sign-off is part of Review & Submit, so the header has no separate link.
  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Audit Areas' });
  }, [navigation]);

  // "✓ <area> saved" for a few seconds after coming back from saving an area.
  const [savedNote, setSavedNote] = useState<string | null>(null);
  useEffect(() => {
    if (!savedArea) return undefined;
    setSavedNote(savedArea);
    navigation.setParams({ savedArea: undefined });
    const t = setTimeout(() => setSavedNote(null), 3500);
    return () => clearTimeout(t);
  }, [savedArea, navigation]);

  if (!audit) {
    return (
      <View style={[styles.screen, styles.pad]}>
        {error ? <MessageBox tone="error" title={error} /> : <Text style={a.muted}>Loading audit…</Text>}
      </View>
    );
  }

  const c = audit.counts;
  const pct = c.areas ? Math.round((c.areasCompleted / c.areas) * 100) : 0;
  // The first area that is not finished yet gets a "Start" / "Continue" highlight.
  const nextId = audit.areas.find(x => x.status !== 'COMPLETED')?.id;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ag.green} />}
      >
        {/* Audit card: customer, place, date and number; progress once there are areas */}
        <View style={styles.headCard}>
          <View style={styles.head}>
            <Text style={[styles.company, styles.flex]} numberOfLines={2}>{audit.company.name}</Text>
            <View style={styles.right}>
              <AuditStatusPill status={audit.status} />
              <RiskBadge level={audit.overallRisk} />
            </View>
          </View>
          <View style={styles.metaRow}>
            <PinIcon size={14} color={colors.textMuted} />
            <Text style={[a.muted, styles.flex]} numberOfLines={2}>
              {[audit.site.name, audit.site.address].filter(Boolean).join(', ')}
            </Text>
          </View>
          <View style={styles.chipsRow}>
            <View style={styles.metaChip}>
              <CalendarIcon size={13} color={ag.greenDark} />
              <Text style={styles.metaChipText}>{fmtDate(audit.auditDate)}</Text>
            </View>
            <View style={styles.metaChip}>
              <DocumentIcon size={13} color={ag.greenDark} />
              <Text style={styles.metaChipText}>{audit.auditNumber}</Text>
            </View>
            {editable ? (
              <Pressable
                onPress={() => navigation.navigate('StartAudit', { auditId })}
                style={({ pressed }) => [styles.editChip, pressed && styles.pressed]}
                accessibilityLabel="Edit audit details"
              >
                <PencilIcon size={13} color={colors.textPrimary} />
                <Text style={styles.editChipText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          {c.areas ? (
            <>
              <View style={styles.progressRow}>
                <Text style={a.muted}>Areas completed</Text>
                <Text style={styles.pct}>{c.areasCompleted} / {c.areas}</Text>
              </View>
              <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
            </>
          ) : null}
        </View>

        {error ? <MessageBox tone="error" title={error} /> : null}
        {savedNote ? <MessageBox tone="ok" title={`✓ ${savedNote} saved`} /> : null}
        {audit.status === 'SUBMITTED' ? <ReportCard auditId={auditId} auditNumber={audit.auditNumber} customer={audit.company.name} auditDate={audit.auditDate} /> : null}
        {!editable ? <MessageBox tone="ok" title="This audit is submitted. It can be viewed but not changed." /> : null}
        {!audit.areas.length && editable ? (
          // No areas yet: one card to add the first area.
          <View>
            <Text style={styles.chooseTitle}>How do you want to add areas?</Text>
            <ChoiceCard
              icon={<CameraIcon size={24} color={ag.green} />}
              title="Add area"
              text="One place at a time."
              steps={['Photos', 'Recording', 'Check & save']}
              onPress={() => navigation.navigate('AreaInspect', { auditId })}
            />
          </View>
        ) : null}

        {audit.areas.map(area => {
          const isNext = editable && area.id === nextId;
          const done = area.status === 'COMPLETED';
          const worst = area.findings.reduce<RiskLevelCode | null>(
            (w, f) => (!w || RISK_RANK[f.riskLevel] > RISK_RANK[w] ? f.riskLevel : w),
            null,
          );
          const photo = area.findings.flatMap(f => f.photos)[0];
          return (
            <Pressable
              key={area.id}
              style={({ pressed }) => [styles.row, isNext && styles.rowNext, pressed && styles.rowPressed]}
              // Editable: open the form. Submitted: open the read-only view (details, photos, actions).
              onPress={() => (editable
                ? navigation.navigate('AreaInspect', { auditId, areaId: area.id })
                : navigation.navigate('AreaView', { auditId, areaId: area.id }))}
            >
              <View style={[styles.num, done && styles.numDone, isNext && styles.numNext]}>
                <Text style={[styles.numText, done && styles.numTextDone, isNext && styles.numTextNext]}>
                  {done ? '✓' : String(area.areaNumber).padStart(2, '0')}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.areaName} numberOfLines={2}>{area.zoneName ? `${area.zoneName} — ` : ''}{area.areaName}</Text>
                <RiskText level={worst} />
                <View style={styles.pillGap}><AreaStatusPill status={area.status} /></View>
              </View>
              {isNext ? (
                <View style={styles.startPill}>
                  <Text style={styles.startText}>{area.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}</Text>
                </View>
              ) : (
                <>
                  {photo ? <AuditThumb url={photo.url} size={56} /> : <View style={styles.noPhoto} />}
                  <ChevronRightIcon size={18} color={colors.textMuted} />
                </>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* With areas: add more (two small choices), then one main button to finish. Without areas the
          two choice cards above are the actions, so no bottom buttons. */}
      {editable && audit.areas.length ? (
        <BottomBar>
          <Text style={styles.moreLabel}>Add more areas</Text>
          <View style={styles.footer}>
            <Pressable onPress={() => navigation.navigate('Walkthrough', { auditId })} style={({ pressed }) => [styles.addMore, pressed && styles.addMorePressed]}>
              <MicIcon size={18} color={ag.green} />
              <Text style={styles.addMoreText}>Record many</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('AreaInspect', { auditId })} style={({ pressed }) => [styles.addMore, pressed && styles.addMorePressed]}>
              <CameraIcon size={18} color={ag.green} />
              <Text style={styles.addMoreText}>Add one</Text>
            </Pressable>
          </View>
          <GreenButton label="Review & submit →" onPress={() => navigation.navigate('ReviewSubmit', { auditId })} />
        </BottomBar>
      ) : null}
    </View>
  );
}

/** One way to add areas: icon, title, one line, and its short steps. */
function ChoiceCard({ icon, tag, title, text, steps, onPress, primary }: {
  icon: React.ReactNode; tag?: string; title: string; text: string; steps: string[]; onPress: () => void; primary?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, primary && styles.choicePrimary, pressed && styles.choicePressed]}>
      <View style={styles.choiceTop}>
        <View style={[styles.choiceIcon, primary && styles.choiceIconPrimary]}>{icon}</View>
        <View style={styles.flex}>
          <View style={styles.choiceTitleRow}>
            <Text style={styles.choiceTitle}>{title}</Text>
            {tag ? <View style={styles.choiceTag}><Text style={styles.choiceTagText}>{tag}</Text></View> : null}
          </View>
          <Text style={styles.choiceText}>{text}</Text>
        </View>
        <ChevronRightIcon size={20} color={colors.textMuted} />
      </View>
      <Text style={styles.choiceSteps}>{steps.join('  →  ')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chooseTitle: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.xs },
  choice: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, ...shadows.card },
  choicePrimary: { borderColor: ag.green, borderWidth: 1.5, backgroundColor: ag.greenSofter },
  choicePressed: { opacity: 0.85 },
  choiceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choiceIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: ag.greenSoft, alignItems: 'center', justifyContent: 'center' },
  choiceIconPrimary: { backgroundColor: ag.green },
  choiceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  choiceTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  choiceTag: { backgroundColor: ag.green, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  choiceTagText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  choiceText: { color: colors.textSecondary, marginTop: 2, lineHeight: 20 },
  choiceSteps: { marginTop: spacing.sm, color: ag.greenDark, fontWeight: '600', fontSize: 13 },
  moreLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  addMore: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: ag.green, borderRadius: radii.pill, paddingVertical: 10, marginBottom: spacing.sm,
  },
  addMorePressed: { backgroundColor: ag.greenSofter },
  addMoreText: { color: ag.green, fontWeight: '700', fontSize: 15 },
  screen: { flex: 1, backgroundColor: colors.background },
  pad: { padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  headCard: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md, ...shadows.card,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pressed: { opacity: 0.6 },
  editChipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ag.greenSofter,
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5,
  },
  metaChipText: { ...typography.caption, color: ag.greenDark, fontWeight: '600' },
  company: { ...typography.subtitle, color: colors.textPrimary },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end', gap: spacing.xxs },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  pct: { ...typography.captionMedium, color: ag.greenDark, fontWeight: '700' },
  track: { height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: ag.green, borderRadius: radii.pill },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.xs,
  },
  rowNext: { borderColor: ag.green, borderWidth: 1.5, backgroundColor: ag.greenSofter },
  rowPressed: { backgroundColor: ag.greenSofter },
  num: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  numDone: { backgroundColor: ag.green, borderColor: ag.green },
  numNext: { borderColor: ag.green, backgroundColor: colors.surface },
  numText: { fontWeight: '700', color: colors.textPrimary },
  numTextDone: { color: '#fff' },
  numTextNext: { color: ag.greenDark },
  areaName: { ...typography.bodyMedium, color: colors.textPrimary },
  pillGap: { marginTop: 4 },
  noPhoto: { width: 56, height: 56, borderRadius: radii.sm, backgroundColor: colors.surfaceAlt },
  startPill: { backgroundColor: ag.green, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  startText: { color: '#fff', fontWeight: '700' },
  footer: { flexDirection: 'row', gap: spacing.sm },
});

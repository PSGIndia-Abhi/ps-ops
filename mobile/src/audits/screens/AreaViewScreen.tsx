import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { API_BASE_URL } from '../../config/env';
import { colors, radii, spacing, typography } from '../../theme';
import { auditsApi, type Area, type Audit } from '../api';
import { fmtDate, titleCase } from '../format';
import { useAuthHeader } from '../media';
import { AreaStatusPill, MessageBox, RiskBadge, auditStyles as a } from '../ui';
import { ag } from '../theme';
import type { AuditsStackParamList } from '../AuditsNavigator';

type Nav = NativeStackNavigationProp<AuditsStackParamList>;
type Route = RouteProp<AuditsStackParamList, 'AreaView'>;

const CATEGORY_LABEL: Record<string, string> = {
  HARBOURAGE: 'Rodent harbourage',
  BURROWS: 'Burrows',
  ENTRY_POINT: 'Entry point',
  FOOD_SOURCE: 'Food source',
  WATER: 'Water stagnation',
};

/** Read-only view of one area (submitted audits): details, photos, observation and actions of each finding. */
export function AreaViewScreen() {
  const navigation = useNavigation<Nav>();
  const { auditId, areaId } = useRoute<Route>().params;
  const auth = useAuthHeader();
  const { width } = useWindowDimensions();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null); // photo shown full screen

  useEffect(() => {
    auditsApi.get(auditId).then(setAudit).catch(e => setError(e instanceof Error ? e.message : 'Could not load the area'));
  }, [auditId]);

  const area: Area | undefined = audit?.areas.find(x => x.id === areaId);

  useLayoutEffect(() => {
    if (area) navigation.setOptions({ title: `Area ${String(area.areaNumber).padStart(2, '0')}` });
  }, [navigation, area]);

  if (error) return <View style={styles.screen}><View style={styles.content}><MessageBox tone="error" title={error} /></View></View>;
  if (!area || !audit) return <View style={[styles.screen, styles.center]}><ActivityIndicator color={ag.green} /></View>;

  const customerLabel = audit.customerActionLabel || 'Customer action';
  const photoW = width - spacing.lg * 2 - spacing.md * 2;
  const src = (url: string, v: string | null | undefined, size?: string) => ({
    uri: `${API_BASE_URL}${url}?${size ? `size=${size}&` : ''}v=${v || 0}`,
    headers: auth ? { Authorization: auth } : undefined,
  });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[a.card, styles.block]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.areaName, styles.flex]}>{area.areaName}</Text>
            <AreaStatusPill status={area.status} />
          </View>
          {area.zoneName ? <Text style={a.muted}>Zone: {area.zoneName}</Text> : null}
          {area.notes ? <Text style={[a.sub, styles.gapSm]}>{area.notes}</Text> : null}
          <Text style={[a.muted, styles.gapSm]}>{area.findings.length} finding{area.findings.length === 1 ? '' : 's'}</Text>
        </View>

        {area.findings.map(f => (
          <View key={f.id} style={[a.card, styles.block]}>
            <View style={styles.rowBetween}>
              <Text style={styles.num}>{String(f.findingNumber).padStart(2, '0')}</Text>
              <Text style={[styles.title, styles.flex]} numberOfLines={2}>{f.title || 'Finding'}</Text>
              <RiskBadge level={f.riskLevel} />
            </View>
            <Text style={[a.muted, styles.gapSm]}>
              {CATEGORY_LABEL[f.riskCategory] || titleCase(f.riskCategory)}
              {f.actionDueDate ? ` · fix by ${fmtDate(f.actionDueDate)}` : ' · monitor every visit'}
            </Text>

            {f.photos.length ? (
              <View style={styles.photos}>
                {f.photos.map(p => (
                  <Pressable key={p.id} onPress={() => setFull(src(p.url, p.v).uri)} style={styles.photoWrap}>
                    {auth ? (
                      <Image source={src(p.url, p.v, 'view')} style={{ width: photoW, height: photoW * 0.75 }} resizeMode="cover" />
                    ) : <View style={{ width: photoW, height: photoW * 0.75 }} />}
                    {p.marked ? <View style={styles.marked}><Text style={styles.markedText}>Marked</Text></View> : null}
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[a.muted, styles.gapSm]}>{f.noPhotoReason ? `No photo: ${f.noPhotoReason}` : 'No photos'}</Text>
            )}

            <Section label="Observation" text={f.observationText} />
            <Section label={customerLabel} text={f.customerActionText} />
            <Section label="BestServe action" text={f.bestserveActionText} />
          </View>
        ))}
        <Text style={[a.muted, styles.center]}>Tap a photo to see it full screen</Text>
      </ScrollView>

      {/* Full-screen photo */}
      <Modal visible={!!full} transparent animationType="fade" onRequestClose={() => setFull(null)}>
        <Pressable style={styles.fullBg} onPress={() => setFull(null)}>
          {full && auth ? <Image source={{ uri: full, headers: { Authorization: auth } }} style={styles.fullImg} resizeMode="contain" /> : null}
          <Text style={styles.fullHint}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

function Section({ label, text }: { label: string; text: string | null }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      <Text style={text ? styles.sectionText : a.muted}>{text || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  center: { alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  block: { marginBottom: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  gapSm: { marginTop: spacing.xs },
  areaName: { ...typography.title, color: colors.textPrimary, fontSize: 20 },
  num: { fontSize: 20, fontWeight: '800', color: ag.greenDark },
  title: { ...typography.subtitle, color: colors.textPrimary },
  photos: { marginTop: spacing.md, gap: spacing.sm },
  photoWrap: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  marked: { position: 'absolute', right: 8, top: 8, backgroundColor: ag.red, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  markedText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  section: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: ag.greenDark, letterSpacing: 0.6, marginBottom: 4 },
  sectionText: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  fullBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  fullImg: { width: '100%', height: '85%' },
  fullHint: { color: '#CBD5E1', marginTop: spacing.sm },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useCrmTheme } from '../../crm/theme';
import { CrmSkeleton } from '../../crm/ui/CrmScreen';
import type { UpcomingVisit } from '../api';
import { formatDate, formatMoney, serviceLabel } from '../format';
import { AuditArt, ComplaintArt, InvoiceArt, VisitsArt } from './IllustratedIcons';

/**
 * Home's Overview: three pastel stat cards (Complaints, Audit, Documents) and an Upcoming visit
 * banner. Every number comes from the dashboard / documents APIs - no made-up trends.
 */

type Tone = 'good' | 'warn' | 'bad' | 'muted';

interface Props {
  openComplaints: number;
  auditRisk: string | null;
  pendingInvoices: number;
  overdueInvoices: number;
  pendingAmount: number;
  nextVisit: UpcomingVisit | undefined;
  onViewAll: () => void;
  onComplaints: () => void;
  onAudits: () => void;
  onInvoices: () => void;
  onOpenJob: (jobId: string) => void;
  onBook: () => void;
}

const TONE: Record<Tone, string> = { good: '#188038', warn: '#C26401', bad: '#C5221F', muted: '#5F6368' };

function Mark({ tone }: { tone: Tone }) {
  const color = TONE[tone];
  const s = { fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      {tone === 'good' && <Path d="M5 12.5l4.2 4.2L19 7" {...s} />}
      {(tone === 'warn' || tone === 'bad') && <Path d="M12 19V5M6 11l6-6 6 6" {...s} />}
      {tone === 'muted' && <Path d="M5 12h14" {...s} />}
    </Svg>
  );
}

function ChartBars() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x="3" y="12" width="4.5" height="9" rx="1.6" fill="#16224A" />
      <Rect x="9.75" y="6" width="4.5" height="15" rx="1.6" fill="#16224A" />
      <Rect x="16.5" y="9" width="4.5" height="12" rx="1.6" fill="#8AA0D6" />
    </Svg>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function StatCard({
  Art,
  value,
  label,
  line,
  tone,
  bg,
  border,
  onPress,
}: {
  Art: React.ComponentType<{ size?: number }>;
  value: string;
  label: string;
  line: string;
  tone: Tone;
  bg: string;
  border: string;
  onPress: () => void;
}) {
  const t = useCrmTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: t.isDark ? t.surfaceAlt : bg, borderColor: t.isDark ? t.border : border }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${line}`}
    >
      <View style={[styles.cardIcon, { backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}>
        <Art size={34} />
      </View>
      <Text style={[styles.value, { color: t.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.label, { color: t.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.lineRow}>
        <Mark tone={tone} />
        <Text style={[styles.line, { color: t.isDark ? t.textSecondary : TONE[tone] }]} numberOfLines={1}>
          {line}
        </Text>
      </View>
    </Pressable>
  );
}

export function HomeOverview(p: Props) {
  const t = useCrmTheme();
  const risk = (p.auditRisk || '').toLowerCase();
  const auditTone: Tone = !p.auditRisk ? 'muted' : risk === 'low' ? 'good' : risk === 'medium' ? 'warn' : 'bad';
  const invoiceLine =
    p.overdueInvoices > 0 ? `${p.overdueInvoices} overdue` : p.pendingInvoices > 0 ? `${formatMoney(p.pendingAmount)} due` : 'All paid';
  const invoiceTone: Tone = p.overdueInvoices > 0 ? 'bad' : p.pendingInvoices > 0 ? 'warn' : 'good';
  const v = p.nextVisit;

  return (
    <View>
      <View style={styles.head}>
        <ChartBars />
        <Text style={[styles.title, { color: t.textPrimary }]}>Overview</Text>
        <Pressable onPress={p.onViewAll} style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.viewAllText, { color: t.isDark ? '#A8C7FA' : '#0B57D0' }]}>View all</Text>
          <Chevron color={t.isDark ? '#A8C7FA' : '#0B57D0'} />
        </Pressable>
      </View>

      <View style={styles.cards}>
        <StatCard
          Art={ComplaintArt}
          value={String(p.openComplaints)}
          label="Complaints"
          line={p.openComplaints > 0 ? 'Open now' : 'All clear'}
          tone={p.openComplaints > 0 ? 'warn' : 'good'}
          bg="#FFF5E8"
          border="#FBE3C2"
          onPress={p.onComplaints}
        />
        <StatCard
          Art={AuditArt}
          value={p.auditRisk || '—'}
          label="Audit risk"
          line={p.auditRisk ? 'Last audit' : 'No audits yet'}
          tone={auditTone}
          bg="#F3EEFF"
          border="#E1D7FB"
          onPress={p.onAudits}
        />
        <StatCard
          Art={InvoiceArt}
          value={String(p.pendingInvoices)}
          label={p.pendingInvoices === 1 ? 'Invoice due' : 'Invoices due'}
          line={invoiceLine}
          tone={invoiceTone}
          bg="#ECF3FF"
          border="#D3E2FB"
          onPress={p.onInvoices}
        />
      </View>

      {/* Upcoming visit */}
      <Pressable
        onPress={() => (v ? p.onOpenJob(v.job_id) : p.onBook())}
        style={({ pressed }) => [
          styles.visit,
          { backgroundColor: t.isDark ? '#1C2446' : '#EEF1FF', borderColor: t.isDark ? t.border : '#DDE2FB' },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        <View style={[styles.visitBlob, { backgroundColor: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.55)' }]} pointerEvents="none" />
        <View style={[styles.visitIcon, { backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}>
          <VisitsArt size={38} />
        </View>
        <View style={styles.visitText}>
          <Text style={[styles.visitLabel, { color: t.textSecondary }]}>{v ? 'Upcoming visit' : 'Next visit'}</Text>
          <Text style={[styles.visitDate, { color: t.textPrimary }]} numberOfLines={1}>
            {v ? formatDate(v.scheduled_date, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No visit yet'}
          </Text>
          <Text style={[styles.visitSub, { color: t.textSecondary }]} numberOfLines={1}>
            {v ? [serviceLabel(v.service_type), v.site_name].filter(Boolean).join(' · ') : 'Book a service to plan one'}
          </Text>
        </View>
        <View style={styles.visitBtn}>
          <Text style={styles.visitBtnText}>{v ? 'Details' : 'Book now'}</Text>
          <Chevron color="#FFFFFF" />
        </View>
      </Pressable>
    </View>
  );
}

/** Loading placeholder in the Overview's shape. */
export function HomeOverviewSkeleton() {
  return (
    <View>
      <CrmSkeleton height={24} width={140} radius={8} />
      <View style={[styles.cards, { marginTop: 16 }]}>
        {[0, 1, 2].map((i) => (
          <CrmSkeleton key={i} height={156} radius={20} style={styles.flex1} />
        ))}
      </View>
      <CrmSkeleton height={96} radius={22} style={{ marginTop: 14 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { flex: 1, fontSize: 22, fontWeight: '800' },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 15, fontWeight: '600' },
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1 },
  cardIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 24, fontWeight: '800', marginTop: 10 },
  label: { fontSize: 13.5, marginTop: 2 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  line: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  visit: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingVertical: 16, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  visitBlob: { position: 'absolute', right: -40, top: -50, width: 150, height: 150, borderRadius: 75 },
  visitIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', shadowColor: '#3A4BA0', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  visitText: { flex: 1 },
  visitLabel: { fontSize: 13 },
  visitDate: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  visitSub: { fontSize: 12.5, marginTop: 2 },
  visitBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 14, paddingRight: 10, height: 40, borderRadius: 20, backgroundColor: '#1E3A8A' },
  visitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});

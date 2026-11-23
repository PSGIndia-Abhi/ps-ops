import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { ChevronRightIcon } from '../../components/icons';
import { useCrmTheme } from '../../crm/theme';
import { radii, shadows, spacing, typography } from '../../theme';
import type { UpcomingVisit } from '../api';
import { formatDate, relativeDay, serviceLabel } from '../format';
import {
  AuditGlyph,
  BRAND_NAVY,
  BRAND_RED,
  ComplaintGlyph,
  DocumentsGlyph,
  GlyphTile,
  VisitsGlyph,
} from './ClientIcons';

/**
 * Home's overview as a bento grid - cards of different sizes instead of a plain list:
 *   [ tall Next visit ][ Complaints ]
 *   [                 ][ Invoices   ]
 *   [        wide card (Service health), passed in as children        ]
 *   [ Documents ][ Last audit ]
 */

type GlyphType = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
}>;

const SMALL_H = 112;
const GAP = 12;

interface SmallProps {
  Icon: GlyphType;
  label: string;
  value: string;
  sub?: string;
  /** Draws the value in the warning colour (something needs the client's attention). */
  alert?: boolean;
  onPress: () => void;
}

function SmallCard({ Icon, label, value, sub, alert, onPress }: SmallProps) {
  const t = useCrmTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.small,
        {
          backgroundColor: t.surface,
          borderColor: t.isDark ? t.border : '#ECEEF3',
        },
        !t.isDark && shadows.card,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.smallTop}>
        <GlyphTile Icon={Icon} size={36} iconSize={20} radius={12} />
        <ChevronRightIcon size={15} color={t.textMuted} />
      </View>
      <Text
        style={[
          styles.smallValue,
          { color: alert ? '#B06000' : t.textPrimary },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        style={[styles.smallLabel, { color: t.textMuted }]}
        numberOfLines={1}
      >
        {sub ? `${label} · ${sub}` : label}
      </Text>
    </Pressable>
  );
}

/** The tall brand-navy card: the next visit, or an invitation to book one. */
function NextVisitCard({
  visit,
  onOpen,
  onBook,
}: {
  visit?: UpcomingVisit;
  onOpen: (jobId: string) => void;
  onBook: () => void;
}) {
  const day = visit ? relativeDay(visit.scheduled_date) : '';
  // Background drawn at the measured size ("100%" SVGs do not stretch reliably on Android).
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <Pressable
      onLayout={e =>
        setSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      onPress={() => (visit ? onOpen(visit.job_id) : onBook())}
      style={({ pressed }) => [styles.tall, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        visit
          ? `Next visit ${day}: ${serviceLabel(visit.service_type)}`
          : 'Book a service'
      }
    >
      {!!size && (
        <Svg
          style={styles.bg}
          width={size.w}
          height={size.h}
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <Defs>
            <LinearGradient id="nextBg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#24326A" stopOpacity="1" />
              <Stop offset="1" stopColor={BRAND_NAVY} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#nextBg)" />
          <Circle cx="96" cy="4" r="34" fill="#FFFFFF" opacity={0.06} />
          <Circle cx="8" cy="104" r="22" fill={BRAND_RED} opacity={0.22} />
        </Svg>
      )}
      <View style={styles.tallTop}>
        <Text style={styles.tallLabel}>NEXT VISIT</Text>
        {visit ? (
          <View style={[styles.dayBadge, day === 'Today' && styles.dayToday]}>
            <Text style={styles.dayText}>{day}</Text>
          </View>
        ) : null}
      </View>
      {visit ? (
        <>
          <View style={styles.dateRow}>
            <Text style={styles.dateDay}>
              {formatDate(visit.scheduled_date, { day: '2-digit' })}
            </Text>
            <Text style={styles.dateMonth}>
              {formatDate(visit.scheduled_date, { month: 'short' })}
            </Text>
          </View>
          <Text style={styles.tallTitle} numberOfLines={3}>
            {serviceLabel(visit.service_type)}
          </Text>
          <Text style={styles.tallSub} numberOfLines={1}>
            {visit.site_name || ''}
          </Text>
        </>
      ) : (
        <>
          <View style={styles.emptyGlyph}>
            <VisitsGlyph
              size={34}
              color="#FFFFFF"
              fill="rgba(255,255,255,0.18)"
            />
          </View>
          <Text style={styles.tallTitle}>Nothing scheduled</Text>
          <Text style={styles.tallSub}>Book a service</Text>
        </>
      )}
      <View style={styles.tallFoot}>
        <Text style={styles.tallLink}>
          {visit ? 'View details' : 'Book now'}
        </Text>
        <View style={styles.tallArrow}>
          <ChevronRightIcon size={14} color={BRAND_NAVY} />
        </View>
      </View>
    </Pressable>
  );
}

interface Props {
  nextVisit?: UpcomingVisit;
  openComplaints: number;
  pendingInvoices: number;
  pendingAmountText: string;
  /** Shared documents expiring within 30 days; null while unknown. */
  expiring: number | null;
  /** Worst audit risk across the outlets in view ("Low", "High"...), or null when there is none. */
  auditRisk: string | null;
  onOpenJob: (jobId: string) => void;
  onBook: () => void;
  onComplaints: () => void;
  onDocuments: () => void;
  onAudits: () => void;
  /** The wide card between the two rows (Service health). */
  children?: React.ReactNode;
}

export function HomeBento({
  nextVisit,
  openComplaints,
  pendingInvoices,
  pendingAmountText,
  expiring,
  auditRisk,
  onOpenJob,
  onBook,
  onComplaints,
  onDocuments,
  onAudits,
  children,
}: Props) {
  const t = useCrmTheme();
  const riskAlert = !!auditRisk && /high|critical/i.test(auditRisk);
  return (
    <View>
      <Text style={[styles.title, { color: t.textPrimary }]}>Overview</Text>
      <View style={styles.row}>
        <NextVisitCard visit={nextVisit} onOpen={onOpenJob} onBook={onBook} />
        <View style={styles.column}>
          <SmallCard
            Icon={ComplaintGlyph}
            label="Complaints"
            value={openComplaints > 0 ? `${openComplaints} open` : 'All clear'}
            alert={openComplaints > 0}
            onPress={onComplaints}
          />
          <SmallCard
            Icon={DocumentsGlyph}
            label="Invoices"
            value={
              pendingInvoices > 0 ? `${pendingInvoices} due` : 'Nothing due'
            }
            sub={pendingInvoices > 0 ? pendingAmountText : undefined}
            alert={pendingInvoices > 0}
            onPress={onDocuments}
          />
        </View>
      </View>

      {!!children && <View style={styles.wide}>{children}</View>}

      <View style={[styles.row, styles.rowGap]}>
        <View style={styles.flex1}>
          <SmallCard
            Icon={DocumentsGlyph}
            label="Certificates"
            value={
              expiring === null
                ? '—'
                : expiring > 0
                ? `${expiring} expiring`
                : 'All valid'
            }
            sub={expiring && expiring > 0 ? 'in 30 days' : undefined}
            alert={!!expiring && expiring > 0}
            onPress={onDocuments}
          />
        </View>
        <View style={styles.flex1}>
          <SmallCard
            Icon={AuditGlyph}
            label="Last audit"
            value={auditRisk ? `${auditRisk} risk` : 'No audits yet'}
            alert={riskAlert}
            onPress={onAudits}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  pressed: { opacity: 0.75 },
  title: { ...typography.subtitle, fontSize: 19, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: GAP },
  rowGap: { marginTop: GAP },
  column: { flex: 1, gap: GAP },
  wide: { marginTop: GAP },

  small: { height: SMALL_H, borderRadius: 22, borderWidth: 1, padding: 14 },
  smallTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smallValue: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    marginTop: 12,
  },
  smallLabel: { fontSize: 12.5, marginTop: 2 },

  tall: {
    flex: 1.08,
    height: SMALL_H * 2 + GAP,
    borderRadius: 24,
    overflow: 'hidden',
    padding: 16,
    backgroundColor: BRAND_NAVY,
    ...shadows.raised,
  },
  bg: { position: 'absolute', top: 0, left: 0 },
  tallTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tallLabel: {
    ...typography.overline,
    fontSize: 10.5,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
  },
  dayBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  dayToday: { backgroundColor: BRAND_RED },
  dayText: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 12,
  },
  dateDay: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dateMonth: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  tallTitle: {
    fontSize: 15.5,
    lineHeight: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 6,
  },
  tallSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.72)', marginTop: 3 },
  emptyGlyph: { marginTop: 18, marginBottom: 4 },
  tallFoot: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tallLink: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  tallArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

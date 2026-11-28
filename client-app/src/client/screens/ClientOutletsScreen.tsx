import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { AlertTriangleIcon, BriefcaseIcon, CalendarIcon, ChevronRightIcon, CloseIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { listOutlets, type OutletListItem } from '../api';
import { RISK_STYLE, formatDate, plural, serviceLabel } from '../format';
import type { ClientStackParamList } from '../navigation';
import { OutletArt } from '../ui/IllustratedIcons';
import { ClientPage } from '../ui/page';

const BLUE = '#0B57D0';

/** Mini stat tile colours (light theme). */
const TILE = {
  blue: { fg: '#0B57D0', bg: '#EEF3FF' },
  violet: { fg: '#7B3FC4', bg: '#F4EEFD' },
  amber: { fg: '#B06000', bg: '#FEF5E7' },
  green: { fg: '#188038', bg: '#EAF6EC' },
  red: { fg: '#C5221F', bg: '#FDECEA' },
  slate: { fg: '#5F6368', bg: '#F1F3F4' },
};
type TileTone = keyof typeof TILE;
const RISK_TONE: Record<string, TileTone> = { success: 'green', warning: 'amber', danger: 'red', info: 'blue', neutral: 'slate', accent: 'violet' };

const factory = (t: CrmTheme) => {
  const ink = t.isDark ? '#E6E7EA' : '#1B1C1F';
  const sub = t.isDark ? '#A3A7AE' : '#5E6470';
  const blue = t.isDark ? '#A8C7FA' : BLUE;
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.7 },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    search: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, height: 50, paddingHorizontal: 16, borderRadius: 25, marginTop: 4, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1.5, borderColor: t.isDark ? 'rgba(168,199,250,0.35)' : '#A9C4F5' },
    searchFocused: { borderColor: blue, shadowColor: BLUE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 3 },
    searchInput: { flex: 1, fontSize: 15, color: ink, paddingVertical: 0 },
    countLine: { fontSize: 14, fontWeight: '600' as const, color: sub, marginTop: 16, marginBottom: 2, marginLeft: 4 },
    card: { marginTop: 12, padding: 16, borderRadius: 24, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1, borderColor: t.isDark ? 'rgba(255,255,255,0.10)' : '#E6EBF3', shadowColor: '#0B1230', shadowOffset: { width: 0, height: 4 }, shadowOpacity: t.isDark ? 0 : 0.05, shadowRadius: 12, elevation: 2 },
    top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
    art: { width: 56, height: 56, borderRadius: 28, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#EEF3FF' },
    name: { fontSize: 17, fontWeight: '700' as const, color: ink },
    addrRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 4 },
    addr: { flex: 1, fontSize: 13, color: sub },
    meta: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 6, marginTop: 10, marginLeft: 70 },
    metaText: { fontSize: 12.5, fontWeight: '600' as const },
    metaDot: { width: 6, height: 6, borderRadius: 3 },
    tiles: { flexDirection: 'row' as const, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.isDark ? 'rgba(255,255,255,0.10)' : '#EEF1F6' },
    tile: { flex: 1, alignItems: 'center' as const, paddingHorizontal: 6 },
    tileRule: { borderLeftWidth: 1, borderLeftColor: t.isDark ? 'rgba(255,255,255,0.10)' : '#EEF1F6' },
    tileTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5 },
    tileValue: { fontSize: 16, fontWeight: '800' as const, color: ink, marginTop: 4, textAlign: 'center' as const },
    tileLabel: { fontSize: 12, color: sub, flexShrink: 1 },
    empty: { alignItems: 'center' as const, paddingTop: 40 },
    emptyText: { fontSize: 15, color: sub, marginTop: 12 },
  };
};

function SearchGlass({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="6.5" fill="none" stroke={color} strokeWidth={2} />
      <Path d="M16 16l4.5 4.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** One stat in the card's bottom row: coloured icon + label, value below (no coloured box). */
function StatTile({ value, label, tone, Icon, first, strong }: { value: string; label: string; tone: TileTone; Icon: React.ComponentType<{ size?: number; color?: string }>; first?: boolean; strong?: boolean }) {
  const { styles } = useCrmStyles(factory);
  const c = TILE[tone];
  return (
    <View style={[styles.tile, !first && styles.tileRule]} accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.tileTop}>
        <Icon size={13} color={c.fg} />
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.tileValue, strong ? { color: c.fg } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** Every outlet this login can see (web: PortalOutlets). */
export function ClientOutletsScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const [outlets, setOutlets] = useState<OutletListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const blue = theme.isDark ? '#A8C7FA' : BLUE;

  const load = useCallback(async () => {
    try {
      setOutlets(await listOutlets());
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Could not load your outlets');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!outlets || !q) return outlets;
    return outlets.filter((o) => [o.name, o.address, o.city, o.id].some((v) => v && String(v).toLowerCase().includes(q)));
  }, [outlets, query]);

  return (
    <ClientPage title="Outlets" back>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={brandRefreshControl(refreshing, () => {
          setRefreshing(true);
          load();
        })}
      >
        <RefreshBanner refreshing={refreshing} />
        {!!outlets && outlets.length > 1 && (
          <View style={[styles.search, focused && styles.searchFocused]}>
            <SearchGlass color={focused ? blue : theme.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search outlet, area or city"
              placeholderTextColor={theme.textMuted}
              style={styles.searchInput}
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <CloseIcon size={16} color={theme.textMuted} />
              </Pressable>
            )}
          </View>
        )}
        <CrmErrorBanner message={error} onRetry={load} />
        {shown === null ? (
          Array.from({ length: 3 }).map((_, i) => <CrmSkeleton key={i} height={170} radius={24} style={{ marginTop: 12 }} />)
        ) : (
          <>
            <Text style={styles.countLine}>{query ? `${plural(shown.length, 'outlet')} found` : plural(shown.length, 'outlet')}</Text>
            {shown.length === 0 && (
              <View style={styles.empty}>
                <OutletArt size={64} />
                <Text style={styles.emptyText}>No outlet matches "{query}"</Text>
              </View>
            )}
            {shown.map((o) => {
              const risk = RISK_STYLE[String(o.audit_risk || '').toUpperCase()];
              const riskTone = risk ? TILE[RISK_TONE[risk.tone] || 'slate'] : null;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => navigation.navigate('ClientOutletDetail', { siteId: o.id })}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${o.name || o.id}`}
                >
                  <View style={styles.top}>
                    <View style={styles.art}>
                      <OutletArt size={38} />
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.name} numberOfLines={1}>
                        {o.name || o.id}
                      </Text>
                      <View style={styles.addrRow}>
                        <PinIcon size={13} color={theme.textMuted} />
                        <Text style={styles.addr} numberOfLines={1}>
                          {o.address || o.city || 'No address on file'}
                        </Text>
                      </View>
                    </View>
                    <ChevronRightIcon size={18} color={theme.textMuted} />
                  </View>
                  {(o.services.length > 0 || (risk && riskTone)) && (
                    <View style={styles.meta}>
                      {o.services.length > 0 && <Text style={[styles.metaText, { color: blue }]}>{o.services.map((sv) => serviceLabel(sv)).join(' · ')}</Text>}
                      {risk && riskTone && (
                        <>
                          {o.services.length > 0 && <Text style={[styles.metaText, { color: theme.textMuted }]}>·</Text>}
                          <View style={[styles.metaDot, { backgroundColor: riskTone.fg }]} />
                          <Text style={[styles.metaText, { color: riskTone.fg }]}>{risk.label} risk</Text>
                        </>
                      )}
                    </View>
                  )}
                  <View style={styles.tiles}>
                    <StatTile first Icon={BriefcaseIcon} value={String(o.active_jobs)} label="Active jobs" tone="blue" />
                    <StatTile Icon={CalendarIcon} value={o.next_visit ? formatDate(o.next_visit, { day: 'numeric', month: 'short' }) : 'Not booked'} label="Next visit" tone="violet" />
                    <StatTile
                      Icon={AlertTriangleIcon}
                      value={o.open_complaints > 0 ? String(o.open_complaints) : 'All clear'}
                      label="Open issues"
                      tone={o.open_complaints > 0 ? 'amber' : 'green'}
                      strong={o.open_complaints > 0}
                    />
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </ClientPage>
  );
}

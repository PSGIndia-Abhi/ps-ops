import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { BuildingIcon, CheckCircleIcon, CloseIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { Sheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import type { ClientOutlet } from '../api';
import { FilterPill } from './home';

const factory = (t: CrmTheme) => ({
  searchBox: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: t.surfaceAlt, borderRadius: 22, paddingHorizontal: spacing.md, minHeight: 44, marginBottom: spacing.sm },
  search: { flex: 1, ...typography.body, color: t.textPrimary, paddingVertical: 0 },
  region: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingTop: spacing.md, paddingBottom: 4 },
  regionText: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.6, color: t.textMuted },
  regionCount: { fontSize: 11.5, fontWeight: '700' as const, color: t.primary, backgroundColor: t.primarySoftBg, paddingHorizontal: 7, paddingVertical: 1, borderRadius: radii.pill, overflow: 'hidden' as const },
  noMatch: { ...typography.body, color: t.textMuted, textAlign: 'center' as const, paddingVertical: spacing.lg },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowText: { flex: 1 },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted },
  pressed: { opacity: 0.7 },
  list: { maxHeight: 440 },
});

type Row =
  | { kind: 'all'; key: string }
  | { kind: 'region'; key: string; region: string; count: number }
  | { kind: 'outlet'; key: string; outlet: ClientOutlet };

/** Popup listing "All outlets" and each outlet grouped by city, with a search box (name, area, city). */
export function OutletSheet({
  visible,
  onClose,
  outlets,
  value,
  onChange,
  allowAll = true,
}: {
  visible: boolean;
  onClose: () => void;
  outlets: ClientOutlet[];
  value: string;
  onChange: (id: string) => void;
  /** Offer "All outlets" (filters); off when one outlet must be picked (a complaint, a request). */
  allowAll?: boolean;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [query, setQuery] = useState('');
  // Matching outlets grouped by region (city); "All outlets" first when offered.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = outlets.filter((o) => !q || [o.name, o.address, o.city, o.state, o.id].some((v) => v && String(v).toLowerCase().includes(q)));
    const byRegion = new Map<string, ClientOutlet[]>();
    for (const o of list) {
      const r = String(o.city || o.state || '').trim() || 'Other';
      if (!byRegion.has(r)) byRegion.set(r, []);
      byRegion.get(r)!.push(o);
    }
    const out: Row[] = allowAll ? [{ kind: 'all', key: 'all' }] : [];
    [...byRegion.entries()]
      .sort(([a], [b]) => Number(a === 'Other') - Number(b === 'Other') || a.localeCompare(b))
      .forEach(([region, items]) => {
        if (byRegion.size > 1 || outlets.length > 6) out.push({ kind: 'region', key: `r:${region}`, region, count: items.length });
        items
          .sort((x, y) => String(x.name || '').localeCompare(String(y.name || '')))
          .forEach((o) => out.push({ kind: 'outlet', key: o.id, outlet: o }));
      });
    return { out, matches: list.length };
  }, [outlets, query, allowAll]);
  const pick = (id: string) => {
    onChange(id);
    onClose();
    setQuery('');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={allowAll ? 'Choose outlet' : 'Which outlet?'}>
      <View style={styles.searchBox}>
        <PinIcon size={16} color={theme.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search outlet, area or city" placeholderTextColor={theme.textMuted} style={styles.search} accessibilityLabel="Search outlets" />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <CloseIcon size={16} color={theme.textMuted} />
          </Pressable>
        )}
      </View>
      <FlatList
        style={styles.list}
        data={rows.out}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={rows.matches === 0 && !!query ? <Text style={styles.noMatch}>No outlet matches "{query}"</Text> : undefined}
        renderItem={({ item }) => {
          if (item.kind === 'region') {
            return (
              <View style={styles.region}>
                <Text style={styles.regionText}>{item.region.toUpperCase()}</Text>
                <Text style={styles.regionCount}>{item.count}</Text>
              </View>
            );
          }
          const all = item.kind === 'all';
          const o = item.kind === 'outlet' ? item.outlet : null;
          const id = o ? o.id : '';
          const sub = all ? `${outlets.length} outlets` : o?.address || o?.city || '';
          return (
            <Pressable onPress={() => pick(id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: id === value }}>
              <View style={styles.rowIcon}>{all ? <BuildingIcon size={18} color={theme.primary} /> : <PinIcon size={18} color={theme.primary} />}</View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {all ? 'All outlets' : o?.name || o?.id}
                </Text>
                {!!sub && (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {sub}
                  </Text>
                )}
              </View>
              {id === value && <CheckCircleIcon size={20} color={theme.primary} />}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

/**
 * Outlet filter pill + its sheet. "" = all outlets. Hidden when the login has
 * one outlet (an outlet user) - there is nothing to choose.
 */
export function OutletPicker({ outlets, value, onChange, style }: { outlets: ClientOutlet[]; value: string; onChange: (id: string) => void; style?: object }) {
  const { theme } = useCrmStyles(factory);
  const [open, setOpen] = useState(false);
  if (outlets.length <= 1) return null;
  const selected = outlets.find((o) => o.id === value);
  const label = selected ? selected.name || selected.id : 'All outlets';
  return (
    <>
      <FilterPill icon={<PinIcon size={15} color={theme.primary} />} label={label} onPress={() => setOpen(true)} style={style} />
      <OutletSheet visible={open} onClose={() => setOpen(false)} outlets={outlets} value={value} onChange={onChange} />
    </>
  );
}

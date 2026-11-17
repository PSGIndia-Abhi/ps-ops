import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { BuildingIcon, CheckCircleIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { Sheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import type { ClientOutlet } from '../api';
import { FilterPill } from './home';

const factory = (t: CrmTheme) => ({
  search: {
    ...typography.body,
    color: t.textPrimary,
    backgroundColor: t.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowText: { flex: 1 },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted },
  pressed: { opacity: 0.7 },
  list: { maxHeight: 440 },
});

/** Bottom sheet listing "All outlets" and each outlet, with search when there are many. */
export function OutletSheet({
  visible,
  onClose,
  outlets,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  outlets: ClientOutlet[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [query, setQuery] = useState('');
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = outlets.filter((o) => !q || [o.name, o.city, o.id].some((v) => v && String(v).toLowerCase().includes(q)));
    return [{ id: '', name: 'All outlets', city: `${outlets.length} outlets`, all: true }, ...list.map((o) => ({ ...o, all: false }))];
  }, [outlets, query]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Choose outlet">
      {outlets.length > 6 && (
        <TextInput value={query} onChangeText={setQuery} placeholder="Search outlets" placeholderTextColor={theme.textMuted} style={styles.search} />
      )}
      <FlatList
        style={styles.list}
        data={options}
        keyExtractor={(o) => o.id || 'all'}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              onChange(item.id);
              onClose();
              setQuery('');
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: item.id === value }}
          >
            <View style={styles.rowIcon}>{item.all ? <BuildingIcon size={18} color={theme.primary} /> : <PinIcon size={18} color={theme.primary} />}</View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name || item.id}
              </Text>
              {!!item.city && <Text style={styles.rowSub}>{item.city}</Text>}
            </View>
            {item.id === value && <CheckCircleIcon size={20} color={theme.primary} />}
          </Pressable>
        )}
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

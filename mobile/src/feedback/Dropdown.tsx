import React, { useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { CheckIcon, ChevronDownIcon } from '../crm/ui/crmIcons';
import { radii, spacing, typography } from '../theme';

const factory = (t: CrmTheme) => ({
  btn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'flex-start' as const, paddingLeft: 12, paddingRight: 10, height: 40, borderRadius: radii.pill, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, ...t.cardShadow },
  btnOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  label: { ...typography.captionMedium, fontSize: 14, color: t.textPrimary },
  caption: { ...typography.caption, color: t.textMuted },
  menu: { position: 'absolute' as const, backgroundColor: t.surface, borderRadius: radii.lg, paddingVertical: 6, borderWidth: 1, borderColor: t.border, ...t.cardShadow, elevation: 12 },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 11 },
  itemOn: { backgroundColor: t.primarySoftBg },
  itemText: { ...typography.body, color: t.textPrimary },
  itemTextOn: { color: t.primary, fontWeight: '700' as const },
  pressed: { opacity: 0.8 },
});

const MENU_WIDTH = 220;

/**
 * A filter as a dropdown: a pill with the current choice and a down arrow; tapping it opens a small
 * menu under it, the current choice ticked. caption = a word before the choice ("Show").
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  caption,
  highlight = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  caption?: string;
  /** Shows the pill in blue (e.g. a filter other than the usual one is on). */
  highlight?: boolean;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const anchor = useRef<React.ComponentRef<typeof View>>(null);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const current = options.find((o) => o.value === value) || options[0];

  function open() {
    anchor.current?.measureInWindow((x, y, w, h) => {
      const screen = Dimensions.get('window').width;
      setMenu({ top: y + h + 6, left: Math.max(spacing.md, Math.min(x, screen - MENU_WIDTH - spacing.md)) });
    });
  }

  return (
    <>
      <View ref={anchor} collapsable={false} style={{ alignSelf: 'flex-start' }}>
        <Pressable
          onPress={open}
          style={({ pressed }) => [styles.btn, highlight && styles.btnOn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${caption ? `${caption} ` : ''}${current?.label}. Change`}
        >
          {!!caption && <Text style={styles.caption}>{caption}</Text>}
          <Text style={[styles.label, highlight && { color: theme.primary }]}>{current?.label}</Text>
          <ChevronDownIcon size={16} color={highlight ? theme.primary : theme.textSecondary} />
        </Pressable>
      </View>
      <Modal visible={!!menu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenu(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} accessibilityLabel="Close">
          {!!menu && (
            <View style={[styles.menu, { top: menu.top, left: menu.left, width: MENU_WIDTH }]}>
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      setMenu(null);
                      onChange(o.value);
                    }}
                    style={({ pressed }) => [styles.item, on && styles.itemOn, pressed && styles.pressed]}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.itemText, on && styles.itemTextOn]}>{o.label}</Text>
                    {on && <CheckIcon size={16} color={theme.primary} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

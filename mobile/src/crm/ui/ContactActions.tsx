import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { radii, spacing } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';
import type { Lead } from '../types';
import { WhatsAppIcon } from './crmIcons';

const WHATSAPP = '#25D366';

const factory = (t: CrmTheme) => ({
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  button: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  call: { backgroundColor: t.primary },
  whatsapp: { backgroundColor: WHATSAPP },
  email: { backgroundColor: t.accent },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  emoji: { fontSize: 13, lineHeight: 16 },
});

function open(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

/** Icon-only Call / WhatsApp / Email shortcuts; Email is disabled when the lead has no address.
 * Solid brand-colour circles with real glyphs (phone/envelope emoji, a proper WhatsApp mark) -
 * not pale tint circles with thin line-art, which is what made these look basic before. */
export function ContactActions({ lead }: { lead: Lead }) {
  const { styles } = useCrmStyles(factory);
  const hasEmail = !!lead.email;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => open(`tel:${lead.phone}`)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`Call ${lead.customerName}`}
        style={({ pressed }) => [styles.button, styles.call, pressed && styles.pressed]}
      >
        <Text style={styles.emoji}>📞</Text>
      </Pressable>
      <Pressable
        onPress={() => open(`https://wa.me/91${lead.phone}`)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`WhatsApp ${lead.customerName}`}
        style={({ pressed }) => [styles.button, styles.whatsapp, pressed && styles.pressed]}
      >
        <WhatsAppIcon size={15} color="#FFFFFF" />
      </Pressable>
      <Pressable
        onPress={() => open(`mailto:${lead.email}`)}
        disabled={!hasEmail}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={hasEmail ? `Email ${lead.customerName}` : 'No email on this lead'}
        style={({ pressed }) => [styles.button, styles.email, !hasEmail && styles.off, pressed && styles.pressed]}
      >
        <Text style={styles.emoji}>✉️</Text>
      </Pressable>
    </View>
  );
}

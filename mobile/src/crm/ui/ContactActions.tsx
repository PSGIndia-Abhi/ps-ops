import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { EmailIcon, PhoneIcon } from '../../components/icons';
import { radii, spacing } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';
import type { Lead } from '../types';
import { WhatsAppIcon } from './crmIcons';

const WHATSAPP = '#25D366';
const WHATSAPP_TINT = 'rgba(37, 211, 102, 0.16)';

const factory = (t: CrmTheme) => ({
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  button: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  call: { backgroundColor: t.primarySoftBg },
  whatsapp: { backgroundColor: WHATSAPP_TINT },
  email: { backgroundColor: t.accentBg },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
});

function open(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

/** Icon-only Call / WhatsApp / Email shortcuts; Email is disabled when the lead has no address. */
export function ContactActions({ lead }: { lead: Lead }) {
  const { styles, theme } = useCrmStyles(factory);
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
        <PhoneIcon size={19} color={theme.primary} />
      </Pressable>
      <Pressable
        onPress={() => open(`https://wa.me/91${lead.phone}`)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`WhatsApp ${lead.customerName}`}
        style={({ pressed }) => [styles.button, styles.whatsapp, pressed && styles.pressed]}
      >
        <WhatsAppIcon size={21} color={WHATSAPP} />
      </Pressable>
      <Pressable
        onPress={() => open(`mailto:${lead.email}`)}
        disabled={!hasEmail}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={hasEmail ? `Email ${lead.customerName}` : 'No email on this lead'}
        style={({ pressed }) => [styles.button, styles.email, !hasEmail && styles.off, pressed && styles.pressed]}
      >
        <EmailIcon size={19} color={theme.accentText} />
      </Pressable>
    </View>
  );
}

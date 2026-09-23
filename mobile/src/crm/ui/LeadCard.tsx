import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { AlertCircleIcon, ClockIcon } from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { formatINR, formatLeadWhen } from '../format';
import { useCrmStyles, type CrmTheme } from '../theme';
import type { Lead } from '../types';
import { ContactActions } from './ContactActions';
import { PestIcon } from './PestIcon';
import { LeadSourceIcon, PaymentStatusIcon } from './StatusBadge';

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    marginBottom: spacing.md,
    padding: spacing.md,
    ...t.cardShadow,
  },
  topRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  pressed: { opacity: 0.9 },
  pestTile: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  main: { flex: 1 },
  name: { ...typography.subtitle, color: t.textPrimary },
  service: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  status: { flexDirection: 'row' as const, gap: spacing.xs },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  whenRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  when: { ...typography.caption, color: t.textMuted },
  waiting: { ...typography.captionMedium, color: t.warningText },
  failed: { ...typography.captionMedium, color: t.dangerText },
});

interface LeadCardProps {
  lead: Lead;
  onPress: () => void;
  /** Position in the list; the first few cards slide in one after another. */
  index?: number;
}

const STAGGER_LIMIT = 8;

export function LeadCard({ lead, onPress, index = 0 }: LeadCardProps) {
  const { styles, theme } = useCrmStyles(factory);
  const paid = lead.paymentStatus === 'paid';
  const enter = useRef(
    new Animated.Value(index < STAGGER_LIMIT ? 0 : 1),
  ).current;

  useEffect(() => {
    if (index >= STAGGER_LIMIT) return;
    Animated.timing(enter, {
      toValue: 1,
      duration: 380,
      delay: index * 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY }] }}>
      <View style={styles.card}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${lead.customerName}, ${
            lead.service
          }, ${formatINR(lead.amount)}, ${paid ? 'paid' : 'payment pending'}`}
          style={({ pressed }) => [styles.topRow, pressed && styles.pressed]}
        >
          <View style={styles.pestTile}>
            <PestIcon service={lead.service} size={30} color={theme.primary} />
          </View>
          <View style={styles.main}>
            <Text style={styles.name} numberOfLines={1}>
              {lead.customerName}
            </Text>
            <Text style={styles.service} numberOfLines={1}>
              {lead.service} · {formatINR(lead.amount)}
            </Text>
          </View>
          <View style={styles.status}>
            <PaymentStatusIcon status={lead.paymentStatus} />
            <LeadSourceIcon source={lead.source} />
          </View>
        </Pressable>

        <View style={styles.footer}>
          <View style={styles.whenRow}>
            {lead.syncError ? (
              <AlertCircleIcon size={13} color={theme.dangerText} />
            ) : (
              <ClockIcon
                size={13}
                color={lead.pendingSync ? theme.warningText : theme.textMuted}
              />
            )}
            <Text
              style={
                lead.syncError
                  ? styles.failed
                  : lead.pendingSync
                  ? styles.waiting
                  : styles.when
              }
            >
              {lead.syncError
                ? "Couldn't send"
                : lead.pendingSync
                ? 'Waiting to send'
                : formatLeadWhen(lead.createdAt)}
            </Text>
          </View>
          <ContactActions lead={lead} />
        </View>
      </View>
    </Animated.View>
  );
}

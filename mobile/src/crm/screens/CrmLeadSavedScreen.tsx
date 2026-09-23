import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { CheckCircleIcon, ClockIcon, PhoneIcon } from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { formatINR } from '../format';
import { confirmationMessage, whatsappUrl } from '../leadHelpers';
import { useLeads } from '../LeadsContext';
import type { CrmStackParamList } from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import { PestIcon } from '../ui/PestIcon';
import { WhatsAppIcon } from '../ui/crmIcons';
import { CrmScreen } from '../ui/CrmScreen';
import { PrimaryButton } from '../ui/PrimaryButton';
import type { Lead } from '../types';

const WHATSAPP = '#25D366';
const AnimatedPath = Animated.createAnimatedComponent(Path);

const factory = (t: CrmTheme) => ({
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center' as const,
  },
  ringWrap: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    width: 120,
    height: 120,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ring: {
    position: 'absolute' as const,
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
  },
  disc: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: {
    ...typography.display,
    color: t.textPrimary,
    textAlign: 'center' as const,
  },
  subtitle: {
    ...typography.body,
    color: t.textSecondary,
    textAlign: 'center' as const,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  card: {
    alignSelf: 'stretch' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    ...t.cardShadow,
  },
  pestTile: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cardMain: { flex: 1 },
  cardName: { ...typography.subtitle, color: t.textPrimary },
  cardService: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' as const },
  cardAmount: { ...typography.title, color: t.textPrimary },
  cardStatus: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: 2,
  },
  cardStatusText: { ...typography.captionMedium },
  note: {
    alignSelf: 'stretch' as const,
    backgroundColor: t.warningBg,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noteText: { ...typography.captionMedium, color: t.warningText },
  actions: {
    alignSelf: 'stretch' as const,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  contactRow: { flexDirection: 'row' as const, gap: spacing.sm },
  contactBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    minHeight: 50,
    borderRadius: radii.lg,
  },
  callBtn: { backgroundColor: t.primarySoftBg },
  callText: { ...typography.button, color: t.primary },
  waBtn: { backgroundColor: WHATSAPP, flex: 2 },
  waText: { ...typography.button, color: '#FFFFFF' },
  pressed: { opacity: 0.85 },
  link: {
    alignSelf: 'center' as const,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  linkText: { ...typography.bodyMedium, color: t.textSecondary },
});

export function CrmLeadSavedScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  const route = useRoute<RouteProp<CrmStackParamList, 'CrmLeadSaved'>>();
  const { getLead, showNotice } = useLeads();
  const { styles, theme } = useCrmStyles(factory);
  const { leadId, note } = route.params;

  // A lead saved offline gets a new id once it is sent, so keep what we first knew to show on screen.
  const snapshot = useRef<Lead | undefined>(getLead(leadId));
  const live = getLead(leadId);
  const lead = live ?? snapshot.current;
  if (live) snapshot.current = live;

  const pop = useRef(new Animated.Value(0)).current;
  const draw = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(pop, {
        toValue: 1,
        friction: 5,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(draw, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [pop, draw, pulse]);

  if (!lead) {
    return (
      <CrmScreen scroll={false} edges={['top', 'bottom']}>
        <View style={styles.scroll}>
          <Text style={styles.title}>Lead saved</Text>
          <View style={styles.actions}>
            <PrimaryButton
              label="Done"
              onPress={() =>
                navigation.navigate('CrmTabs', { screen: 'Leads' })
              }
            />
          </View>
        </View>
      </CrmScreen>
    );
  }

  const offline = !!lead.pendingSync;
  const paid = lead.paymentStatus === 'paid';
  const accent = offline ? theme.warning : theme.success;
  const checkOffset = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.7, 0],
  });

  async function open(url: string, failMessage: string) {
    try {
      await Linking.openURL(url);
    } catch {
      showNotice(failMessage, 'warning');
    }
  }

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.ringWrap}>
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: accent,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.disc,
              { backgroundColor: accent, transform: [{ scale: pop }] },
            ]}
          >
            <Svg width={60} height={60} viewBox="0 0 24 24" fill="none">
              <AnimatedPath
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="#FFFFFF"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={24}
                strokeDashoffset={checkOffset}
              />
            </Svg>
          </Animated.View>
        </View>

        <Text style={styles.title}>
          {offline ? 'Saved on this phone' : 'Lead saved'}
        </Text>
        <Text style={styles.subtitle}>
          {offline
            ? "You're offline. It will be sent automatically as soon as there is a connection."
            : `${lead.customerName} is now in your leads.`}
        </Text>

        <View style={styles.card}>
          <View style={styles.pestTile}>
            <PestIcon service={lead.service} size={30} color={theme.primary} />
          </View>
          <View style={styles.cardMain}>
            <Text style={styles.cardName} numberOfLines={1}>
              {lead.customerName}
            </Text>
            <Text style={styles.cardService} numberOfLines={1}>
              {lead.service}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.cardAmount}>{formatINR(lead.amount)}</Text>
            <View style={styles.cardStatus}>
              {paid ? (
                <CheckCircleIcon size={14} color={theme.successText} />
              ) : (
                <ClockIcon size={14} color={theme.warningText} />
              )}
              <Text
                style={[
                  styles.cardStatusText,
                  { color: paid ? theme.successText : theme.warningText },
                ]}
              >
                {paid ? 'Paid' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {!!note && (
          <View style={styles.note}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <View style={styles.contactRow}>
            <Pressable
              onPress={() =>
                open(`tel:${lead.phone}`, 'No phone app found on this device.')
              }
              accessibilityRole="button"
              accessibilityLabel={`Call ${lead.customerName}`}
              style={({ pressed }) => [
                styles.contactBtn,
                styles.callBtn,
                pressed && styles.pressed,
              ]}
              testID="saved-call"
            >
              <PhoneIcon size={18} color={theme.primary} />
              <Text style={styles.callText}>Call</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                open(
                  whatsappUrl(lead.phone, confirmationMessage(lead)),
                  'Could not open WhatsApp on this device.',
                )
              }
              accessibilityRole="button"
              accessibilityLabel={`Send confirmation to ${lead.customerName} on WhatsApp`}
              style={({ pressed }) => [
                styles.contactBtn,
                styles.waBtn,
                pressed && styles.pressed,
              ]}
              testID="saved-whatsapp"
            >
              <WhatsAppIcon size={20} color="#FFFFFF" />
              <Text style={styles.waText}>Send confirmation</Text>
            </Pressable>
          </View>

          <PrimaryButton
            label="Add another lead"
            onPress={() => navigation.replace('CrmNewLead')}
            testID="saved-add-another"
          />
          <PrimaryButton
            label="View lead"
            variant="secondary"
            onPress={() =>
              live
                ? navigation.replace('CrmLeadDetail', { leadId: live.id })
                : navigation.navigate('CrmTabs', { screen: 'Leads' })
            }
            testID="saved-view"
          />
          <Pressable
            onPress={() => navigation.navigate('CrmTabs', { screen: 'Leads' })}
            accessibilityRole="button"
            style={styles.link}
          >
            <Text style={styles.linkText}>Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    </CrmScreen>
  );
}

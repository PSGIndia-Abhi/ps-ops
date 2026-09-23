import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  PermissionsAndroid,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Contacts, { type Contact } from 'react-native-contacts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseIcon, PersonIcon } from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';
import { cleanPhoneInput } from '../validation';
import { SearchIcon } from './crmIcons';

const factory = (t: CrmTheme) => ({
  sheet: {
    flex: 1,
    marginTop: 60,
    backgroundColor: t.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: { ...typography.title, color: t.textPrimary },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 46,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: t.surfaceAlt,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: t.textPrimary,
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  rowPressed: { backgroundColor: t.surfaceAlt },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowText: { flex: 1 },
  name: { ...typography.bodyMedium, color: t.textPrimary },
  number: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: spacing.xl,
  },
  message: {
    ...typography.body,
    color: t.textSecondary,
    textAlign: 'center' as const,
  },
  action: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
  },
  actionText: { ...typography.button, color: t.textOnPrimary },
});

interface Entry {
  key: string;
  name: string;
  phone: string;
  label: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Contacts don't change while the app is open, so the list is read once and reused. */
let cachedEntries: Entry[] | null = null;

function toEntries(contacts: Contact[]): Entry[] {
  const out: Entry[] = [];
  for (const contact of contacts) {
    const name = (
      contact.displayName ||
      `${contact.givenName ?? ''} ${contact.familyName ?? ''}`
    ).trim();
    const seen = new Set<string>();
    for (const number of contact.phoneNumbers ?? []) {
      const phone = cleanPhoneInput(number.number ?? '');
      if (phone.length !== 10 || seen.has(phone)) continue;
      seen.add(phone);
      out.push({
        key: `${contact.recordID}-${phone}`,
        name: name || phone,
        phone,
        label: number.label ?? '',
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

interface ContactPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (contact: { name: string; phone: string }) => void;
}

type Status = 'loading' | 'ready' | 'denied' | 'error';

/** Pick a customer's name and mobile number from the phone's contacts (read-only). */
export function ContactPickerSheet({
  visible,
  onClose,
  onPick,
}: ContactPickerSheetProps) {
  const { styles, theme } = useCrmStyles(factory);
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('loading');
  const [entries, setEntries] = useState<Entry[]>(cachedEntries ?? []);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    let cancelled = false;
    (async () => {
      if (cachedEntries && cachedEntries.length > 0) {
        setEntries(cachedEntries);
        setStatus('ready');
        return;
      }
      setStatus('loading');
      try {
        // React Native's own request: the contacts library's requestPermission() never returns on this setup.
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: 'Read contacts',
            message:
              'BestServe reads your contacts only so you can pick a customer. Nothing is changed or uploaded.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          },
        );
        if (cancelled) return;
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          setStatus('denied');
          return;
        }
        const list = toEntries(
          await withTimeout(Contacts.getAllWithoutPhotos(), 15000),
        );
        if (cancelled) return;
        cachedEntries = list.length > 0 ? list : null;
        setEntries(list);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    const digits = q.replace(/\D/g, '');
    return entries.filter(
      e =>
        e.name.toLowerCase().includes(q) ||
        (digits.length > 0 && e.phone.includes(digits)),
    );
  }, [entries, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={modalStyles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose from contacts</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}
            >
              <CloseIcon size={18} color={theme.textSecondary} />
            </Pressable>
          </View>

          {status === 'loading' && (
            <View style={styles.center}>
              <ActivityIndicator color={theme.primary} />
            </View>
          )}

          {status === 'denied' && (
            <View style={styles.center}>
              <Text style={styles.message}>
                Allow contacts access to pick a number from your phone. You can
                always type it instead.
              </Text>
              <Pressable
                onPress={() => Linking.openSettings().catch(() => undefined)}
                accessibilityRole="button"
                style={styles.action}
              >
                <Text style={styles.actionText}>Open settings</Text>
              </Pressable>
            </View>
          )}

          {status === 'error' && (
            <View style={styles.center}>
              <Text style={styles.message}>
                Could not read your contacts. You can type the number instead.
              </Text>
            </View>
          )}

          {status === 'ready' && (
            <>
              <View style={styles.search}>
                <SearchIcon size={18} color={theme.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search name or number"
                  placeholderTextColor={theme.textMuted}
                  style={styles.searchInput}
                  autoCorrect={false}
                  accessibilityLabel="Search contacts"
                />
              </View>
              <FlatList
                data={shown}
                keyExtractor={item => item.key}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={20}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Text style={styles.message}>
                      {entries.length === 0
                        ? 'No contacts with a mobile number found.'
                        : 'No contact matches that.'}
                    </Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      onPick({
                        name: item.name === item.phone ? '' : item.name,
                        phone: item.phone,
                      });
                      onClose();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${item.phone}`}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={styles.avatar}>
                      <PersonIcon size={20} color={theme.primary} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.number}>
                        {item.phone}
                        {item.label ? ` · ${item.label}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8, 12, 24, 0.5)' },
});

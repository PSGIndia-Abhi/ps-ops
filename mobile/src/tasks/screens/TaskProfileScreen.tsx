import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { ChevronRightIcon, LockIcon, LogoutIcon, UsersIcon } from '../../components/icons';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { isActive, isOverdue } from '../format';
import { useTasks } from '../TasksContext';
import { cardShadow, font, radius, t } from '../theme';
import { Backdrop } from '../ui/Backdrop';
import { Avatar, PrimaryButton } from '../ui/primitives';
import { Sheet } from '../ui/sheets';

export function TaskProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const { user, logout } = useAuth();
  const { viewer, tasks } = useTasks();
  const [confirmOut, setConfirmOut] = useState(false);

  const stats = useMemo(() => {
    const mine = tasks.filter((x) => x.assigned_to === viewer.id);
    return {
      active: mine.filter(isActive).length,
      done: mine.filter((x) => x.status === 'COMPLETED').length,
      overdue: mine.filter(isOverdue).length,
    };
  }, [tasks, viewer.id]);

  return (
    <View style={styles.flex}>
      <Backdrop />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Avatar name={viewer.name} id={viewer.id} size={92} />
          <Text style={styles.name}>{viewer.name}</Text>
          {!!user?.email && <Text style={styles.email}>{user.email}</Text>}
          {!!viewer.role && (
            <View style={styles.role}>
              <Text style={styles.roleText}>{viewer.role}</Text>
            </View>
          )}
        </View>

        <View style={styles.stats}>
          <Stat value={stats.active} label="Active" />
          <View style={styles.statDivider} />
          <Stat value={stats.done} label="Completed" />
          <View style={styles.statDivider} />
          <Stat value={stats.overdue} label="Overdue" danger={stats.overdue > 0} />
        </View>

        {viewer.team.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <UsersIcon size={18} color={t.ink} />
              <Text style={styles.cardTitle}>My team · {viewer.team.length}</Text>
            </View>
            {viewer.team.map((m) => (
              <View key={m.id} style={styles.member}>
                <Avatar name={m.name} id={m.id} size={38} />
                <View style={styles.flex}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <Text style={styles.memberRole}>
                    {[m.designation || m.role, m.is_direct ? 'Direct report' : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.memberCount}>
                  {tasks.filter((x) => x.assigned_to === m.id && isActive(x)).length}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <Row icon={<LockIcon size={18} color={t.ink} />} label="Change password" onPress={() => navigation.navigate('ChangePassword')} />
          <Row icon={<LogoutIcon size={18} color={t.danger} />} label="Sign out" danger onPress={() => setConfirmOut(true)} last />
        </View>
      </ScrollView>

      <Sheet visible={confirmOut} onClose={() => setConfirmOut(false)} title="Sign out?">
        <Text style={styles.sheetText}>You’ll need to sign in again to see your tasks.</Text>
        <View style={styles.sheetButtons}>
          <PrimaryButton label="Stay" tone="outline" style={styles.flex} onPress={() => setConfirmOut(false)} />
          <PrimaryButton label="Sign out" tone="danger" style={styles.flex} onPress={() => logout()} />
        </View>
      </Sheet>
    </View>
  );
}

function Stat({ value, label, danger }: { value: number; label: string; danger?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, danger && { color: t.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, onPress, danger, last }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: t.dangerSoft }]}>{icon}</View>
      <Text style={[styles.rowLabel, danger && { color: t.danger }]}>{label}</Text>
      {!danger && <ChevronRightIcon size={18} color={t.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  hero: { alignItems: 'center' },
  name: { fontSize: 24, color: t.text, fontFamily: font.medium, marginTop: 14 },
  email: { fontSize: 14, color: t.textSecondary, marginTop: 4 },
  role: { backgroundColor: t.ink, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 7, marginTop: 12 },
  roleText: { color: t.onInk, fontSize: 13, fontFamily: font.medium },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#1F1F22',
    borderRadius: radius.lg,
    paddingVertical: 18,
    marginTop: 24,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, color: t.lime, fontFamily: font.medium },
  statLabel: { fontSize: 12, color: '#A7A7AE', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#3E3E44' },
  card: { backgroundColor: t.surface, borderRadius: radius.lg, padding: 16, marginTop: 16, ...cardShadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 16, color: t.text, fontFamily: font.medium },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  memberName: { fontSize: 14, color: t.text, fontFamily: font.medium },
  memberRole: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  memberCount: {
    minWidth: 30,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: font.medium,
    color: t.ink,
    backgroundColor: t.limeSoft,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F0F3' },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F4F3F6', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, color: t.text },
  sheetText: { fontSize: 14, color: t.textSecondary, marginBottom: 16 },
  sheetButtons: { flexDirection: 'row', gap: 10 },
});

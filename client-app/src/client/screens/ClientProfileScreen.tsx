import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { deleteAvatar, updateProfile, uploadAvatar } from '../../api/auth';
import { useAuth } from '../../auth/AuthContext';
import {
  BriefcaseIcon,
  CameraIcon,
  ChevronRightIcon,
  DocumentIcon,
  EmailIcon,
  GalleryIcon,
  LockIcon,
  LogoutIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  TrashIcon,
} from '../../components/icons';
import { APP_VERSION } from '../../config/appVersion';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { useClientPortal } from '../ClientPortalContext';
import { getClientDashboard } from '../api';
import { periodRange, SUPPORT_CONTACT } from '../format';
import type { ClientStackParamList } from '../navigation';
import { Popup, PopupButtons } from '../ui/Popup';
import { useToast } from '../ui/Toast';
import { UserAvatar } from '../ui/UserAvatar';

/** Clean light palette: white page, soft blue tints, blue line icons (dark-mode twins included). */
const palette = (t: CrmTheme) => ({
  page: t.isDark ? t.background : '#FFFFFF',
  ink: t.isDark ? '#E6E7EA' : '#1B1C1F',
  sub: t.isDark ? '#A3A7AE' : '#5E6470',
  blue: t.isDark ? '#A8C7FA' : '#0B57D0',
  blueSoft: t.isDark ? 'rgba(168,199,250,0.16)' : '#D9E6FC',
  tint: t.isDark ? t.surfaceAlt : '#F2F5FB',
  divider: t.isDark ? 'rgba(255,255,255,0.08)' : '#DFE6F2',
  waveTop: t.isDark ? '#1A2438' : '#DCE8FC',
  waveBottom: t.isDark ? '#141B2B' : '#EEF4FE',
  aqua: t.isDark ? 'rgba(128,222,234,0.14)' : '#DDF4F5',
  aquaInk: t.isDark ? '#80DEEA' : '#00686E',
  lilac: t.isDark ? 'rgba(206,147,216,0.14)' : '#F3E5F7',
  lilacInk: t.isDark ? '#E1A8EA' : '#7A2A8F',
  danger: t.isDark ? '#F28B82' : '#B3261E',
});

const factory = (t: CrmTheme) => {
  const c = palette(t);
  return {
    flex1: { flex: 1 },
    screen: { flex: 1, backgroundColor: c.page },
    pressed: { opacity: 0.6 },
    // ---- identity ----
    top: { alignItems: 'center' as const, paddingBottom: 6 },
    backRow: { alignSelf: 'stretch' as const, height: 52, justifyContent: 'center' as const, paddingHorizontal: 8 },
    back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
    avatarRing: {
      width: 112,
      height: 112,
      borderRadius: 56,
      padding: 5,
      backgroundColor: c.page,
      shadowColor: '#3A5BA0',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 6,
      marginTop: 4,
    },
    avatar: { flex: 1, borderRadius: 51, alignItems: 'center' as const, justifyContent: 'center' as const },
    avatarText: { color: '#FFFFFF', fontSize: 36, fontWeight: '600' as const, letterSpacing: 0.5 },
    editBadge: {
      position: 'absolute' as const,
      right: 0,
      bottom: 4,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.blue,
      borderWidth: 3,
      borderColor: c.page,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    name: { fontSize: 26, lineHeight: 33, fontWeight: '400' as const, color: c.ink, marginTop: 14, textAlign: 'center' as const, paddingHorizontal: 24 },
    email: { fontSize: 15, color: c.sub, marginTop: 4 },
    chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 12, backgroundColor: c.blueSoft, borderRadius: 999, paddingLeft: 5, paddingRight: 12, paddingVertical: 5 },
    chipText: { fontSize: 13.5, fontWeight: '600' as const, color: c.blue },
    // ---- info strip ----
    strip: { flexDirection: 'row' as const, marginHorizontal: 16, marginTop: 22, backgroundColor: c.tint, borderRadius: 24, paddingVertical: 16 },
    stripCell: { flex: 1, alignItems: 'center' as const, paddingHorizontal: 6 },
    stripDivider: { width: 1, backgroundColor: c.divider, marginVertical: 6 },
    stripValue: { fontSize: 15, fontWeight: '600' as const, color: c.ink, marginTop: 8, textAlign: 'center' as const },
    stripValueAdd: { color: c.blue },
    stripLabel: { fontSize: 12.5, color: c.sub, marginTop: 2 },
    // ---- sections ----
    sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: c.ink, marginHorizontal: 20, marginTop: 28, marginBottom: 10 },
    group: { marginHorizontal: 16, backgroundColor: c.tint, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 4 },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 18 },
    rowDivider: { height: 1, backgroundColor: c.divider, marginLeft: 56, marginRight: 12 },
    rowTitle: { fontSize: 16, color: c.ink },
    rowSub: { fontSize: 13.5, color: c.sub, marginTop: 2 },
    rowAction: { fontSize: 14.5, fontWeight: '600' as const, color: c.blue },
    help: { flexDirection: 'row' as const, gap: 12, marginHorizontal: 16 },
    helpTile: { flex: 1, borderRadius: 24, padding: 16, minHeight: 124, justifyContent: 'space-between' as const },
    helpIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: t.isDark ? 'rgba(255,255,255,0.10)' : '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const },
    helpTitle: { fontSize: 16, fontWeight: '600' as const, marginTop: 14 },
    helpSub: { fontSize: 13, marginTop: 2 },
    logout: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, alignSelf: 'center' as const, marginTop: 26, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999 },
    logoutText: { fontSize: 16, fontWeight: '600' as const, color: c.danger },
    version: { fontSize: 12.5, color: c.sub, textAlign: 'center' as const, marginTop: 6 },
    statusCover: { position: 'absolute' as const, top: 0, left: 0, right: 0, backgroundColor: c.page, zIndex: 2 },
    uploading: { position: 'absolute' as const, top: 5, left: 5, right: 5, bottom: 5, borderRadius: 51, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center' as const, justifyContent: 'center' as const },
    photoRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16, paddingVertical: 12, paddingHorizontal: 4 },
    photoIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.blueSoft },
    photoIconDanger: { backgroundColor: t.isDark ? 'rgba(242,139,130,0.14)' : '#FCE8E6' },
    photoLabel: { fontSize: 16, color: c.ink },
    photoLabelDanger: { color: c.danger },
    field: { marginBottom: 12 },
    error: { fontSize: 13.5, color: c.danger, marginTop: 4 },
  };
};

/** Back arrow (a plain line arrow, no box). */
function BackArrow({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M20 12H5M11 5l-7 7 7 7" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A filled circle with a tick - the role chip's mark. */
function Tick({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="11" fill={color} />
      <Path d="M7.2 12.3l3.2 3.1 6.4-6.6" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The soft blue wave behind the top of the page (drawn at its measured size). */
function Wave({ width, height, top, bottom }: { width: number; height: number; top: string; bottom: string }) {
  if (!width || !height) return null;
  const h = height;
  return (
    <Svg width={width} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="profileWave" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
      </Defs>
      <Path d={`M0 0 H${width} V${h * 0.42} C${width * 0.72} ${h * 0.6} ${width * 0.28} ${h * 0.34} 0 ${h * 0.5} Z`} fill="url(#profileWave)" />
      <Circle cx={width * 0.9} cy={h * 0.1} r={46} fill="#FFFFFF" fillOpacity={0.35} />
      <Circle cx={width * 0.12} cy={h * 0.3} r={18} fill="#FFFFFF" fillOpacity={0.4} />
    </Svg>
  );
}

type IconC = React.ComponentType<{ size?: number; color?: string }>;

/** Profile photos are resized on the phone before upload. */
const PHOTO_OPTIONS = { mediaType: 'photo' as const, quality: 0.8 as const, maxWidth: 900, maxHeight: 900 };

function Row({ Icon, title, sub, action, onPress }: { Icon: IconC; title: string; sub: string; action?: string; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const c = palette(theme);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
      <Icon size={24} color={c.blue} />
      <View style={styles.flex1}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {action ? <Text style={styles.rowAction}>{action}</Text> : <ChevronRightIcon size={16} color={c.sub} />}
    </Pressable>
  );
}

/** Profile (web: PortalProfile) - identity, account at a glance, settings and help. */
export function ClientProfileScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const c = palette(theme);
  const toast = useToast();
  const { logout, user, refreshUser } = useAuth();
  const { portal, isCompanyAdmin, outlets, reload } = useClientPortal();

  const savedName = portal?.user?.name || '';
  const savedPhone = portal?.user?.phone || '';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(savedName);
  const [phone, setPhone] = useState(savedPhone);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [topSize, setTopSize] = useState({ width: 0, height: 0 });
  const [scrolled, setScrolled] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeJobs, setActiveJobs] = useState<number | null>(null);

  // Live count for the summary strip: jobs scheduled or in progress (last 30 days), all outlets.
  useEffect(() => {
    let alive = true;
    const range = periodRange('30d');
    getClientDashboard({ from: range.from, to: range.to })
      .then((d) => alive && setActiveJobs(d.kpis.active_jobs ?? 0))
      .catch(() => alive && setActiveJobs(null));
    return () => {
      alive = false;
    };
  }, []);

  const sendPhoto = async (res: ImagePickerResponse) => {
    const asset = res.assets?.[0];
    if (res.didCancel) return;
    if (res.errorCode) return toast.show(res.errorMessage || 'Could not open the photo', 'warning');
    if (!asset?.uri) return;
    setUploading(true);
    try {
      await uploadAvatar({ uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || 'photo.jpg' });
      await refreshUser();
      toast.show('Photo updated');
    } catch (err) {
      toast.show((err as Error).message || 'Could not upload the photo', 'warning');
    } finally {
      setUploading(false);
    }
  };

  const takePhoto = async () => {
    setPhotoMenu(false);
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Camera',
        message: 'BestServe needs the camera to take your profile photo.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return toast.show('Camera permission is needed to take a photo', 'warning');
    }
    sendPhoto(await launchCamera({ ...PHOTO_OPTIONS, cameraType: 'front' }));
  };

  const pickPhoto = async () => {
    setPhotoMenu(false);
    sendPhoto(await launchImageLibrary({ ...PHOTO_OPTIONS, selectionLimit: 1 }));
  };

  const removePhoto = async () => {
    setPhotoMenu(false);
    setUploading(true);
    try {
      await deleteAvatar();
      await refreshUser();
      toast.show('Photo removed');
    } catch (err) {
      toast.show((err as Error).message || 'Could not remove the photo', 'warning');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    setName(savedName);
    setPhone(savedPhone);
  }, [savedName, savedPhone]);

  const openEditor = () => {
    setName(savedName);
    setPhone(savedPhone);
    setFormError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!name.trim()) return setFormError('Please enter your name.');
    setSaving(true);
    setFormError(null);
    try {
      // Email is the sign-in ID; it is sent unchanged (as on the web).
      await updateProfile({ name: name.trim(), phone: phone.trim(), email: portal?.user?.email || undefined });
      setEditing(false);
      toast.show('Details updated');
      reload();
    } catch (err) {
      setFormError((err as Error).message || 'Could not save your details');
    } finally {
      setSaving(false);
    }
  };

  const displayName = savedName || 'Your profile';
  const outletCount = outlets.length;
  const changed = name.trim() !== savedName || phone.trim() !== savedPhone;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > 12;
          if (past !== scrolled) setScrolled(past);
        }}
      >
        {/* ---- identity ---- */}
        <View style={[styles.top, { paddingTop: insets.top }]} onLayout={(e) => setTopSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          <Wave width={topSize.width} height={topSize.height} top={c.waveTop} bottom={c.waveBottom} />
          <View style={styles.backRow}>
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}>
              <BackArrow color={c.ink} />
            </Pressable>
          </View>
          <Pressable onPress={() => !uploading && setPhotoMenu(true)} accessibilityRole="button" accessibilityLabel="Change profile photo">
            <View style={styles.avatarRing}>
              <UserAvatar
                size={102}
                fallback={
                  <View style={[styles.avatar, { backgroundColor: avatarColor(portal?.user?.id ?? displayName) }]}>
                    <Text style={styles.avatarText}>{initials(displayName)}</Text>
                  </View>
                }
              />
              {uploading && (
                <View style={styles.uploading}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              )}
            </View>
            <View style={styles.editBadge}>
              <CameraIcon size={16} color={theme.isDark ? '#0B1B3A' : '#FFFFFF'} />
            </View>
          </Pressable>
          <Text style={styles.name} numberOfLines={2}>
            {displayName}
          </Text>
          {!!portal?.user?.email && <Text style={styles.email}>{portal.user.email}</Text>}
          <View style={styles.chip}>
            <Tick color={c.blue} />
            <Text style={styles.chipText}>{isCompanyAdmin ? 'Company admin' : 'Outlet user'}</Text>
          </View>
        </View>

        {/* ---- account at a glance ---- */}
        <View style={styles.strip}>
          <Pressable onPress={() => navigation.navigate('Jobs')} style={({ pressed }) => [styles.stripCell, pressed && styles.pressed]} accessibilityRole="button">
            <BriefcaseIcon size={24} color={c.blue} />
            <Text style={styles.stripValue}>{activeJobs ?? '—'}</Text>
            <Text style={styles.stripLabel}>Active jobs</Text>
          </Pressable>
          <View style={styles.stripDivider} />
          <Pressable onPress={() => navigation.navigate('ClientOutlets')} style={({ pressed }) => [styles.stripCell, pressed && styles.pressed]} accessibilityRole="button">
            <PinIcon size={24} color={c.blue} />
            <Text style={styles.stripValue}>{outletCount}</Text>
            <Text style={styles.stripLabel}>{outletCount === 1 ? 'Outlet' : 'Outlets'}</Text>
          </Pressable>
          <View style={styles.stripDivider} />
          <Pressable onPress={openEditor} style={({ pressed }) => [styles.stripCell, pressed && styles.pressed]} accessibilityRole="button">
            <PhoneIcon size={24} color={c.blue} />
            <Text style={[styles.stripValue, !savedPhone && styles.stripValueAdd]} numberOfLines={1}>
              {savedPhone || '+ Add'}
            </Text>
            <Text style={styles.stripLabel}>Mobile</Text>
          </Pressable>
        </View>

        {/* ---- account ---- */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.group}>
          <Row Icon={PersonIcon} title="Personal details" sub="Name and mobile number" action="Edit" onPress={openEditor} />
          <View style={styles.rowDivider} />
          <Row Icon={LockIcon} title="Change password" sub="Keep your account secure" onPress={() => navigation.navigate('ChangePassword')} />
          <View style={styles.rowDivider} />
          <Row Icon={DocumentIcon} title="Documents" sub="Certificates, reports and invoices" onPress={() => navigation.navigate('ClientDocuments')} />
        </View>

        {/* ---- help ---- */}
        <Text style={styles.sectionTitle}>Need help?</Text>
        <View style={styles.help}>
          <Pressable onPress={() => Linking.openURL(`tel:${SUPPORT_CONTACT.phone}`)} style={({ pressed }) => [styles.helpTile, { backgroundColor: c.aqua }, pressed && styles.pressed]} accessibilityRole="button">
            <View style={styles.helpIcon}>
              <PhoneIcon size={20} color={c.aquaInk} />
            </View>
            <View>
              <Text style={[styles.helpTitle, { color: c.aquaInk }]}>Call us</Text>
              <Text style={[styles.helpSub, { color: c.aquaInk }]}>{SUPPORT_CONTACT.phoneDisplay}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_CONTACT.email}`)} style={({ pressed }) => [styles.helpTile, { backgroundColor: c.lilac }, pressed && styles.pressed]} accessibilityRole="button">
            <View style={styles.helpIcon}>
              <EmailIcon size={20} color={c.lilacInk} />
            </View>
            <View>
              <Text style={[styles.helpTitle, { color: c.lilacInk }]}>Email us</Text>
              <Text style={[styles.helpSub, { color: c.lilacInk }]} numberOfLines={1}>
                {SUPPORT_CONTACT.email}
              </Text>
            </View>
          </Pressable>
        </View>

        <Pressable onPress={() => setConfirmOut(true)} style={({ pressed }) => [styles.logout, pressed && styles.pressed]} accessibilityRole="button">
          <LogoutIcon size={20} color={c.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
        <Text style={styles.version}>BestServe Client · v{APP_VERSION}</Text>
      </ScrollView>

      {scrolled && <View style={[styles.statusCover, { height: insets.top }]} pointerEvents="none" />}

      {/* ---- profile photo ---- */}
      <Popup visible={photoMenu} onClose={() => setPhotoMenu(false)} title="Profile photo">
        <Pressable onPress={takePhoto} style={({ pressed }) => [styles.photoRow, pressed && styles.pressed]} accessibilityRole="button">
          <View style={styles.photoIcon}>
            <CameraIcon size={20} color={c.blue} />
          </View>
          <Text style={styles.photoLabel}>Take photo</Text>
        </Pressable>
        <Pressable onPress={pickPhoto} style={({ pressed }) => [styles.photoRow, pressed && styles.pressed]} accessibilityRole="button">
          <View style={styles.photoIcon}>
            <GalleryIcon size={20} color={c.blue} />
          </View>
          <Text style={styles.photoLabel}>Choose from gallery</Text>
        </Pressable>
        {!!user?.has_avatar && (
          <Pressable onPress={removePhoto} style={({ pressed }) => [styles.photoRow, pressed && styles.pressed]} accessibilityRole="button">
            <View style={[styles.photoIcon, styles.photoIconDanger]}>
              <TrashIcon size={20} color={c.danger} />
            </View>
            <Text style={[styles.photoLabel, styles.photoLabelDanger]}>Remove photo</Text>
          </Pressable>
        )}
      </Popup>

      {/* ---- edit name & mobile ---- */}
      <Popup visible={editing} onClose={() => setEditing(false)} dismissible={!saving} title="Edit details">
        <View style={styles.field}>
          <CrmTextField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
        </View>
        <CrmTextField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Add your mobile number" />
        {!!formError && <Text style={styles.error}>{formError}</Text>}
        <PopupButtons onCancel={() => setEditing(false)} confirmLabel="Save" onConfirm={save} loading={saving} disabled={!changed} />
      </Popup>

      {/* ---- log out ---- */}
      <Popup
        visible={confirmOut}
        onClose={() => setConfirmOut(false)}
        icon={<LogoutIcon size={20} color="#FFFFFF" />}
        tone="danger"
        title="Log out of BestServe?"
        subtitle="You can sign in again any time."
      >
        <PopupButtons
          onCancel={() => setConfirmOut(false)}
          confirmLabel="Log out"
          tone="danger"
          onConfirm={() => {
            setConfirmOut(false);
            logout();
          }}
        />
      </Popup>
    </View>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createSound, type RecordBackType } from 'react-native-nitro-sound';
import { MicIcon, StopIcon } from '../../components/icons';
import { colors, radii, spacing } from '../../theme';
import { auditsApi, newId, type Audit, type Lookups, type RiskLevelCode, type WalkthroughArea } from '../api';
import { addDays, describeMissing, fmtDate } from '../format';
import { PhotoGrid, askPermission, type PhotoItem } from '../media';
import { BottomBar, ChipRow, GreenButton, Input, MessageBox, RiskSegment, auditStyles as a } from '../ui';
import { ag } from '../theme';
import type { AuditsStackParamList } from '../AuditsNavigator';

type Nav = NativeStackNavigationProp<AuditsStackParamList>;
type Route = RouteProp<AuditsStackParamList, 'Walkthrough'>;

const KNOWN_CATEGORIES = ['HARBOURAGE', 'BURROWS', 'ENTRY_POINT', 'FOOD_SOURCE', 'WATER'];
const RISK_LEVELS: RiskLevelCode[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DAY_CHIPS = ['0', '7', '15', '30'];
const DAYS_OTHER = 'OTHER';
const dayLabel = (d: string) => (d === '0' ? 'Now' : d === DAYS_OTHER ? '＋ Other' : `${d} days`);
const FALLBACK_DAYS = 30;
const PLACEHOLDER_AREA = 'New area';
const fmtSecs = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

interface CardFinding {
  id: string;
  isNew: boolean;
  rowVersion?: number;
  title: string;
  riskCategory: string;
  categoryOther: string;
  riskLevel: RiskLevelCode;
  days: string;
  daysOther: boolean;
  observation: string;
  customerAction: string;
  bestserveAction: string;
  photos: PhotoItem[];
}
interface Card {
  id: string;
  rowVersion?: number;
  areaName: string;
  zoneName: string;
  findings: CardFinding[];
  missing: string[];
  done: boolean;
}

/**
 * Site walkthrough: one recording for the whole site -> the AI lists the areas it heard
 * (each with its findings, actions and a suggested risk) -> the supervisor checks each card,
 * adds photos per area, and saves them all at once.
 */
export function WalkthroughScreen() {
  const navigation = useNavigation<Nav>();
  const { auditId } = useRoute<Route>().params;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [phase, setPhase] = useState<'record' | 'processing' | 'review'>('record');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<ReturnType<typeof createSound> | null>(null);
  if (!recorder.current) recorder.current = createSound();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    auditsApi.get(auditId).then(setAudit).catch(e => setError(e.message));
    auditsApi.lookups().then(setLookups).catch(() => undefined);
    const r = recorder.current;
    return () => {
      r?.stopRecorder().catch(() => undefined);
      r?.removeRecordBackListener();
    };
  }, [auditId]);
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [error]);

  const levels = lookups?.riskLevels || [];
  const categories = (lookups?.riskCategories || []);
  const customerLabel = audit?.customerActionLabel || 'Customer / Site Action';

  function daysFor(level: RiskLevelCode, said: number | null): Pick<CardFinding, 'days' | 'daysOther'> {
    const def = said ?? levels.find(l => l.code === level)?.defaultDays ?? FALLBACK_DAYS;
    const d = String(def);
    return { days: d, daysOther: !DAY_CHIPS.includes(d) };
  }

  // ---- recording -----------------------------------------------------------

  async function start() {
    setError(null);
    if (!(await askPermission('mic'))) return setError('Microphone permission was denied. Enable it in Settings.');
    const r = recorder.current!;
    try {
      await r.startRecorder(undefined, undefined, true);
      r.addRecordBackListener((e: RecordBackType) => setSeconds(Math.floor(e.currentPosition / 1000)));
      setRecording(true);
    } catch {
      setError('Could not start recording.');
    }
  }

  async function stop() {
    const r = recorder.current!;
    const uri = await r.stopRecorder();
    r.removeRecordBackListener();
    setRecording(false);
    setLastFile(uri);
    await process(uri);
  }

  // Sends the recording; the AI answers with the areas it heard (can take a minute for a long walk).
  async function process(uri: string) {
    setPhase('processing');
    setError(null);
    try {
      const res = await auditsApi.walkthrough(auditId, { uri, name: `walkthrough-${Date.now()}.m4a`, type: 'audio/m4a' });
      setCards(res.areas.map(toCard));
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the recording. Tap Try again.');
      setPhase('record');
    }
  }

  function toCard(w: WalkthroughArea): Card {
    return {
      id: newId(),
      areaName: w.areaName,
      zoneName: w.zoneName,
      missing: [],
      done: false,
      findings: (w.findings.length ? w.findings : [{ title: '', riskCategory: '', riskLevel: '', fixWithinDays: null, observation: '', customerAction: '', bestserveAction: '' }]).map(x => {
        const level = (RISK_LEVELS.includes(x.riskLevel as RiskLevelCode) ? x.riskLevel : 'MEDIUM') as RiskLevelCode;
        const code = x.riskCategory.toUpperCase().replace(/\s+/g, '_');
        const known = KNOWN_CATEGORIES.includes(code);
        return {
          id: newId(), isNew: true, title: x.title,
          riskCategory: known ? code : x.riskCategory ? 'OTHER' : 'HARBOURAGE',
          categoryOther: known ? '' : x.riskCategory,
          riskLevel: level,
          ...daysFor(level, x.fixWithinDays),
          observation: x.observation, customerAction: x.customerAction, bestserveAction: x.bestserveAction,
          photos: [],
        };
      }),
    };
  }

  // ---- editing the cards -------------------------------------------------------

  const setCard = (ci: number, patch: Partial<Card>) => setCards(list => list.map((c, i) => (i === ci ? { ...c, ...patch } : c)));
  const setFinding = (ci: number, fi: number, patch: Partial<CardFinding>) =>
    setCards(list => list.map((c, i) => (i === ci ? { ...c, findings: c.findings.map((x, j) => (j === fi ? { ...x, ...patch } : x)) } : c)));

  function addCard() {
    setCards(list => [...list, toCard({ areaName: '', zoneName: '', findings: [] })]);
  }

  async function removeCard(ci: number) {
    const c = cards[ci];
    if (c.rowVersion !== undefined) {
      try {
        await auditsApi.removeArea(auditId, c.id);
      } catch {
        setError('This area already has photos, so it cannot be removed here. Remove its photos first.');
        return;
      }
    }
    setCards(list => list.filter((_, i) => i !== ci));
  }

  // ---- saving ------------------------------------------------------------------

  /** Saves one card as an area (draft unless `complete`). Returns the server's missing list, or null on error. */
  async function persistCard(ci: number, complete: boolean): Promise<string[] | null> {
    const c = cards[ci];
    try {
      let version = c.rowVersion;
      const name = c.areaName.trim() || PLACEHOLDER_AREA;
      if (version === undefined) {
        const added = await auditsApi.addAreas(auditId, [{ id: c.id, areaName: name, zoneName: c.zoneName || null }]);
        version = added.areas[0].rowVersion;
      }
      const res = await auditsApi.saveArea(auditId, c.id, {
        rowVersion: version,
        areaName: name,
        zoneName: c.zoneName,
        markCompleted: complete,
        findings: c.findings.map(x => ({
          id: x.id,
          rowVersion: x.isNew ? undefined : x.rowVersion,
          title: x.title,
          riskLevel: x.riskLevel,
          riskCategory: x.riskCategory === 'OTHER' && x.categoryOther.trim() ? x.categoryOther.trim() : x.riskCategory,
          actionWithinDays: x.days === '' ? undefined : Number(x.days),
          observationText: x.observation,
          customerActionText: x.customerAction,
          bestserveActionText: x.bestserveAction,
        })),
        removedFindingIds: [],
      });
      setCards(list => list.map((y, i) => (i !== ci ? y : {
        ...y,
        rowVersion: res.area.rowVersion,
        findings: y.findings.map(x => {
          const s = res.findings.find(z => z.id === x.id);
          return s ? { ...x, isNew: false, rowVersion: s.rowVersion } : x;
        }),
      })));
      return res.missing;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the area');
      return null;
    }
  }

  // Photos need the area on the server first: save the card as a draft.
  const ensureFor = (ci: number) => async () => {
    const c = cards[ci];
    if (c.rowVersion !== undefined && !c.findings.some(x => x.isNew)) return true;
    return (await persistCard(ci, false)) !== null;
  };

  const problems = (c: Card) => [
    !c.areaName.trim() ? 'area name' : null,
    ...c.findings.flatMap((x, j) => {
      const n = c.findings.length > 1 ? ` (finding ${j + 1})` : '';
      return [
        !x.observation.trim() ? `observation${n}` : null,
        !x.customerAction.trim() ? `customer action${n}` : null,
        !x.bestserveAction.trim() ? `BestServe action${n}` : null,
        x.days === '' ? `"Fix within"${n}` : null,
        x.riskCategory === 'OTHER' && !x.categoryOther.trim() ? `risk category${n}` : null,
      ];
    }),
  ].filter(Boolean) as string[];

  async function saveAll() {
    if (cards.some(c => c.findings.some(x => x.photos.some(p => p.state === 'uploading')))) {
      return setError('Wait for the photos to finish uploading.');
    }
    const firstBad = cards.findIndex(c => problems(c).length);
    if (firstBad >= 0) return setError(`Area ${firstBad + 1}: fill in the ${problems(cards[firstBad]).join(', ')}.`);
    setSaving(true);
    setError(null);
    let allDone = true;
    for (let i = 0; i < cards.length; i++) {
      const missing = await persistCard(i, true);
      if (missing === null) { allDone = false; break; }
      setCard(i, { missing, done: !missing.length });
      if (missing.length) allDone = false;
    }
    setSaving(false);
    if (allDone) {
      navigation.navigate('AuditAreas', { auditId, savedArea: `${cards.length} area${cards.length === 1 ? '' : 's'}` });
    } else {
      setError('Some areas are saved as drafts. Check the cards marked in orange.');
    }
  }

  // ---- render --------------------------------------------------------------------

  if (phase !== 'review') {
    return (
      <View style={styles.screen}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          {error ? <MessageBox tone="error" title={error} /> : null}
          <View style={styles.hint}>
            <Text style={styles.hintTitle}>Walk the site and record once</Text>
            <Text style={styles.hintLine}>For each area, say:</Text>
            <Text style={styles.hintLine}>1. The area name (and floor / block)</Text>
            <Text style={styles.hintLine}>2. The problem you see</Text>
            <Text style={styles.hintLine}>3. What the customer should do</Text>
            <Text style={styles.hintLine}>4. What BestServe will do</Text>
            <Text style={styles.hintNote}>Then the next area. Any language is fine. Keep it under about 10 minutes - for a big site, record in two parts.</Text>
          </View>

          <View style={styles.recCard}>
            {phase === 'processing' ? (
              <>
                <ActivityIndicator size="large" color={ag.green} />
                <Text style={styles.recTitle}>Reading the areas…</Text>
                <Text style={a.muted}>A long walkthrough can take up to a minute.</Text>
              </>
            ) : recording ? (
              <>
                <View style={styles.recHead}><View style={styles.recDot} /><Text style={styles.recTitle}>Listening…</Text></View>
                <Text style={styles.timer}>{fmtSecs(seconds)}</Text>
                <Pressable onPress={stop} style={styles.stopBtn} accessibilityLabel="Stop recording"><StopIcon size={24} color="#fff" /></Pressable>
                <Text style={a.muted}>Tap when you have finished all the areas</Text>
              </>
            ) : (
              <>
                <Pressable onPress={start} style={styles.micBtn} accessibilityLabel="Start recording"><MicIcon size={30} color="#fff" /></Pressable>
                <Text style={styles.recTitle}>Tap and start the walkthrough</Text>
              </>
            )}
          </View>
          {lastFile && phase === 'record' && !recording ? (
            <GreenButton label="Try again with the same recording" variant="outline" onPress={() => process(lastFile)} />
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <MessageBox tone="error" title={error} /> : null}
        <MessageBox tone="ok" title={`Found ${cards.length} area${cards.length === 1 ? '' : 's'} - check each one, add photos, then Save all.`} />

        {cards.map((c, ci) => (
          <View key={c.id} style={[a.card, styles.card, c.missing.length ? styles.cardWarn : null, c.done ? styles.cardDone : null]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardNum}>Area {ci + 1}{c.done ? '  ✓ saved' : ''}</Text>
              <Pressable onPress={() => removeCard(ci)} hitSlop={8}><Text style={styles.remove}>Remove</Text></Pressable>
            </View>
            <Input label="Area Name" required value={c.areaName} onChangeText={t => setCard(ci, { areaName: t })} placeholder="e.g. Kitchen" maxLength={200} />
            <Input label="Zone (Optional)" value={c.zoneName} onChangeText={t => setCard(ci, { zoneName: t })} placeholder="e.g. First floor" maxLength={150} />

            {c.findings.map((x, fi) => {
              const due = x.days !== '' && audit ? addDays(audit.auditDate, Number(x.days)) : null;
              return (
                <View key={x.id} style={fi ? styles.findingGap : undefined}>
                  {c.findings.length > 1 ? <Text style={a.section}>Finding {fi + 1}</Text> : null}
                  <Input label="What did you find? (Optional)" value={x.title} onChangeText={t => setFinding(ci, fi, { title: t })} maxLength={250} />
                  <ChipRow
                    label="Risk Category *"
                    options={categories.map(k => ({ value: k.code, label: k.code === 'OTHER' ? '＋ Other' : k.label }))}
                    selected={[x.riskCategory]}
                    onToggle={v => setFinding(ci, fi, { riskCategory: v })}
                  />
                  {x.riskCategory === 'OTHER' ? (
                    <Input label="Other risk category" required value={x.categoryOther} onChangeText={t => setFinding(ci, fi, { categoryOther: t })} maxLength={50} />
                  ) : null}
                  <Text style={styles.fieldLabel}>Risk Level <Text style={styles.req}>*</Text></Text>
                  <RiskSegment levels={levels} value={x.riskLevel} onChange={v => setFinding(ci, fi, { riskLevel: v, ...daysFor(v, null) })} />
                  <ChipRow
                    label="Fix within *"
                    options={[...DAY_CHIPS, DAYS_OTHER].map(d => ({ value: d, label: dayLabel(d) }))}
                    selected={x.daysOther ? [DAYS_OTHER] : x.days !== '' ? [x.days] : []}
                    onToggle={d => setFinding(ci, fi, d === DAYS_OTHER ? { daysOther: true, days: '' } : { daysOther: false, days: d })}
                  />
                  {x.daysOther ? (
                    <Input label="Number of days" required value={x.days} keyboardType="number-pad" maxLength={3}
                      onChangeText={t => setFinding(ci, fi, { days: t.replace(/\D/g, '').slice(0, 3) })} />
                  ) : null}
                  {due ? <Text style={[a.muted, styles.due]}>Due {fmtDate(due)}</Text> : null}
                  <Input label="Observation" required value={x.observation} onChangeText={t => setFinding(ci, fi, { observation: t })} multiline maxLength={4000} />
                  <Input label={customerLabel} required value={x.customerAction} onChangeText={t => setFinding(ci, fi, { customerAction: t })} multiline maxLength={2000} />
                  <Input label="BestServe Action" required value={x.bestserveAction} onChangeText={t => setFinding(ci, fi, { bestserveAction: t })} multiline maxLength={2000} />
                  <Text style={styles.fieldLabel}>Photos</Text>
                  <PhotoGrid
                    auditId={auditId}
                    findingId={x.id}
                    photos={x.photos}
                    ensureSaved={ensureFor(ci)}
                    onChange={update => setCards(list => list.map((y, i) => (i !== ci ? y : {
                      ...y, findings: y.findings.map((z, j) => (j === fi ? { ...z, photos: update(z.photos) } : z)),
                    })))}
                  />
                </View>
              );
            })}
            {c.missing.length ? (
              <MessageBox tone="warn" title="Saved as draft. To complete this area, add:" lines={c.missing.map(describeMissing)} />
            ) : null}
          </View>
        ))}

        <Pressable onPress={addCard} style={styles.addCard}><Text style={styles.addCardText}>＋ Add an area that was missed</Text></Pressable>
      </ScrollView>
      <BottomBar>
        <GreenButton label={`Save all ${cards.length} area${cards.length === 1 ? '' : 's'}`} onPress={saveAll} loading={saving} disabled={saving || !cards.length} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  hint: { backgroundColor: ag.greenSofter, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md },
  hintTitle: { fontWeight: '700', color: ag.greenDark, marginBottom: 4, fontSize: 16 },
  hintLine: { color: colors.textPrimary, lineHeight: 22 },
  hintNote: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  recCard: { alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, marginBottom: spacing.md },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ag.red },
  recTitle: { fontSize: 16, fontWeight: '700', color: ag.greenDark },
  timer: { fontSize: 32, fontWeight: '800', color: colors.textPrimary },
  micBtn: { width: 84, height: 84, borderRadius: 42, backgroundColor: ag.green, alignItems: 'center', justifyContent: 'center' },
  stopBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: ag.red, alignItems: 'center', justifyContent: 'center' },
  card: { marginBottom: spacing.md },
  cardWarn: { borderColor: '#F59E0B', borderWidth: 2 },
  cardDone: { borderColor: ag.green, borderWidth: 2 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardNum: { fontSize: 17, fontWeight: '800', color: ag.greenDark },
  remove: { color: ag.red, fontWeight: '700' },
  findingGap: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  req: { color: ag.red },
  due: { marginTop: -spacing.sm, marginBottom: spacing.md },
  addCard: { alignItems: 'center', paddingVertical: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: ag.green, marginBottom: spacing.md },
  addCardText: { color: ag.green, fontWeight: '700' },
});

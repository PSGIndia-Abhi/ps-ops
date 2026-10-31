import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ApiError } from '../../api/httpClient';
import { CloseIcon } from '../../components/icons';
import { colors, radii, spacing } from '../../theme';
import {
  auditsApi, newId, type Audit, type Lookups, type RiskLevelCode, type SaveAreaResult, type VoiceField as VoiceFieldType,
  type VoiceNote,
} from '../api';
import { addDays, describeMissing, fmtDate, titleCase } from '../format';
import { PhotoGrid, VoiceField, type PhotoItem } from '../media';
import {
  BottomBar, ChipRow, ConfirmDialog, GreenButton, Input, MessageBox, RiskSegment, Stepper, auditStyles as a,
} from '../ui';
import { ag } from '../theme';
import type { AuditsStackParamList } from '../AuditsNavigator';

type Nav = NativeStackNavigationProp<AuditsStackParamList>;
type Route = RouteProp<AuditsStackParamList, 'AreaInspect'>;

// Category codes the backend knows; anything else is a category typed under "Other".
const KNOWN_CATEGORIES = ['HARBOURAGE', 'BURROWS', 'ENTRY_POINT', 'FOOD_SOURCE', 'WATER', 'OTHER'];
const RISK_LEVELS: RiskLevelCode[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// 1. Photos  2. One recording (area, problem, observation, both actions)  3. Check / edit everything and save.
const STEPS = ['Photos', 'Recording', 'Review & details'];
const STEP_PHOTOS = 0;
const STEP_RECORD = 1;
const STEP_DETAILS = 2;
const LAST_STEP = STEP_DETAILS;

// The supervisor confirms "Fix within" (filled only when it was said in the recording).
const DAY_CHIPS = ['0', '7', '15', '30'];
const DAYS_OTHER = 'OTHER';
const dayLabel = (d: string) => (d === '0' ? 'Now' : d === DAYS_OTHER ? '＋ Other' : `${d} days`);
// No default for a level (e.g. Low = monitor every visit): use this many days.
const FALLBACK_DAYS = 30;
// Saved for a new area until its name is known (from the recording or typed on the last step).
const PLACEHOLDER_AREA = 'New area';

// Target pests of the area, saved in the area's zone box as text, e.g. "Cockroaches, Rodents, Lizards".
const PEST_CODES = ['COCKROACHES', 'RODENTS', 'MOSQUITOES', 'FLIES', 'TERMITES'];
const pestText = (codes: string[], other: string) =>
  [...codes.map(titleCase), ...(other.trim() ? [other.trim()] : [])].join(', ');
/** Known pests become chips; anything else goes into the "Other" text. */
function splitPests(list: string[]) {
  const codes: string[] = [];
  const others: string[] = [];
  list.map(x => x.trim()).filter(Boolean).forEach(x => {
    const code = x.toUpperCase().replace(/\s+/g, '_');
    if (PEST_CODES.includes(code)) { if (!codes.includes(code)) codes.push(code); } else others.push(x);
  });
  return { codes, other: others.join(', ') };
}

interface FindingForm {
  id: string;
  isNew: boolean;
  rowVersion?: number;
  findingNumber?: number;
  title: string;
  riskLevel: RiskLevelCode;
  riskCategory: string;
  /** Text typed when the category is "Other" (saved as the category itself). */
  categoryOther: string;
  riskTypeText: string;
  days: string;
  /** "Other" chosen: the number of days is typed. */
  daysOther: boolean;
  /** "Fix within" was filled from the risk level (follows the level until the supervisor picks one). */
  daysAuto?: boolean;
  observation: string;
  customerAction: string;
  bestserveAction: string;
  dueDate: string | null;
  photos: PhotoItem[];
  notes: Partial<Record<VoiceFieldType, VoiceNote | null>>;
}

type TextKey = 'observation' | 'customerAction' | 'bestserveAction';
const TEXT_KEY: Record<VoiceFieldType, TextKey> = {
  OBSERVATION: 'observation',
  CUSTOMER_ACTION: 'customerAction',
  BESTSERVE_ACTION: 'bestserveAction',
};

const blankFinding = (): FindingForm => ({
  id: newId(), isNew: true, title: '', riskLevel: 'MEDIUM', riskCategory: 'HARBOURAGE', categoryOther: '', riskTypeText: '', days: '', daysOther: false,
  observation: '', customerAction: '', bestserveAction: '', dueDate: null, photos: [], notes: {},
});

/**
 * One area in three steps: Photos -> one Recording (the AI fills area, zone, problem, observation,
 * both actions and a suggested risk) -> Review & details (everything editable) -> save.
 * "Save Draft" (header) keeps what is entered; "Save & Finish" / "Save & New Area" also mark it completed.
 */
export function AreaInspectScreen() {
  const navigation = useNavigation<Nav>();
  const { auditId, areaId, savedArea } = useRoute<Route>().params;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [id] = useState(() => areaId || newId());
  const [rowVersion, setRowVersion] = useState<number | undefined>(undefined);
  const [areaNumber, setAreaNumber] = useState<number | null>(null);
  const [areaName, setAreaName] = useState('');
  // Target pests replace the zone: chips for the known ones, "Other" typed.
  const [pests, setPests] = useState<string[]>([]);
  const [otherPestOn, setOtherPestOn] = useState(false);
  const [otherPest, setOtherPest] = useState('');
  const zoneName = pestText(pests, otherPestOn ? otherPest : '');
  /** Fills the pest chips (and "Other") from a list, e.g. what the AI heard. */
  const setPestList = useCallback((list: string[]) => {
    const s = splitPests(list);
    setPests(s.codes);
    setOtherPestOn(!!s.other);
    setOtherPest(s.other);
  }, []);
  const [findings, setFindings] = useState<FindingForm[]>([blankFinding()]);
  const [active, setActive] = useState(0);
  const [removed, setRemoved] = useState<string[]>([]);
  // An existing area opens on its details; a new one starts with photos.
  const [step, setStep] = useState(areaId ? STEP_DETAILS : STEP_PHOTOS);
  // No language choice on screen: the AI detects it (Kannada, Hindi, English, mixed).
  const [language, setLanguage] = useState('auto');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [askRemoveFinding, setAskRemoveFinding] = useState(false);
  // Which last-step button is saving ("finish" = back to the list, "next" = open the next area).
  const [savingMode, setSavingMode] = useState<'finish' | 'next' | null>(null);
  // "✓ <area> saved" for a few seconds when this form was opened by "Save & New Area".
  const [savedNote, setSavedNote] = useState<string | null>(savedArea || null);
  // Shown on the last step when the AI filled fields from the recording.
  const [aiFilled, setAiFilled] = useState(false);
  // A new error scrolls the form to the top, where the message is shown.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [error]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    if (!savedNote) return undefined;
    const t = setTimeout(() => setSavedNote(null), 3500);
    return () => clearTimeout(t);
  }, [savedNote]);

  useEffect(() => {
    auditsApi.lookups().then(setLookups).catch(() => undefined);
    auditsApi.get(auditId).then(async data => {
      setAudit(data);
      const area = areaId ? data.areas.find(x => x.id === areaId) : undefined;
      if (!area) return;
      setRowVersion(area.rowVersion);
      setAreaNumber(area.areaNumber);
      setAreaName(area.areaName === PLACEHOLDER_AREA ? '' : area.areaName);
      setPestList((area.zoneName || '').split(','));
      if (!area.findings.length) return;
      const forms = await Promise.all(area.findings.map(async f => {
        const notes: FindingForm['notes'] = {};
        await Promise.all(f.voice.map(async v => {
          notes[v.fieldType] = await auditsApi.getVoice(auditId, v.id).catch(() => null);
        }));
        // A translation waiting for review is shown in its (still empty) field, ready to edit.
        const draftFor = (field: VoiceFieldType, saved: string | null) => {
          const n = notes[field];
          if (saved) return saved;
          if (n && n.status === 'REVIEW_REQUIRED') return n.englishDraft || '';
          // The single recording: its parts fill the two actions too.
          const all = notes.OBSERVATION?.parts;
          if (all && field === 'CUSTOMER_ACTION') return all.customerAction || '';
          if (all && field === 'BESTSERVE_ACTION') return all.bestserveAction || '';
          return '';
        };
        return {
          id: f.id, isNew: false, rowVersion: f.rowVersion, findingNumber: f.findingNumber, title: f.title,
          riskLevel: f.riskLevel,
          // A category typed under "Other" comes back as its text.
          riskCategory: KNOWN_CATEGORIES.includes(f.riskCategory) ? f.riskCategory : 'OTHER',
          categoryOther: KNOWN_CATEGORIES.includes(f.riskCategory) ? '' : f.riskCategory,
          riskTypeText: f.riskTypeText || '',
          days: f.actionWithinDays == null ? '' : String(f.actionWithinDays),
          daysOther: f.actionWithinDays != null && !DAY_CHIPS.includes(String(f.actionWithinDays)),
          observation: draftFor('OBSERVATION', f.observationText),
          customerAction: draftFor('CUSTOMER_ACTION', f.customerActionText),
          bestserveAction: draftFor('BESTSERVE_ACTION', f.bestserveActionText),
          dueDate: f.actionDueDate,
          photos: f.photos.map(p => ({ id: p.id, url: p.url, state: 'uploaded' as const, marked: !!p.marked, v: p.v || null })),
          notes,
        };
      }));
      setFindings(forms);
      // Area saved before its name was known ("New area"): take the name and pests the AI heard
      // in the recording, so the supervisor only has to check them.
      const heard = forms.map(x => x.notes.OBSERVATION?.parts).find(p => p && (p.areaName || p.targetPests?.length));
      if (heard) {
        if (heard.areaName) setAreaName(cur => cur.trim() || heard.areaName || '');
        if (heard.targetPests?.length && !area.zoneName) setPestList(heard.targetPests);
        setAiFilled(true);
      }
    }).catch(e => setError(e.message));
  }, [auditId, areaId, setPestList]);

  const f = findings[Math.min(active, findings.length - 1)];
  const setF = useCallback((patch: Partial<FindingForm>) => {
    setFindings(list => list.map((x, i) => (i === active ? { ...x, ...patch } : x)));
  }, [active]);

  // ---- saving ---------------------------------------------------------------

  /**
   * Saves the area. `forUpload`: a quick draft so photos / the recording can be attached before the
   * area name and "Fix within" are known (the area is saved as "New area" until then).
   */
  async function persist(markCompleted: boolean, forUpload = false): Promise<SaveAreaResult | null> {
    setError(null);
    setMissing([]);
    if (!forUpload) {
      if (!areaName.trim()) {
        setError('Enter the area name');
        setStep(STEP_DETAILS);
        return null;
      }
      const noOther = findings.findIndex(x => x.riskCategory === 'OTHER' && !x.categoryOther.trim());
      if (noOther >= 0) {
        setError('Type the risk category (Other)');
        setActive(noOther);
        setStep(STEP_DETAILS);
        return null;
      }
      const noDays = findings.findIndex(x => x.days === '');
      if (noDays >= 0) {
        setError('Choose "Fix within"');
        setActive(noDays);
        setStep(STEP_DETAILS);
        return null;
      }
    }
    const nameToSave = areaName.trim() || PLACEHOLDER_AREA;
    try {
      // Accept the English for every voice note (edited text included) before saving.
      const versions: Record<string, number> = {};
      if (!forUpload) {
        for (const x of findings) {
          for (const field of Object.keys(x.notes) as VoiceFieldType[]) {
            const n = x.notes[field];
            const value = x[TEXT_KEY[field]].trim();
            if (!n || !value) continue;
            const stillTranslating = ['UPLOADED', 'QUEUED', 'PROCESSING'].includes(n.status);
            const needs = stillTranslating || n.status === 'REVIEW_REQUIRED' || n.status === 'FAILED'
              || ((n.status === 'ACCEPTED' || n.status === 'MANUAL') && n.acceptedText !== value);
            if (!needs) continue;
            // Typed while Gemini was still busy, or after it failed = the supervisor's own text.
            const manual = stillTranslating || n.status === 'FAILED';
            const res = await auditsApi.acceptVoice(auditId, n.id, value, manual);
            versions[x.id] = res.finding.rowVersion;
            setFindings(list => list.map(y => (y.id === x.id ? { ...y, notes: { ...y.notes, [field]: res.voice } } : y)));
          }
        }
      }

      let version = rowVersion;
      if (version === undefined) {
        const added = await auditsApi.addAreas(auditId, [{ id, areaName: nameToSave, zoneName: zoneName || null }]);
        version = added.areas[0].rowVersion;
      }
      const res = await auditsApi.saveArea(auditId, id, {
        rowVersion: version,
        areaName: nameToSave,
        zoneName,
        // Also added to the audit's target pests (report cover).
        targetPests: [...pests, ...(otherPestOn && otherPest.trim() ? otherPest.split(',').map(x => x.trim()).filter(Boolean) : [])],
        markCompleted,
        findings: findings.map(x => ({
          id: x.id,
          rowVersion: x.isNew ? undefined : versions[x.id] ?? x.rowVersion,
          title: x.title,
          riskLevel: x.riskLevel,
          riskCategory: x.riskCategory === 'OTHER' && x.categoryOther.trim() ? x.categoryOther.trim() : x.riskCategory,
          riskTypeText: x.riskTypeText,
          actionWithinDays: x.days === '' ? undefined : Number(x.days),
          observationText: x.observation,
          customerActionText: x.customerAction,
          bestserveActionText: x.bestserveAction,
        })),
        removedFindingIds: removed,
      });
      setRowVersion(res.area.rowVersion);
      setAreaNumber(res.area.areaNumber);
      setRemoved([]);
      setFindings(list => list.map(x => {
        const s = res.findings.find(y => y.id === x.id);
        return s ? { ...x, isNew: false, rowVersion: s.rowVersion, findingNumber: s.findingNumber, dueDate: s.actionDueDate } : x;
      }));
      if (markCompleted && res.missing.length) setMissing(res.missing);
      return res;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        setError('Someone else saved this area while you were editing. Go back and open it again.');
      } else {
        setError(e instanceof Error ? e.message : 'Could not save the area');
      }
      return null;
    }
  }

  const uploading = findings.some(x => x.photos.some(p => p.state === 'uploading'));

  async function saveDraft() {
    if (uploading) return setError('Wait for the photos to finish uploading.');
    setSaving(true);
    // A draft may be saved before the name is known (kept as "New area").
    const res = await persist(false, !areaName.trim() || findings.some(x => x.days === ''));
    setSaving(false);
    if (res) navigation.goBack();
  }

  async function saveArea(addNext = false) {
    if (uploading) return setError('Wait for the photos to finish uploading.');
    setSaving(true);
    setSavingMode(addNext ? 'next' : 'finish');
    const res = await persist(true);
    setSaving(false);
    setSavingMode(null);
    if (!res) return;
    if (res.missing.length) {
      setStep(STEP_DETAILS);
      return;
    }
    const label = areaName;
    // "Save & New Area": a fresh form for the next area (the area list stays underneath).
    if (addNext) navigation.replace('AreaInspect', { auditId, savedArea: label });
    // "Save & Finish": back to the area list, with a short "saved" note.
    else navigation.navigate('AuditAreas', { auditId, savedArea: label });
  }

  // Photos and the recording need the area and finding on the server first.
  async function ensureSaved(): Promise<boolean> {
    if (rowVersion !== undefined && !findings.some(x => x.isNew) && !removed.length) return true;
    return (await persist(false, true)) !== null;
  }

  function next() {
    setError(null);
    if (step < LAST_STEP) setStep(step + 1);
    else saveArea();
  }

  function addFinding() {
    setFindings(list => [...list, blankFinding()]);
    setActive(findings.length);
    setAiFilled(false);
    setStep(STEP_PHOTOS);
  }

  function removeFinding() {
    if (findings.length < 2) return;
    const hasEvidence = f.photos.length > 0 || Object.values(f.notes).some(Boolean);
    if (hasEvidence) {
      setError('This finding has photos or voice notes and cannot be removed.');
      return;
    }
    setAskRemoveFinding(true);
  }

  function confirmRemoveFinding() {
    setAskRemoveFinding(false);
    if (!f.isNew) setRemoved(r => [...r, f.id]);
    setFindings(list => list.filter((_, i) => i !== active));
    setActive(0);
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: areaNumber ? `Area ${String(areaNumber).padStart(2, '0')}` : 'Area Inspection',
      // eslint-disable-next-line react/no-unstable-nested-components
      headerRight: () => (
        <Pressable onPress={saveDraft} disabled={saving} hitSlop={10}>
          <Text style={styles.headerAction}>Save Draft</Text>
        </Pressable>
      ),
    });
  });

  // ---- what the AI read from the recording ------------------------------------

  // Fills empty fields from the recording once (never overwrites what the supervisor typed),
  // then opens the review step.
  const appliedRef = useRef<Set<string>>(new Set());
  function applyRecording(n: VoiceNote) {
    const p = n.parts;
    if (!p || n.status !== 'REVIEW_REQUIRED' || appliedRef.current.has(n.id)) return;
    appliedRef.current.add(n.id);
    if (p.areaName) setAreaName(cur => cur.trim() || p.areaName || '');
    if (p.targetPests?.length && !zoneName) setPestList(p.targetPests);
    setFindings(list => list.map(x => {
      if (x.id !== n.findingId) return x;
      const nx = { ...x };
      if (!nx.title.trim() && p.title) nx.title = p.title;
      if (!nx.customerAction.trim() && p.customerAction) nx.customerAction = p.customerAction;
      if (!nx.bestserveAction.trim() && p.bestserveAction) nx.bestserveAction = p.bestserveAction;
      if (p.riskLevel && RISK_LEVELS.includes(p.riskLevel as RiskLevelCode)) nx.riskLevel = p.riskLevel as RiskLevelCode;
      if (p.riskCategory) {
        // A known category by its code or its name (e.g. "Water stagnation"); anything else goes to "Other" as typed text.
        const said = p.riskCategory.trim().toLowerCase();
        const byLabel = (lookups?.riskCategories || []).find(c => c.label.toLowerCase() === said)?.code;
        const code = byLabel || p.riskCategory.toUpperCase().replace(/\s+/g, '_');
        if (KNOWN_CATEGORIES.includes(code) && code !== 'OTHER') {
          nx.riskCategory = code;
          nx.categoryOther = '';
        } else {
          nx.riskCategory = 'OTHER';
          nx.categoryOther = p.riskCategory;
        }
      }
      if (nx.days === '' || nx.daysAuto) {
        if (p.fixWithinDays != null) Object.assign(nx, daysPatch(p.fixWithinDays), { daysAuto: false });
        else Object.assign(nx, daysForLevel(nx.riskLevel));
      }
      return nx;
    }));
    setAiFilled(true);
  }

  // A finding filled from a recording but still without "Fix within" (e.g. opened again later):
  // use the risk level's default once the levels are loaded.
  useEffect(() => {
    if (!lookups?.riskLevels?.length) return;
    setFindings(list => (list.some(x => x.days === '' && x.notes.OBSERVATION?.parts)
      ? list.map(x => (x.days === '' && x.notes.OBSERVATION?.parts ? { ...x, ...daysForLevel(x.riskLevel) } : x))
      : list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups, findings.length, findings.map(x => x.notes.OBSERVATION?.id || '').join()]);

  // ---- render ---------------------------------------------------------------

  const levels = lookups?.riskLevels || [];
  const categories = lookups?.riskCategories || [];
  const customerLabel = audit?.customerActionLabel || 'Customer / Site Action';
  // "Fix within" for a number of days, and the default for a risk level (Critical 1, High 7, Medium 30...).
  function daysPatch(n: number): Partial<FindingForm> {
    const d = String(n);
    return { days: d, daysOther: !DAY_CHIPS.includes(d) };
  }
  function daysForLevel(level: RiskLevelCode): Partial<FindingForm> {
    const def = levels.find(l => l.code === level)?.defaultDays;
    return { ...daysPatch(def == null ? FALLBACK_DAYS : def), daysAuto: true };
  }
  const dueDate = f.days !== '' && audit ? addDays(audit.auditDate, Number(f.days)) : null;

  const recordProps = {
    auditId,
    findingId: f.id,
    field: 'OBSERVATION' as VoiceFieldType,
    language,
    onLanguage: setLanguage,
    text: f.observation,
    onText: (t: string) => setFindings(list => list.map(x => (x.id === f.id ? { ...x, observation: t } : x))),
    note: f.notes.OBSERVATION || null,
    onNote: (n: VoiceNote | null) => {
      setFindings(list => list.map(x => (x.id === f.id ? { ...x, notes: { ...x.notes, OBSERVATION: n } } : x)));
      if (n) applyRecording(n);
    },
    // Accepting saves the text on the server and bumps the finding's version: keep ours in step,
    // then go straight to the review step.
    onAccepted: (rv: number) => {
      setFindings(list => list.map(x => (x.id === f.id ? { ...x, rowVersion: rv, isNew: false } : x)));
      setStep(STEP_DETAILS);
    },
    ensureSaved,
  };

  // The recording must be translated and accepted (or the observation typed) before the review step.
  const obsNote = f.notes.OBSERVATION;
  const obsNotAccepted = !!obsNote
    && !((obsNote.status === 'ACCEPTED' || obsNote.status === 'MANUAL') && obsNote.acceptedText === f.observation.trim());
  const obsEmpty = !obsNote && !f.observation.trim();
  // Photos: at least one uploaded before moving on (and none still uploading).
  const noPhoto = !f.photos.some(p => p.state === 'uploaded');
  const photoBusy = f.photos.some(p => p.state === 'uploading');
  const nextOff = (step === STEP_PHOTOS && (noPhoto || photoBusy)) || (step === STEP_RECORD && (obsNotAccepted || obsEmpty));
  const detailsMissing = [
    !areaName.trim() ? 'area name' : null,
    !f.observation.trim() ? 'observation' : null,
    !f.customerAction.trim() ? customerLabel.toLowerCase() : null,
    !f.bestserveAction.trim() ? 'BestServe action' : null,
    f.days === '' ? '"Fix within"' : null,
  ].filter(Boolean) as string[];
  const saveOff = step === LAST_STEP && !!detailsMissing.length;
  const stepHint = step === STEP_PHOTOS && photoBusy
    ? 'Wait for the photo to finish uploading'
    : step === STEP_PHOTOS && noPhoto
    ? 'Take or choose at least 1 photo to continue'
    : step === STEP_RECORD && obsEmpty
    ? 'Record (or type) the details to continue'
    : saveOff
    ? `Fill in the ${detailsMissing.join(', ')} to save`
    : null;

  // Finding numbers run across the whole audit: a new finding follows those saved in the other areas.
  const findingsBefore = (audit?.areas || []).filter(x => x.id !== id).reduce((n, x) => n + x.findings.length, 0);
  const findingLabel = (x: FindingForm | null, i: number) =>
    String(x?.findingNumber || findingsBefore + i + 1).padStart(2, '0');

  return (
    <View style={styles.screen}>
      <Stepper steps={STEPS} current={step} onPress={i => setStep(i)} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {savedNote ? <MessageBox tone="ok" title={`✓ ${savedNote} saved — now the next area`} /> : null}
        {/* Errors sit at the top, where the screen scrolls to, so they are always seen. */}
        {error ? <MessageBox tone="error" title={error} /> : null}
        {findings.length > 1 || step === STEP_DETAILS ? (
          <View style={styles.findingTabs}>
            {findings.map((x, i) => (
              <Pressable key={x.id} onPress={() => setActive(i)} style={[styles.fTab, i === active && styles.fTabOn]}>
                <Text style={[styles.fTabText, i === active && styles.fTabTextOn]}>
                  Finding {findingLabel(x, i)}
                </Text>
              </Pressable>
            ))}
            {step === STEP_DETAILS ? (
              <Pressable onPress={addFinding} style={styles.fTabAdd}><Text style={styles.fTabAddText}>+ Add</Text></Pressable>
            ) : null}
          </View>
        ) : null}

        {/* 1. Photos */}
        {step === STEP_PHOTOS ? (
          <View>
            <Text style={a.section}>Photos & Evidence</Text>
            <PhotoGrid
              auditId={auditId}
              findingId={f.id}
              photos={f.photos}
              ensureSaved={ensureSaved}
              onChange={update => setFindings(list => list.map(x => (x.id === f.id ? { ...x, photos: update(x.photos) } : x)))}
            />
          </View>
        ) : null}

        {/* 2. One recording */}
        {step === STEP_RECORD ? (
          <View>
            <View style={styles.allHint}>
              <Text style={styles.allHintTitle}>Say everything in one recording:</Text>
              <Text style={styles.allHintLine}>1. The area and the pest (cockroach, rodent…)</Text>
              <Text style={styles.allHintLine}>2. What you saw - the problem</Text>
              <Text style={styles.allHintLine}>3. What the customer should do</Text>
              <Text style={styles.allHintLine}>4. What BestServe will do</Text>
              <Text style={styles.allHintNote}>The app fills the details and suggests the risk. You check everything on the next step.</Text>
            </View>
            <VoiceField {...recordProps} combined label="Record everything once" placeholder="Describe what was observed in this area…" />
          </View>
        ) : null}

        {/* 3. Review & details */}
        {step === STEP_DETAILS ? (
          <View>
            {aiFilled ? <MessageBox tone="ok" title="Filled from your recording - check each field and change anything that is wrong." /> : null}
            <Text style={a.section}>Area Information</Text>
            <Input label="Area Name" required value={areaName} onChangeText={setAreaName} placeholder="e.g. Front yard" maxLength={200} />
            <ChipRow
              label="Target pest"
              options={[
                ...(lookups?.targetPests || PEST_CODES).map(p => ({ value: p, label: pests.includes(p) ? `${titleCase(p)} ✓` : titleCase(p) })),
                { value: '__OTHER__', label: otherPestOn ? 'Other ✓' : '＋ Other' },
              ]}
              selected={[...pests, ...(otherPestOn ? ['__OTHER__'] : [])]}
              onToggle={p => (p === '__OTHER__'
                ? setOtherPestOn(v => !v)
                : setPests(list => (list.includes(p) ? list.filter(x => x !== p) : [...list, p])))}
            />
            {otherPestOn ? (
              <Input label="Other pest" value={otherPest} onChangeText={setOtherPest} placeholder="e.g. Lizards" maxLength={100} />
            ) : null}

            <Text style={[a.section, styles.gapTop]}>Finding</Text>
            <Input label="What did you find? (Optional)" value={f.title} onChangeText={t => setF({ title: t })} placeholder="e.g. Renovation debris near the wall" maxLength={250} />
            <ChipRow
              label="Risk Category *"
              options={categories.map(c => ({ value: c.code, label: c.code === 'OTHER' ? (f.riskCategory === 'OTHER' ? 'Other ✓' : '＋ Other') : c.label }))}
              selected={[f.riskCategory]}
              onToggle={v => setF({ riskCategory: v })}
            />
            {f.riskCategory === 'OTHER' ? (
              <Input label="Other risk category" required value={f.categoryOther} onChangeText={t => setF({ categoryOther: t })} placeholder="e.g. Drain blockage" maxLength={50} />
            ) : null}
            <Text style={styles.fieldLabel}>Risk Level <Text style={styles.req}>*</Text></Text>
            <RiskSegment
              levels={levels}
              value={f.riskLevel}
              onChange={v => setF(f.days === '' || f.daysAuto ? { riskLevel: v, ...daysForLevel(v) } : { riskLevel: v })}
            />
            <ChipRow
              label="Fix within *"
              options={[...DAY_CHIPS, DAYS_OTHER].map(d => ({ value: d, label: dayLabel(d) }))}
              selected={f.daysOther ? [DAYS_OTHER] : f.days !== '' ? [f.days] : []}
              onToggle={d => setF(d === DAYS_OTHER ? { daysOther: true, days: '', daysAuto: false } : { daysOther: false, days: d, daysAuto: false })}
            />
            {f.daysOther ? (
              <Input
                label="Number of days"
                required
                value={f.days}
                onChangeText={t => setF({ days: t.replace(/\D/g, '').slice(0, 3), daysAuto: false })}
                placeholder="e.g. 45"
                keyboardType="number-pad"
                maxLength={3}
              />
            ) : null}
            <Text style={[a.muted, styles.below]}>
              {dueDate ? `Due ${fmtDate(dueDate)}${f.daysAuto ? ' · set from the risk level, change if needed' : ''}` : 'Choose when this must be fixed'}
            </Text>

            <Text style={[a.section, styles.gapTop]}>Observation & Actions</Text>
            <Input label="Observation" required value={f.observation} onChangeText={t => setF({ observation: t })} placeholder="What was observed" multiline maxLength={4000} />
            <Input label={customerLabel} required value={f.customerAction} onChangeText={t => setF({ customerAction: t })} placeholder="What the customer should do" multiline maxLength={2000} />
            <Input label="BestServe Action" required value={f.bestserveAction} onChangeText={t => setF({ bestserveAction: t })} placeholder="What BestServe will do" multiline maxLength={2000} />
            <View style={styles.redoRow}>
              <GreenButton label="Photos" variant="link" onPress={() => setStep(STEP_PHOTOS)} />
              <GreenButton label="Record again" variant="link" onPress={() => setStep(STEP_RECORD)} />
            </View>

            {findings.length > 1 ? (
              <GreenButton label="Remove this finding" variant="link" onPress={removeFinding} />
            ) : null}
          </View>
        ) : null}

        {missing.length ? (
          <MessageBox tone="warn" title="Saved as draft. To complete this area, fill in:" lines={missing.map(describeMissing)} />
        ) : null}
      </ScrollView>

      <BottomBar>
        {stepHint ? <Text style={styles.stepHint}>{stepHint}</Text> : null}
        {step === LAST_STEP ? (
          // Last step: finish here, or save and go straight on to the next area.
          <View style={styles.footer}>
            <GreenButton
              label="Save & Finish"
              variant="outline"
              onPress={() => saveArea(false)}
              loading={savingMode === 'finish'}
              disabled={saving || saveOff}
              style={styles.footerFinish}
            />
            <GreenButton
              label="Save & New Area →"
              onPress={() => saveArea(true)}
              loading={savingMode === 'next'}
              disabled={saving || saveOff}
              style={styles.footerNext}
            />
          </View>
        ) : (
          <GreenButton
            label={step === STEP_PHOTOS
              ? 'Next: Recording'
              : obsNotAccepted ? 'Accept the translation to continue' : 'Next: Review & details'}
            onPress={next}
            disabled={saving || nextOff}
          />
        )}
      </BottomBar>

      <ConfirmDialog
        visible={askRemoveFinding}
        icon={<CloseIcon size={28} color={ag.red} />}
        title="Remove this finding?"
        message={`"${f.title || 'Untitled finding'}" will be removed from this area when you save.`}
        confirmLabel="Remove"
        onConfirm={confirmRemoveFinding}
        onCancel={() => setAskRemoveFinding(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  allHint: { backgroundColor: ag.greenSofter, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md },
  allHintTitle: { fontWeight: '700', color: ag.greenDark, marginBottom: 4 },
  allHintLine: { color: colors.textPrimary, lineHeight: 21 },
  allHintNote: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  redoRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  footer: { flexDirection: 'row', gap: spacing.sm },
  stepHint: { fontSize: 13, color: ag.amberText, textAlign: 'center', marginBottom: spacing.xs, fontWeight: '600' },
  footerFinish: { flex: 1 },
  footerNext: { flex: 1.5 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  headerAction: { color: ag.green, fontWeight: '700', fontSize: 15 },
  gapTop: { marginTop: spacing.sm },
  below: { marginTop: -spacing.sm, marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  req: { color: ag.red },
  findingTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  fTab: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fTabOn: { backgroundColor: ag.green, borderColor: ag.green },
  fTabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  fTabTextOn: { color: colors.textOnPrimary },
  fTabAdd: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: ag.green },
  dim: { opacity: 0.5 },
  fTabAddText: { fontSize: 13, fontWeight: '700', color: ag.green },
});

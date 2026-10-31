import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, PanResponder, Pressable, StyleSheet, Text, TextInput, View,
  type GestureResponderEvent, type LayoutChangeEvent,
} from 'react-native';
import Svg, { Ellipse, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { API_BASE_URL } from '../config/env';
import { auditsApi, type PhotoMark, type UploadedPhoto } from './api';

/**
 * "Mark the photo": full-screen drawing on an uploaded photo (circle, arrow, pen, text label).
 * Points are kept as 0-1 fractions of the photo, so the server draws the same marks on the
 * full-size original. The original photo is never changed; Clear + Save goes back to it.
 */

type Tool = PhotoMark['t'];
const COLORS = ['#EF4444', '#FACC15', '#22C55E', '#FFFFFF', '#0284C7'];
const TOOLS: { t: Tool; icon: string; label: string }[] = [
  { t: 'circle', icon: '◯', label: 'Circle' },
  { t: 'arrow', icon: '➚', label: 'Arrow' },
  { t: 'pen', icon: '✎', label: 'Pen' },
  { t: 'text', icon: 'T', label: 'Text' },
];
const LABELS = ['Entry point', 'Droppings', 'Gap', 'Burrow', 'Damage', 'Gnaw marks', 'Nest'];
const MAX_MARKS = 60;
const MAX_PEN_POINTS = 600;

const BG = '#0B1220';
const PANEL = '#1E293B';
const BLUE = '#0284C7';

export function MarkPhotoModal({
  visible, auditId, photo, auth, onClose, onSaved,
}: {
  visible: boolean;
  auditId: string;
  photo: { id: string; url: string; v?: string | null } | null;
  auth: string | null;
  onClose: () => void;
  onSaved: (photo: UploadedPhoto) => void;
}) {
  const [marks, setMarks] = useState<PhotoMark[]>([]);
  const [draft, setDraft] = useState<PhotoMark | null>(null);
  const [tool, setTool] = useState<Tool>('circle');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textAt, setTextAt] = useState<[number, number] | null>(null);
  const [label, setLabel] = useState('');

  // The upright, screen-sized original (without earlier marks: they are drawn again on top here).
  const src = photo && auth
    ? { uri: `${API_BASE_URL}${photo.url}?original=1&size=view&v=${photo.v || 0}`, headers: { Authorization: auth } }
    : null;

  useEffect(() => {
    if (!visible || !photo || !src) return undefined;
    let alive = true;
    setLoading(true);
    setError(null);
    setMarks([]);
    setDraft(null);
    setSize(null);
    Image.getSizeWithHeaders(
      src.uri,
      src.headers,
      (w, h) => alive && setSize({ w, h }),
      () => alive && setError('Could not load the photo. Check your connection.'),
    );
    auditsApi.getPhotoMarks(auditId, photo.id)
      .then(r => alive && setMarks(r.marks || []))
      .catch(() => alive && setError('Could not load the earlier marks.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, photo?.id, auth]);

  // The photo fitted inside the space between the top bar and the tools.
  const box = useMemo(() => {
    if (!size || !area) return null;
    const k = Math.min(area.w / size.w, area.h / size.h);
    return { w: Math.round(size.w * k), h: Math.round(size.h * k) };
  }, [size, area]);

  // PanResponder keeps its first handlers: read the latest values through refs.
  const live = useRef({ tool, color, box, draft, marks });
  live.current = { tool, color, box, draft, marks };

  const pt = (e: GestureResponderEvent): [number, number] => {
    const b = live.current.box;
    if (!b) return [0, 0];
    const x = Math.min(1, Math.max(0, e.nativeEvent.locationX / b.w));
    const y = Math.min(1, Math.max(0, e.nativeEvent.locationY / b.h));
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  };

  const responder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const { tool: t, color: c, marks: m } = live.current;
        if (m.length >= MAX_MARKS) return;
        const p = pt(e);
        if (t === 'text') setDraft({ t, c, p: [p] });
        else setDraft({ t, c, p: t === 'pen' ? [p] : [p, p] });
      },
      onPanResponderMove: e => {
        const d = live.current.draft;
        if (!d || d.t === 'text') return;
        const p = pt(e);
        if (d.t === 'pen') {
          const last = d.p[d.p.length - 1];
          // Skip tiny moves: keeps lines smooth and the point count small.
          if (d.p.length < MAX_PEN_POINTS && Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.006) setDraft({ ...d, p: [...d.p, p] });
        } else {
          setDraft({ ...d, p: [d.p[0], p] });
        }
      },
      onPanResponderRelease: () => {
        const d = live.current.draft;
        setDraft(null);
        if (!d) return;
        if (d.t === 'text') {
          setLabel('');
          setTextAt(d.p[0]);
          return;
        }
        const [a, b] = [d.p[0], d.p[d.p.length - 1]];
        const big = Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.02;
        if (d.t === 'pen' ? d.p.length > 1 : big) setMarks(m => [...m, d]);
      },
      onPanResponderTerminate: () => setDraft(null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function addLabel(textValue: string) {
    const s = textValue.trim().slice(0, 40);
    if (s && textAt) setMarks(m => [...m, { t: 'text', c: color, p: [textAt], s }]);
    setTextAt(null);
  }

  async function save() {
    if (!photo) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await auditsApi.savePhotoMarks(auditId, photo.id, marks));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the marks');
    } finally {
      setSaving(false);
    }
  }

  const onArea = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ w: width, h: height });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.top}>
          <Pressable onPress={onClose} hitSlop={10} disabled={saving}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Mark the photo</Text>
          <Pressable onPress={save} disabled={saving || loading || !box} style={[styles.save, (loading || !box) && styles.off]} hitSlop={6}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
          </Pressable>
        </View>

        <View style={styles.area} onLayout={onArea}>
          {src && box ? (
            <View style={{ width: box.w, height: box.h }} {...responder.panHandlers}>
              <Image source={src} style={{ width: box.w, height: box.h }} />
              <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill} pointerEvents="none">
                {[...marks, ...(draft && draft.t !== 'text' ? [draft] : [])].map((m, i) => (
                  <MarkShape key={i} mark={m} w={box.w} h={box.h} />
                ))}
              </Svg>
            </View>
          ) : (
            <ActivityIndicator color="#fff" />
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.colors}>
          {COLORS.map(c => (
            <Pressable key={c} onPress={() => setColor(c)} style={[styles.color, { backgroundColor: c }, color === c && styles.colorOn]} accessibilityLabel={`Colour ${c}`} />
          ))}
        </View>
        <View style={styles.tools}>
          {TOOLS.map(x => (
            <Pressable key={x.t} onPress={() => setTool(x.t)} style={styles.tool} accessibilityRole="button">
              <View style={[styles.toolIcon, tool === x.t && styles.toolIconOn]}><Text style={styles.toolGlyph}>{x.icon}</Text></View>
              <Text style={[styles.toolLabel, tool === x.t && styles.toolLabelOn]}>{x.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setMarks(m => m.slice(0, -1))} disabled={!marks.length} style={[styles.tool, !marks.length && styles.off]}>
            <View style={styles.toolIcon}><Text style={styles.toolGlyph}>↶</Text></View>
            <Text style={styles.toolLabel}>Undo</Text>
          </Pressable>
          <Pressable onPress={() => setMarks([])} disabled={!marks.length} style={[styles.tool, !marks.length && styles.off]}>
            <View style={styles.toolIcon}><Text style={styles.toolGlyph}>⌫</Text></View>
            <Text style={styles.toolLabel}>Clear</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {tool === 'text' ? 'Tap where the label should go' : tool === 'pen' ? 'Draw with your finger' : `Drag on the photo to draw ${tool === 'circle' ? 'a circle' : 'an arrow'}`}
          {' · Clear + Save = original photo'}
        </Text>
      </View>

      {/* Label for the Text tool */}
      <Modal visible={!!textAt} transparent animationType="fade" onRequestClose={() => setTextAt(null)}>
        <View style={styles.dim}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Add a label</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Entry point"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              maxLength={40}
              autoFocus
              onSubmitEditing={() => addLabel(label)}
            />
            <View style={styles.chips}>
              {LABELS.map(l => (
                <Pressable key={l} onPress={() => addLabel(l)} style={styles.chip}><Text style={styles.chipText}>{l}</Text></Pressable>
              ))}
            </View>
            <View style={styles.dialogBtns}>
              <Pressable onPress={() => setTextAt(null)} style={styles.dlgBtn}><Text style={styles.dlgCancel}>Cancel</Text></Pressable>
              <Pressable onPress={() => addLabel(label)} disabled={!label.trim()} style={[styles.dlgBtn, styles.dlgOk, !label.trim() && styles.off]}>
                <Text style={styles.dlgOkText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

/** One mark, sized from the photo's shorter side (the server uses the same formula). */
function MarkShape({ mark: m, w, h }: { mark: PhotoMark; w: number; h: number }) {
  const base = Math.min(w, h);
  const stroke = Math.max(2, base * 0.012);
  const font = Math.max(10, base * 0.05);
  const P = ([x, y]: [number, number]) => [x * w, y * h];
  const line = { fill: 'none', stroke: m.c, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (m.t === 'circle') {
    const [a, b] = m.p.map(P);
    return (
      <Ellipse cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.max(stroke, Math.abs(b[0] - a[0]) / 2)} ry={Math.max(stroke, Math.abs(b[1] - a[1]) / 2)} {...line} />
    );
  }
  if (m.t === 'arrow') {
    const [a, b] = m.p.map(P);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const head = Math.max(stroke * 4, base * 0.04);
    const wing = (d: number) => [b[0] - head * Math.cos(ang + d), b[1] - head * Math.sin(ang + d)];
    const [l, r] = [wing(0.5), wing(-0.5)];
    return <Path d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]} M${l[0]} ${l[1]} L${b[0]} ${b[1]} L${r[0]} ${r[1]}`} {...line} />;
  }
  if (m.t === 'pen') {
    return <Polyline points={m.p.map(P).map(q => q.join(',')).join(' ')} {...line} />;
  }
  // Text label: coloured box, white (or dark on light colours) letters.
  const [x, y] = P(m.p[0]);
  const pad = font * 0.4;
  const boxH = font * 1.5;
  const textW = (m.s || '').length * font * 0.58;
  const top = Math.min(Math.max(0, y - boxH / 2), h - boxH);
  const left = Math.min(Math.max(0, x), Math.max(0, w - textW - pad * 2));
  const ink = m.c === '#FFFFFF' || m.c === '#FACC15' ? '#111827' : '#FFFFFF';
  return (
    <>
      <Rect x={left} y={top} width={textW + pad * 2} height={boxH} rx={font * 0.3} fill={m.c} />
      <SvgText x={left + pad} y={top + boxH / 2 + font * 0.36} fill={ink} fontSize={font} fontWeight="700">{m.s}</SvgText>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingTop: 36, paddingBottom: 18 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
  cancel: { color: '#CBD5E1', fontSize: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  save: { backgroundColor: BLUE, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, minWidth: 74, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  off: { opacity: 0.4 },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#FCA5A5', textAlign: 'center', paddingHorizontal: 18, marginTop: 8 },
  colors: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 14, paddingBottom: 8 },
  color: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: 'transparent' },
  colorOn: { borderColor: '#fff', transform: [{ scale: 1.15 }] },
  tools: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingTop: 6 },
  tool: { alignItems: 'center', width: 58 },
  toolIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: PANEL, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  toolIconOn: { backgroundColor: BLUE },
  toolGlyph: { color: '#fff', fontSize: 20, fontWeight: '700' },
  toolLabel: { color: '#CBD5E1', fontSize: 12 },
  toolLabelOn: { color: '#7DD3FC', fontWeight: '700' },
  hint: { color: '#94A3B8', fontSize: 12.5, textAlign: 'center', marginTop: 10, paddingHorizontal: 16 },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#fff', borderRadius: 18, padding: 18 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#0F172A' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: '#7DD3FC', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F0F9FF' },
  chipText: { color: '#075985', fontWeight: '600', fontSize: 13 },
  dialogBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  dlgBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  dlgCancel: { color: '#475569', fontWeight: '600', fontSize: 15 },
  dlgOk: { backgroundColor: BLUE },
  dlgOkText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

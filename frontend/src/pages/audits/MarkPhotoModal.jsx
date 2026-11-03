import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api";
import { auditsApi } from "./auditsApi";
import { Modal } from "./shared";

/**
 * "Mark the photo" on the web, the same tool as the mobile app: circle, arrow, pen and text label.
 * Points are 0-1 fractions of the photo; the server draws the marks on a copy of the full-size
 * original (used in the app and the PDF). Clear + Save goes back to the original photo.
 */

const COLORS = ["#EF4444", "#FACC15", "#22C55E", "#FFFFFF", "#0284C7"];
const TOOLS = [
  { t: "circle", icon: "◯", label: "Circle" },
  { t: "arrow", icon: "➚", label: "Arrow" },
  { t: "pen", icon: "✎", label: "Pen" },
  { t: "text", icon: "T", label: "Text" },
];
const LABELS = ["Entry point", "Droppings", "Gap", "Burrow", "Damage", "Gnaw marks", "Nest"];
const MAX_MARKS = 60;
const MAX_PEN_POINTS = 600;
const MAX_W = 860;

export default function MarkPhotoModal({ audit, photo, onClose, onSaved }) {
  const [src, setSrc] = useState(null);
  const [size, setSize] = useState(null); // shown size in px
  const [marks, setMarks] = useState([]);
  const [draft, setDraft] = useState(null);
  const [tool, setTool] = useState("circle");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [textAt, setTextAt] = useState(null);
  const [label, setLabel] = useState("");
  const boxRef = useRef(null);

  // The upright, screen-sized original (earlier marks are drawn again on top here) + saved marks.
  useEffect(() => {
    let url = null;
    let alive = true;
    apiFetch(`${photo.url}?original=1&size=view&v=${photo.v || 0}`).then(async (res) => {
      if (!alive) return;
      if (!res?.ok) { setError("Could not load the photo."); return; }
      url = URL.createObjectURL(await res.blob());
      setSrc(url);
    }).catch(() => setError("Could not load the photo."));
    auditsApi.getPhotoMarks(audit.id, photo.id)
      .then((r) => alive && setMarks(r.marks || []))
      .catch(() => alive && setError("Could not load the earlier marks."));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [audit.id, photo.id, photo.url, photo.v]);

  function onImgLoad(e) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    const maxH = Math.round(window.innerHeight * 0.58);
    const k = Math.min(MAX_W / w, maxH / h, 1.5);
    setSize({ w: Math.round(w * k), h: Math.round(h * k) });
  }

  const pt = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  };

  function down(e) {
    if (marks.length >= MAX_MARKS) return setError(`Up to ${MAX_MARKS} marks per photo.`);
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pt(e);
    if (tool === "text") return setDraft({ t: "text", c: color, p: [p] });
    setDraft({ t: tool, c: color, p: tool === "pen" ? [p] : [p, p] });
  }
  function move(e) {
    if (!draft || draft.t === "text") return;
    const p = pt(e);
    if (draft.t === "pen") {
      const last = draft.p[draft.p.length - 1];
      if (draft.p.length < MAX_PEN_POINTS && Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) setDraft({ ...draft, p: [...draft.p, p] });
    } else {
      setDraft({ ...draft, p: [draft.p[0], p] });
    }
  }
  function up() {
    const d = draft;
    setDraft(null);
    if (!d) return;
    if (d.t === "text") {
      setLabel("");
      setTextAt(d.p[0]);
      return;
    }
    const [a, b] = [d.p[0], d.p[d.p.length - 1]];
    const big = Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.02;
    if (d.t === "pen" ? d.p.length > 1 : big) setMarks((m) => [...m, d]);
  }

  function addLabel(value) {
    const s = value.trim().slice(0, 40);
    if (s && textAt) setMarks((m) => [...m, { t: "text", c: color, p: [textAt], s }]);
    setTextAt(null);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      onSaved(await auditsApi.savePhotoMarks(audit.id, photo.id, marks));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const hint = tool === "text" ? "Click where the label should go" : tool === "pen" ? "Draw with the mouse" : `Drag on the photo to draw ${tool === "circle" ? "a circle" : "an arrow"}`;

  return (
    <Modal
      wide
      title="Mark the photo"
      onClose={saving ? undefined : onClose}
      footer={(
        <>
          <span className="au-muted au-mark-hint">{hint} · Clear + Save = original photo</span>
          <button type="button" className="au-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="au-btn au-btn-primary" onClick={save} disabled={saving || !size}>{saving ? "Saving…" : "Save"}</button>
        </>
      )}
    >
      <div className="au-mark">
        <div className="au-mark-tools">
          {TOOLS.map((x) => (
            <button key={x.t} type="button" className={`au-mark-tool ${tool === x.t ? "active" : ""}`} onClick={() => setTool(x.t)}>
              <span>{x.icon}</span>{x.label}
            </button>
          ))}
          <button type="button" className="au-mark-tool" onClick={() => setMarks((m) => m.slice(0, -1))} disabled={!marks.length}><span>↶</span>Undo</button>
          <button type="button" className="au-mark-tool" onClick={() => setMarks([])} disabled={!marks.length}><span>⌫</span>Clear</button>
          <span className="au-mark-colors">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} className={`au-mark-color ${color === c ? "active" : ""}`}
                style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </span>
        </div>

        <div className="au-mark-stage">
          {src ? (
            <div ref={boxRef} className="au-mark-box" style={size ? { width: size.w, height: size.h } : undefined}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDraft(null)}>
              <img src={src} alt="" onLoad={onImgLoad} draggable={false} style={size ? { width: size.w, height: size.h } : { maxWidth: MAX_W }} />
              {size && (
                <svg width={size.w} height={size.h} className="au-mark-svg">
                  {[...marks, ...(draft && draft.t !== "text" ? [draft] : [])].map((m, i) => (
                    <MarkShape key={i} mark={m} w={size.w} h={size.h} />
                  ))}
                </svg>
              )}
            </div>
          ) : (
            !error && <div className="au-muted">Loading the photo…</div>
          )}
        </div>
        {error && <div className="au-error">{error}</div>}

        {textAt && (
          <div className="au-mark-label">
            <div className="au-strong">Add a label</div>
            <input className="au-input" autoFocus maxLength={40} value={label} placeholder="e.g. Entry point"
              onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLabel(label)} />
            <div className="au-photos">
              {LABELS.map((l) => <button key={l} type="button" className="au-file-chip" onClick={() => addLabel(l)}>{l}</button>)}
            </div>
            <div className="au-row-actions">
              <button type="button" className="au-btn au-btn-small" onClick={() => setTextAt(null)}>Cancel</button>
              <button type="button" className="au-btn au-btn-small au-btn-primary" disabled={!label.trim()} onClick={() => addLabel(label)}>Add</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** One mark, sized from the photo's shorter side (the server and the app use the same formula). */
function MarkShape({ mark: m, w, h }) {
  const base = Math.min(w, h);
  const stroke = Math.max(2, base * 0.012);
  const font = Math.max(10, base * 0.05);
  const P = ([x, y]) => [x * w, y * h];
  const line = { fill: "none", stroke: m.c, strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
  if (m.t === "circle") {
    const [a, b] = m.p.map(P);
    return <ellipse cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.max(stroke, Math.abs(b[0] - a[0]) / 2)} ry={Math.max(stroke, Math.abs(b[1] - a[1]) / 2)} {...line} />;
  }
  if (m.t === "arrow") {
    const [a, b] = m.p.map(P);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const head = Math.max(stroke * 4, base * 0.04);
    const wing = (d) => [b[0] - head * Math.cos(ang + d), b[1] - head * Math.sin(ang + d)];
    const [l, r] = [wing(0.5), wing(-0.5)];
    return <path d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]} M${l[0]} ${l[1]} L${b[0]} ${b[1]} L${r[0]} ${r[1]}`} {...line} />;
  }
  if (m.t === "pen") return <polyline points={m.p.map(P).map((q) => q.join(",")).join(" ")} {...line} />;
  const [x, y] = P(m.p[0]);
  const pad = font * 0.4;
  const boxH = font * 1.5;
  const textW = (m.s || "").length * font * 0.58;
  const top = Math.min(Math.max(0, y - boxH / 2), h - boxH);
  const left = Math.min(Math.max(0, x), Math.max(0, w - textW - pad * 2));
  const ink = m.c === "#FFFFFF" || m.c === "#FACC15" ? "#111827" : "#FFFFFF";
  return (
    <g>
      <rect x={left} y={top} width={textW + pad * 2} height={boxH} rx={font * 0.3} fill={m.c} />
      <text x={left + pad} y={top + boxH / 2 + font * 0.36} fill={ink} fontSize={font} fontWeight="700" fontFamily="Arial, sans-serif">{m.s}</text>
    </g>
  );
}

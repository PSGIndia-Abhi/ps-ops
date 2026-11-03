// Photo marking: circles, arrows, pen lines and text labels drawn by the supervisor on a photo.
// Marks are stored as a small JSON file next to the original photo in MinIO; the marked copy is a
// new JPEG ("<original>.marked-<time>.jpg") that becomes the photo's object_key, so the app, the
// web and the PDF all show it. The original photo is never changed.
const path = require("path");
const sharp = require("sharp");
// fontkit comes with pdfkit (the report uses the same font); used here to draw label text as
// shapes, because the server image has no system fonts for SVG text.
const fontkit = require("fontkit");
const { HttpError } = require("./audits");

const FONT = fontkit.openSync(path.join(__dirname, "../../assets/fonts/PlusJakartaSans-Bold.ttf"));

const MARK_TYPES = ["circle", "arrow", "pen", "text"];
const MARK_COLORS = ["#EF4444", "#FACC15", "#22C55E", "#FFFFFF", "#0284C7"];
const MAX_MARKS = 60;
const MAX_PEN_POINTS = 600;
const MARKED_RE = /\.marked-(\d+)\.jpg$/;

const isMarked = (key) => MARKED_RE.test(key || "");
const markVersion = (key) => (MARKED_RE.exec(key || "") || [])[1] || null;
const originalKey = (key) => String(key || "").replace(MARKED_RE, "");
const marksKey = (key) => `${originalKey(key)}.marks.json`;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Checks the marks sent by the app. Points are fractions (0-1) of the photo's width and height. */
function parseMarks(raw) {
  if (!Array.isArray(raw)) throw new HttpError(400, "VALIDATION", "marks must be a list");
  if (raw.length > MAX_MARKS) throw new HttpError(400, "VALIDATION", `Up to ${MAX_MARKS} marks per photo`);
  return raw.map((m, i) => {
    const where = `marks[${i}]`;
    if (!m || !MARK_TYPES.includes(m.t)) throw new HttpError(400, "VALIDATION", `${where}: unknown mark type`);
    if (!MARK_COLORS.includes(m.c)) throw new HttpError(400, "VALIDATION", `${where}: unknown colour`);
    const need = m.t === "pen" ? [2, MAX_PEN_POINTS] : m.t === "text" ? [1, 1] : [2, 2];
    if (!Array.isArray(m.p) || m.p.length < need[0] || m.p.length > need[1]) {
      throw new HttpError(400, "VALIDATION", `${where}: wrong number of points`);
    }
    const p = m.p.map((pt) => {
      if (!Array.isArray(pt) || pt.length !== 2 || !pt.every((n) => typeof n === "number" && Number.isFinite(n))) {
        throw new HttpError(400, "VALIDATION", `${where}: bad point`);
      }
      return [clamp01(pt[0]), clamp01(pt[1])].map((n) => Math.round(n * 10000) / 10000);
    });
    const out = { t: m.t, c: m.c, p };
    if (m.t === "text") {
      const s = typeof m.s === "string" ? m.s.trim().slice(0, 40) : "";
      if (!s) throw new HttpError(400, "VALIDATION", `${where}: the label is empty`);
      out.s = s;
    }
    return out;
  });
}

// Sizes follow the photo's shorter side, the same formula the app uses on screen.
const sizes = (w, h) => {
  const base = Math.min(w, h);
  return { stroke: Math.max(3, Math.round(base * 0.012)), font: Math.max(14, Math.round(base * 0.05)) };
};

const esc = (s) => String(s).replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch]));

/** Label text as SVG path data (white letters), plus its width. */
function textShape(str, x, baseline, size) {
  const scale = size / FONT.unitsPerEm;
  const run = FONT.layout(str);
  let pen = 0;
  let d = "";
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    d += g.path.scale(scale, -scale).translate(x + pen + pos.xOffset * scale, baseline - pos.yOffset * scale).toSVG();
    pen += pos.xAdvance * scale;
  });
  return { d, width: pen };
}

function marksSvg(marks, w, h) {
  const { stroke, font } = sizes(w, h);
  const P = ([x, y]) => [x * w, y * h];
  const parts = [];
  for (const m of marks) {
    const line = `fill="none" stroke="${m.c}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`;
    if (m.t === "circle") {
      const [a, b] = m.p.map(P);
      const rx = Math.max(stroke, Math.abs(b[0] - a[0]) / 2);
      const ry = Math.max(stroke, Math.abs(b[1] - a[1]) / 2);
      parts.push(`<ellipse cx="${(a[0] + b[0]) / 2}" cy="${(a[1] + b[1]) / 2}" rx="${rx}" ry="${ry}" ${line}/>`);
    } else if (m.t === "arrow") {
      const [a, b] = m.p.map(P);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const head = Math.max(stroke * 4, Math.min(w, h) * 0.04);
      const wing = (d) => [b[0] - head * Math.cos(ang + d), b[1] - head * Math.sin(ang + d)];
      const [l, r] = [wing(0.5), wing(-0.5)];
      parts.push(`<path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]} M${l[0]} ${l[1]} L${b[0]} ${b[1]} L${r[0]} ${r[1]}" ${line}/>`);
    } else if (m.t === "pen") {
      parts.push(`<polyline points="${m.p.map(P).map((q) => q.join(",")).join(" ")}" ${line}/>`);
    } else if (m.t === "text") {
      const [x, y] = P(m.p[0]);
      const pad = font * 0.4;
      const boxH = font * 1.5;
      const top = Math.min(Math.max(0, y - boxH / 2), h - boxH);
      const t = textShape(m.s, 0, 0, font);
      const left = Math.min(Math.max(0, x), Math.max(0, w - t.width - pad * 2));
      const shape = textShape(m.s, left + pad, top + boxH / 2 + font * 0.36, font);
      const ink = m.c === "#FFFFFF" || m.c === "#FACC15" ? "#111827" : "#FFFFFF";
      parts.push(`<rect x="${left}" y="${top}" width="${t.width + pad * 2}" height="${boxH}" rx="${font * 0.3}" fill="${m.c}"/>`);
      parts.push(`<path d="${shape.d}" fill="${ink}"><title>${esc(m.s)}</title></path>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
}

/** The original photo (turned the right way up) with the marks drawn on it, as a JPEG. */
async function renderMarked(originalBuffer, marks) {
  const upright = await sharp(originalBuffer).rotate().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = upright.info;
  return sharp(upright.data)
    .composite([{ input: Buffer.from(marksSvg(marks, w, h)), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

module.exports = { MARK_COLORS, parseMarks, renderMarked, isMarked, markVersion, originalKey, marksKey };

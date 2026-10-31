const path = require("path");
const PDFDocument = require("pdfkit");

// ---------------------------------------------------------------------------
// Site Audit report in the BestServe "Option B" layout (16:9 landscape), drawn
// with pdfkit from the snapshot made by services/AuditReport.service.js.
// Pages, in order:
//   cover (blurred site photo, dark green tint)
//   audit summary + findings register ("Risks found in each area")
//   one page per finding (2 photos, or 1 photo + zone panel; 3 text columns)
//   action timeline (within 7 days · within 30 days · ongoing)
//   thank you + report sign-off
// `images` holds JPEG buffers by photo id, "<id>#blur" soft copies, and "#cover".
// ---------------------------------------------------------------------------

const W = 960;
const H = 540;
const M = 64; // page margin

const FONT_DIR = path.join(__dirname, "../../assets/fonts");
const FONTS = {
  R: "PlusJakartaSans-Regular.ttf",
  SB: "PlusJakartaSans-SemiBold.ttf",
  B: "PlusJakartaSans-Bold.ttf",
  XB: "PlusJakartaSans-ExtraBold.ttf",
};
const LOGO = path.join(__dirname, "../../assets/quotation-logo.png");

const C = {
  forest: "#13362B",
  forestText: "#C9D8CE",
  lime: "#BCDB4A",
  green: "#2E7D4F",
  cream: "#F5F5F0",
  card: "#FCFCF9",
  cardBorder: "#E2E2DC",
  head: "#E3EADF",
  line: "#C9CCC7",
  ink: "#15241E",
  body: "#4B5563",
  muted: "#6B7280",
  amber: "#D99A2B",
  offwhite: "#F5F5EE",
  white: "#FFFFFF",
  photoEmpty: "#D9DDD6",
  draft: "#B91C1C",
};

const RISK = {
  CRITICAL: { fill: "#8B1A1A", text: "#FFFFFF", tone: "#8B1A1A" },
  HIGH: { fill: "#C2410C", text: "#FFFFFF", tone: "#C2410C" },
  MEDIUM: { fill: "#F2C14E", text: "#15241E", tone: "#9A6B12" },
  LOW: { fill: "#BCDB4A", text: "#15241E", tone: "#4D7C0F" },
};
const LEVEL_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const COMPANY = {
  name: "Bestserve Pest Management Pvt. Ltd.",
  short: "Bestserve Pest Management",
  phone: "+91 88844 42612",
  email: "info@bestserve.in",
  web: "www.bestserve.in",
  office: "#372/2, Hogebandi Garden, DLF New Town, Begur, Bengaluru 560068",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
const pad2 = (n) => String(n).padStart(2, "0");

/** "05–08" / "01, 03, 05–06" from finding numbers. */
function numberRanges(nums) {
  const list = [...new Set(nums)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    out.push(j > i ? `${pad2(list[i])}–${pad2(list[j])}` : pad2(list[i]));
    i = j;
  }
  return out.join(", ");
}

/** Draws the report. Returns { buffer, pageCount }. */
function renderAuditReportPdf(snap, images = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [W, H],
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Pest Risk Audit Report ${snap.audit.number} - ${snap.company.name || ""}`,
        Author: COMPANY.name,
        Subject: "Pest Risk Audit Report",
      },
    });
    const chunks = [];
    let pageCount = 0;
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), pageCount }));
    try {
      for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));
      const pages = draw(doc, snap, images);
      pageCount = pages.length;
      drawFooters(doc, snap, pages);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ---- shared helpers ----------------------------------------------------------

function makeCtx(doc, snap, images, pages) {
  const font = (name, size, color = C.body) => doc.font(name).fontSize(size).fillColor(color);
  const box = (t, x, y, w, h, opts = {}) => doc.text(t || "", x, y, { width: w, height: h, ellipsis: true, lineGap: 2, ...opts });
  const levelLabel = (code) => snap.levels.find((l) => l.code === code)?.label || code;
  const levelDays = (code) => snap.levels.find((l) => l.code === code)?.defaultDays;

  function newPage(meta) {
    doc.addPage({ size: [W, H], margin: 0 });
    pages.push(meta);
    doc.rect(0, 0, W, H).fill(meta.bg || C.cream);
  }

  /** Rounded pill with centred text; `right` anchors its right edge at x. Returns its width. */
  function pill(text, x, y, fill, color, { size = 10.5, padX = 12, h = 22, right = false, spacing = 0 } = {}) {
    font("B", size, color);
    const w = doc.widthOfString(text, { characterSpacing: spacing }) + padX * 2;
    const px = right ? x - w : x;
    doc.roundedRect(px, y, w, h, h / 2).fill(fill);
    font("B", size, color).text(text, px, y + (h - size) / 2 - 1, { width: w, align: "center", lineBreak: false, characterSpacing: spacing });
    return w;
  }

  function riskPill(code, x, y, opts = {}) {
    const r = RISK[code] || RISK.MEDIUM;
    return pill(opts.label ?? `${levelLabel(code)} risk`, x, y, r.fill, r.text, opts);
  }

  /**
   * Photo filling the box. A photo whose shape is far from the box (e.g. portrait in a wide
   * frame) is shown whole on top of a blurred, darkened copy of itself instead of hard-cropped.
   */
  function photo(id, x, y, w, h, radius = 0, emptyText = "No photo") {
    const buf = id && images[id];
    doc.save();
    if (radius) doc.roundedRect(x, y, w, h, radius).clip();
    else doc.rect(x, y, w, h).clip();
    let img = null;
    if (buf) {
      try { img = doc.openImage(buf); } catch { img = null; }
    }
    if (!img) {
      doc.rect(x, y, w, h).fill(C.photoEmpty);
      doc.restore();
      font("SB", 11, C.muted);
      box(emptyText, x + 20, y + h / 2 - 8, w - 40, 40, { align: "center" });
      return;
    }
    const fit = (img.width / img.height) / (w / h);
    const blur = images[`${id}#blur`];
    if (blur && (fit < 0.72 || fit > 1.6)) {
      doc.image(blur, x, y, { cover: [w, h], align: "center", valign: "center" });
      doc.fillOpacity(0.18).rect(x, y, w, h).fill("#000000").fillOpacity(1);
      doc.image(img, x, y, { fit: [w, h], align: "center", valign: "center" });
    } else {
      doc.image(img, x, y, { cover: [w, h], align: "center", valign: "center" });
    }
    doc.restore();
  }

  function logoBox(x, y) {
    doc.roundedRect(x, y, 144, 54, 8).fill(C.white);
    try { doc.image(LOGO, x + 10, y + 7, { fit: [124, 40], align: "center", valign: "center" }); } catch { /* logo optional */ }
  }

  return { doc, snap, images, font, box, newPage, pill, riskPill, photo, logoBox, levelLabel, levelDays };
}

function draw(doc, snap, images) {
  const pages = [{ kind: "cover" }];
  const ctx = makeCtx(doc, snap, images, pages);
  drawCover(ctx);
  drawSummary(ctx);
  for (const f of snap.findings) drawFinding(ctx, f);
  drawTimeline(ctx);
  drawThanks(ctx);
  return pages;
}

// ---- cover ----------------------------------------------------------------------

function drawCover(ctx) {
  const { doc, snap, images, font, box, pill, logoBox } = ctx;
  doc.rect(0, 0, W, H).fill(C.forest);
  if (images["#cover"]) {
    doc.image(images["#cover"], 0, 0, { cover: [W, H], align: "center", valign: "center" });
    if (images["#brandCover"]) {
      // Bestserve picture: dark green on the left (title), lighter on the right so the
      // technician shows, and a dark band along the bottom so the facts stay readable.
      const side = doc.linearGradient(0, 0, W, 0);
      side.stop(0, C.forest, 0.93).stop(0.42, C.forest, 0.72).stop(1, C.forest, 0.18);
      doc.rect(0, 0, W, H).fill(side);
      const foot = doc.linearGradient(0, 360, 0, H);
      foot.stop(0, C.forest, 0).stop(0.45, C.forest, 0.78).stop(1, C.forest, 0.92);
      doc.rect(0, 360, W, H - 360).fill(foot);
    } else {
      // Dark green tint, strongest behind the title (left / bottom).
      const g = doc.linearGradient(0, H, W, 0);
      g.stop(0, C.forest, 0.94).stop(0.5, C.forest, 0.8).stop(1, C.forest, 0.5);
      doc.rect(0, 0, W, H).fill(g);
    }
  }

  logoBox(M, 56);
  // The audit type(s) chosen when starting the audit (e.g. "ROUTINE AUDIT · COMPLAINT AUDIT").
  const pest = (snap.audit.pests[0] || "Pest").replace(/s$/i, "");
  const typeText = (snap.audit.types || []).join(" · ") || `${pest} risk inspection`;
  pill(typeText.toUpperCase(), W - M, 68, C.lime, C.forest, { size: 10.5, padX: 14, h: 28, right: true, spacing: 1 });
  if (snap.draft) pill("DRAFT – NOT SUBMITTED", W - M, 104, C.draft, C.white, { size: 9.5, padX: 12, h: 22, right: true, spacing: 0.6 });

  font("XB", 60, C.offwhite).text("Pest Risk", M, 230, { lineBreak: false });
  font("XB", 60, C.offwhite).text("Audit Report", M, 294, { lineBreak: false });

  doc.rect(M, 402, 48, 3).fill(C.lime);
  const place = [snap.company.name, snap.site.address || snap.site.name].filter(Boolean).join(", ");
  font("B", 17, C.offwhite);
  box(place, M + 62, 392, W - 2 * M - 62, 46);

  const facts = [
    ["AUDIT DATE", fmtDate(snap.audit.date), 110],
    ["REPORT NO.", snap.audit.number, 190],
    ["AUDITED BY", snap.auditor || "—", 150],
    ["ESCORTED BY", snap.escort?.name || "—", 170],
  ];
  let x = M;
  for (const [label, value, w] of facts) {
    font("R", 11, C.lime).text(label, x, 456, { characterSpacing: 0.8, lineBreak: false });
    font("B", 13.5, C.white).text(value, x, 474, { width: w, lineBreak: false, ellipsis: true });
    x += w + 16;
  }
  drawRiskBox(ctx);
}

// Bright versions of the risk colours, readable on the dark green cover.
const COVER_RISK = { CRITICAL: "#F87171", HIGH: "#FB8A3C", MEDIUM: "#F2C14E", LOW: "#BCDB4A" };

/** Cover, top right: "OVERALL SITE RISK  HIGH  4 of 8 points need action within 7 days". */
/**
 * Cover, top right: how many findings at each risk level (Critical, High, Medium, Low - only the
 * levels that have findings), each with its colour, count and when to act.
 */
function drawRiskBox(ctx) {
  const { doc, snap, font, levelLabel, levelDays, riskPill } = ctx;
  const rows = LEVEL_ORDER.map((code) => ({ code, count: snap.counts[code] || 0 })).filter((r) => r.count);
  if (!rows.length) return;
  const total = snap.counts.findings || 0;

  const bw = 250;
  const rowH = 32;
  const bh = 50 + rows.length * rowH + 26;
  const bx = W - M - bw;
  const by = snap.draft ? 140 : 118; // below the audit-type (and draft) pills
  doc.save();
  doc.roundedRect(bx, by, bw, bh, 14).fillOpacity(0.86).fill(C.forest);
  doc.restore();
  doc.roundedRect(bx, by, bw, bh, 14).lineWidth(1.4).strokeColor(C.lime).stroke();
  font("B", 10.5, C.lime).text("SITE RISK", bx + 20, by + 18, { characterSpacing: 1.6, lineBreak: false });
  font("R", 10.5, C.forestText).text(`${total} finding${total === 1 ? "" : "s"}`, bx + 20, by + 18, { width: bw - 40, align: "right", lineBreak: false });

  rows.forEach((r, i) => {
    const y = by + 44 + i * rowH;
    riskPill(r.code, bx + 20, y, { label: levelLabel(r.code), size: 10.5, h: 22, padX: 10 });
    const days = levelDays(r.code);
    const act = days == null ? "monitor" : days <= 1 ? "act now" : `within ${days} days`;
    font("R", 10.5, C.forestText).text(act, bx + 110, y + 5, { lineBreak: false });
    font("XB", 22, COVER_RISK[r.code] || C.white).text(String(r.count), bx + 20, y - 2, { width: bw - 40, align: "right", lineBreak: false });
  });
}

// ---- summary + findings register ------------------------------------------------

const PANEL_W = 320;

function summaryPanel(ctx, continued) {
  const { doc, snap, font, riskPill, levelLabel, levelDays } = ctx;
  doc.rect(0, 0, PANEL_W, H).fill(C.forest);
  font("B", 10.5, C.lime).text("AUDIT SUMMARY", 40, 58, { characterSpacing: 1.4, lineBreak: false });
  if (continued) {
    font("XB", 22, C.white).text("Findings register", 40, 80, { lineBreak: false });
    font("R", 12, C.forestText).text("continued", 40, 110, { lineBreak: false });
    return;
  }
  const n = snap.counts.findings || 0;
  font("XB", 108, C.lime).text(String(n), 36, 70, { lineBreak: false });
  font("B", 15, C.white).text(`finding${n === 1 ? "" : "s"} recorded on site`, 40, 220, { width: PANEL_W - 60, lineBreak: false });

  let y = 262;
  for (const code of LEVEL_ORDER) {
    const count = snap.counts[code] || 0;
    if (!count) continue;
    const pw = riskPill(code, 40, y, { label: levelLabel(code), size: 10.5, h: 24, padX: 10 });
    const days = levelDays(code);
    const act = days == null ? "monitor every visit" : days <= 1 ? "act immediately" : `act within ${days} days`;
    font("R", 12.5, C.white).text(`${count} point${count === 1 ? "" : "s"} · ${act}`, 40 + pw + 10, y + 4, {
      width: PANEL_W - 40 - pw - 10 - 20, lineBreak: false, ellipsis: true,
    });
    y += 34;
  }
  if (!n) font("R", 12, C.forestText).text("No findings were recorded.", 40, y, { lineBreak: false });

  const pests = (snap.audit.pests || []).map((p) => p.toLowerCase()).join(", ");
  if (pests) {
    font("R", 11.5, C.forestText).text("Target pest: ", 40, 452, { continued: true, width: PANEL_W - 70 });
    font("B", 11.5, C.white).text(`${pests}.`, { width: PANEL_W - 70 });
  }
}

function drawSummary(ctx) {
  const { doc, snap, font, box } = ctx;
  const rx = 376;
  const rw = W - M - rx;
  const cw = [46, 0, 0, 92];
  cw[1] = Math.round((rw - cw[0] - cw[3]) * 0.52);
  cw[2] = rw - cw[0] - cw[1] - cw[3];
  const ROW = 28;
  const MAX_Y = 468;

  const start = (continued) => {
    ctx.newPage({ kind: "split", footerX: rx });
    summaryPanel(ctx, continued);
    font("B", 10.5, C.green).text("FINDINGS REGISTER", rx, 58, { characterSpacing: 1.4, lineBreak: false });
    font("XB", 28, C.ink).text(continued ? "Risks found in each area (cont.)" : "Risks found in each area", rx, 74, { lineBreak: false });
    return 134;
  };
  const row = (y, cells, header, tone) => {
    doc.lineWidth(0.8).rect(rx, y, rw, ROW).fillAndStroke(header ? C.head : C.cream, C.line);
    let x = rx;
    cells.forEach((t, i) => {
      if (i) doc.moveTo(x, y).lineTo(x, y + ROW).strokeColor(C.line).stroke();
      const isRisk = i === 3 && !header;
      font(header ? "SB" : isRisk ? "SB" : "R", 11.5, isRisk ? tone : C.ink);
      box(t, x + 10, y + 8, cw[i] - 18, 14, { lineBreak: false });
      x += cw[i];
    });
  };

  let y = start(false);
  row(y, ["No.", "Area", "Issue", "Risk"], true);
  y += ROW;
  if (!snap.findings.length) {
    font("R", 11.5, C.muted).text("No findings were recorded in this audit.", rx + 10, y + 10, { lineBreak: false });
    return;
  }
  for (const f of snap.findings) {
    if (y + ROW > MAX_Y) {
      y = start(true);
      row(y, ["No.", "Area", "Issue", "Risk"], true);
      y += ROW;
    }
    row(y, [pad2(f.number), f.where, f.title, ctx.levelLabel(f.riskLevel)], false, (RISK[f.riskLevel] || RISK.MEDIUM).tone);
    y += ROW;
  }
}

// ---- finding pages -----------------------------------------------------------------

const BAND_H = 235;

function icon(doc, kind, x, y, color) {
  doc.save().lineWidth(1.3).strokeColor(color);
  if (kind === "search") {
    doc.circle(x + 5.5, y + 5.5, 4.2).stroke();
    doc.moveTo(x + 8.6, y + 8.6).lineTo(x + 12, y + 12).stroke();
  } else if (kind === "tool") {
    doc.circle(x + 7.8, y + 4, 3.2).stroke();
    doc.moveTo(x + 6, y + 6.6).lineTo(x + 2.4, y + 12).stroke();
  } else {
    doc.circle(x + 6, y + 6, 5.6).stroke();
    doc.moveTo(x + 3.3, y + 6.2).lineTo(x + 5.3, y + 8.3).lineTo(x + 8.9, y + 4).stroke();
  }
  doc.restore();
}

function drawFinding(ctx, f) {
  const { doc, snap, font, box, photo, riskPill } = ctx;
  ctx.newPage({ kind: "normal" });

  // Top band: two photos, or one photo + the dark green zone panel.
  const shown = f.photoIds.slice(0, 2);
  if (shown.length >= 2) {
    const half = (W - 4) / 2;
    photo(shown[0], 0, 0, half, BAND_H);
    photo(shown[1], half + 4, 0, half, BAND_H);
    doc.rect(half, 0, 4, BAND_H).fill(C.forest);
  } else {
    const pw = 477;
    photo(shown[0], 0, 0, pw, BAND_H, 0, f.noPhotoReason || "No photo");
    doc.rect(pw, 0, W - pw, BAND_H).fill(C.forest);
    const px = pw + 45;
    const pwid = W - px - 40;
    // The area's old zone box now holds its target pests.
    font("B", 10.5, C.lime).text(f.zone ? "TARGET PEST" : "AREA", px, 78, { characterSpacing: 1.4, lineBreak: false });
    font("XB", 26, C.offwhite);
    box(f.zone || f.areaName, px, 96, pwid, 66);
    const after = Math.min(doc.y, 162) + 6;
    font("R", 13, C.forestText);
    box(`Risk type: ${f.riskType || String(f.category || "").toLowerCase()}`, px, after, pwid, 40);
  }

  // Number, where, title and risk pill.
  const num = pad2(f.number);
  font("XB", 46, C.green).text(num, M, 250, { lineBreak: false });
  const tx = M + doc.widthOfString(num) + 16;
  const pillW = riskPill(f.riskLevel, W - M, 268, { size: 11, h: 27, padX: 14, right: true });
  const tw = W - M - pillW - 20 - tx;
  font("B", 10.5, C.muted).text(f.where.toUpperCase(), tx, 260, { width: tw, characterSpacing: 1.2, lineBreak: false, ellipsis: true });
  // A long title gets a smaller font (down to 15) so it fits on one line instead of being cut.
  let titleSize = 24;
  font("XB", titleSize, C.ink);
  while (titleSize > 15 && doc.widthOfString(f.title || "") > tw) font("XB", --titleSize, C.ink);
  box(f.title, tx, 275 + (24 - titleSize) / 2, tw, 32, { lineBreak: false });

  // Observed · customer action · BestServe action.
  const cy = 323;
  const gap = 24;
  const cw = (W - 2 * M - 2 * gap) / 3;
  const cols = [
    ["OBSERVED", f.observation, C.ink, "search"],
    [(snap.audit.customerActionLabel || "Customer action").toUpperCase(), f.customerAction, C.amber, "tool"],
    ["BESTSERVE ACTION", f.bestserveAction, C.green, "check"],
  ];
  cols.forEach(([title, body, color, kind], i) => {
    const x = M + i * (cw + gap);
    doc.rect(x, cy, cw, 2).fill(color);
    icon(doc, kind, x, cy + 15, color);
    font("B", 11.5, C.ink).text(title, x + 20, cy + 14, { width: cw - 20, characterSpacing: 1.3, lineBreak: false, ellipsis: true });
    font("R", 12, C.body);
    box(body || "—", x, cy + 37, cw, H - 56 - (cy + 37));
  });

  // 3 or more photos: one extra page with the rest.
  const rest = f.photoIds.slice(2, 8);
  if (!rest.length) return;
  ctx.newPage({ kind: "normal" });
  font("B", 10.5, C.green).text(`FINDING ${num} · MORE PHOTOS`, M, 40, { characterSpacing: 1.4, lineBreak: false });
  font("XB", 22, C.ink);
  box(f.title, M, 56, W - 2 * M, 30, { lineBreak: false });
  const cols3 = rest.length <= 2 ? rest.length : 3;
  const rows = Math.ceil(rest.length / cols3);
  const gw = (W - 2 * M - (cols3 - 1) * 12) / cols3;
  const gh = (470 - 100 - (rows - 1) * 12) / rows;
  rest.forEach((id, i) => {
    photo(id, M + (i % cols3) * (gw + 12), 100 + Math.floor(i / cols3) * (gh + 12), gw, gh, 10);
  });
}

// ---- action timeline -----------------------------------------------------------------

function timelineGroups(snap, levelLabel) {
  const F = snap.findings;
  const uniq = (arr) => [...new Set(arr.map((s) => String(s || "").trim()).filter(Boolean))];
  const urgent = F.filter((f) => f.riskLevel === "CRITICAL" || f.riskLevel === "HIGH");
  const medium = F.filter((f) => f.riskLevel === "MEDIUM");
  const low = F.filter((f) => f.riskLevel === "LOW");
  const hasCrit = urgent.some((f) => f.riskLevel === "CRITICAL");
  const hasHigh = urgent.some((f) => f.riskLevel === "HIGH");
  const findingsText = (list) => `finding${list.length === 1 ? "" : "s"} ${numberRanges(list.map((f) => f.number))}`;

  let items;
  if (snap.recommendations?.length) {
    // Written recommendations win over the automatic lines.
    const by = (buckets) => snap.recommendations.filter((r) => buckets.includes(r.bucket)).map((r) => r.text);
    items = [by(["IMMEDIATE", "WITHIN_7_DAYS"]), by(["WITHIN_30_DAYS"]), by(["ONGOING"])];
  } else {
    items = [
      uniq(urgent.map((f) => f.customerAction || f.title)),
      uniq(medium.map((f) => f.customerAction || f.title)),
      [
        ...uniq(F.map((f) => f.bestserveAction)),
        ...uniq(low.map((f) => (f.customerAction ? `Monitor: ${f.customerAction}` : null))),
        "Follow-up audit to close each finding",
      ],
    ];
  }

  const urgentLabel = hasCrit && hasHigh ? `${levelLabel("CRITICAL")} & ${levelLabel("HIGH").toLowerCase()}` : hasCrit ? levelLabel("CRITICAL") : levelLabel("HIGH");
  return [
    {
      title: hasCrit && !hasHigh ? "Immediately" : "Within 7 days",
      sub: urgent.length ? `${urgentLabel} risk · ${findingsText(urgent)}` : "No high-risk findings",
      head: RISK.HIGH.fill, headText: C.white, dark: false, items: items[0],
    },
    {
      title: "Within 30 days",
      sub: medium.length ? `${levelLabel("MEDIUM")} risk · ${findingsText(medium)}` : "No medium-risk findings",
      head: RISK.MEDIUM.fill, headText: C.ink, dark: false, items: items[1],
    },
    {
      title: "Ongoing",
      sub: "Bestserve treatment",
      head: C.lime, headText: C.ink, dark: true, items: items[2],
    },
  ];
}

function drawTimeline(ctx) {
  const { doc, snap, font } = ctx;
  // Only the groups that have something in them; the cards share the page width.
  const groups = timelineGroups(snap, ctx.levelLabel).filter((g) => g.items.length);
  if (!groups.length) return;
  ctx.newPage({ kind: "normal", footerLeft: "Timelines are suggested; adjust to your service agreement." });
  font("B", 10.5, C.green).text("INTEGRATED PEST MANAGEMENT", M, 58, { characterSpacing: 1.4, lineBreak: false });
  font("XB", 30, C.ink).text("Action timeline", M, 74, { lineBreak: false });

  const cy = 138;
  const ch = 260;
  const gap = 16;
  const cw = (W - 2 * M - (groups.length - 1) * gap) / groups.length;
  groups.forEach((g, i) => {
    const x = M + i * (cw + gap);
    doc.lineWidth(0.8).roundedRect(x, cy, cw, ch, 10).fillAndStroke(g.dark ? C.forest : C.card, g.dark ? C.forest : C.cardBorder);
    doc.save();
    doc.roundedRect(x, cy, cw, ch, 10).clip();
    doc.rect(x, cy, cw, 72).fill(g.head);
    doc.restore();
    font("XB", 17, g.headText).text(g.title, x + 18, cy + 17, { width: cw - 36, lineBreak: false });
    font("R", 11, g.headText).text(g.sub, x + 18, cy + 44, { width: cw - 36, lineBreak: false, ellipsis: true });

    const textColor = g.dark ? C.forestText : C.body;
    const maxY = cy + ch - 16;
    let y = cy + 90;
    for (let k = 0; k < g.items.length; k++) {
      font("R", 11.5, textColor);
      const hgt = doc.heightOfString(g.items[k], { width: cw - 48, lineGap: 1.5 });
      // Keep room inside the card for a "+N more" line when items follow this one.
      const reserve = k < g.items.length - 1 ? 20 : 0;
      const room = maxY - reserve - y;
      if (room < 16) {
        font("SB", 11, textColor).text(`+${g.items.length - k} more`, x + 30, y, { lineBreak: false });
        break;
      }
      const shownH = Math.min(hgt, room);
      doc.circle(x + 22, y + 6.5, 2).fill(textColor);
      font("R", 11.5, textColor).text(g.items[k], x + 30, y, { width: cw - 48, height: shownH, ellipsis: true, lineGap: 1.5 });
      y += shownH + 7;
    }
  });
}

// ---- thank you + sign-off ------------------------------------------------------------

function drawThanks(ctx) {
  const { doc, snap, font, box, logoBox } = ctx;
  ctx.newPage({ kind: "thanks", bg: C.forest });
  logoBox(M, 56);
  font("XB", 44, C.offwhite).text("Thank you for your support", M, 184, { width: 450, lineGap: -4 });
  doc.rect(M, 306, 48, 3).fill(C.lime);

  const contact = [
    ["PHONE", COMPANY.phone, M, 392],
    ["EMAIL", COMPANY.email, M + 236, 392],
    ["WEB", COMPANY.web, M, 432],
    ["OFFICE", COMPANY.office, M + 236, 432],
  ];
  for (const [label, value, x, y] of contact) {
    font("R", 11, C.lime).text(label, x, y, { characterSpacing: 0.8, lineBreak: false });
    font("R", 13, C.offwhite);
    box(value, x, y + 15, 230, 52);
  }

  // Sign-off card.
  const cx = 586;
  const cyy = 56;
  const cwid = W - M - cx;
  doc.roundedRect(cx, cyy, cwid, 428, 14).fill(C.cream);
  font("B", 17, C.ink).text("Report sign-off", cx + 24, cyy + 24, { lineBreak: false });
  const s = snap.signoff || {};
  const escort = snap.escort || {};
  const rows = [
    ["AUDITED BY", `${snap.auditor || "—"}, Bestserve`],
    ["ESCORTED BY", escort.name ? `${escort.name}${escort.designation ? `, ${escort.designation}` : ""}` : "—"],
    ["RECEIVED BY", s.receivedByName ? `${s.receivedByName}${s.receivedByDesignation ? `, ${s.receivedByDesignation}` : ""}` : "—"],
  ];
  let y = cyy + 64;
  for (const [label, value] of rows) {
    font("R", 10.5, C.muted).text(label, cx + 24, y, { characterSpacing: 1, lineBreak: false });
    font("B", 12.5, C.ink).text(value, cx + 24, y + 15, { width: cwid - 48, lineBreak: false, ellipsis: true });
    doc.moveTo(cx + 24, y + 36).lineTo(cx + cwid - 24, y + 36).lineWidth(0.8).strokeColor(C.line).stroke();
    y += 56;
  }
  doc.roundedRect(cx + 24, y + 2, cwid - 48, 34, 8).fill(C.head);
  font("B", 11.5, C.ink).text("Next audit: ", cx + 38, y + 13, { continued: true, lineBreak: false });
  font("R", 11.5, C.ink).text(fmtDate(s.nextAuditDate), { lineBreak: false });
  if (s.remarks) {
    font("R", 10.5, C.muted).text("REMARKS", cx + 24, y + 54, { characterSpacing: 1, lineBreak: false });
    font("R", 11, C.body);
    box(s.remarks, cx + 24, y + 70, cwid - 48, cyy + 428 - (y + 70) - 16);
  }
  if (snap.draft) font("B", 10, "#FCA5A5").text("DRAFT preview – not submitted", M, 490, { lineBreak: false });
}

// ---- footers ---------------------------------------------------------------------------

function drawFooters(doc, snap, pages) {
  pages.forEach((p, i) => {
    if (p.kind === "cover" || p.kind === "thanks") return;
    doc.switchToPage(i);
    const x = p.footerX || M;
    doc.font("R").fontSize(10.5).fillColor(C.muted)
      .text(p.footerLeft || `${COMPANY.short} · ${snap.company.name || ""}`, x, 494, { width: W - M - x - 190, lineBreak: false, ellipsis: true });
    if (snap.draft) {
      doc.font("B").fontSize(9.5).fillColor(C.draft).text("DRAFT – not submitted", W - M - 190, 495, { width: 140, align: "right", lineBreak: false });
    }
    doc.font("B").fontSize(11.5).fillColor(C.green).text(pad2(i + 1), W - M - 40, 494, { width: 40, align: "right", lineBreak: false });
  });
}

module.exports = { renderAuditReportPdf };

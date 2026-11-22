// "My Signature": the signed-in person's own signature image, printed above their name in the
// "For Bestserve Pest Management" acceptance box of the quotations they generate. Only they can
// upload, see or remove it. Quotations already generated keep the PDF they were made with.

import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiCheck, FiEdit3, FiTrash2, FiUpload } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { deleteMySignature, getMySignature, uploadMySignature } from "./leadsApi";
import { useToast } from "./hooks";
import { Alert, Button, Card, Empty, Note, SkeletonRows } from "./ui";
import { useViewer } from "./viewer";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg"];
// A phone photo can be large; the picked file may be bigger than what is uploaded (the cleaned PNG).
const MAX_PICK_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 1000; // the cleaned signature is drawn small on the quotation; this keeps it sharp and light

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo could not be opened. Use a PNG or JPG."));
    };
    img.src = url;
  });
}

/**
 * Cleans a photo of a signature on paper: the paper (white, grey, cream, shadowed) becomes
 * transparent, only the ink is kept - slightly darkened so a faint pen still prints - and the empty
 * space around it is trimmed. The paper's brightness is measured per small area, so uneven light
 * and shadows across the sheet are handled too. Returns a PNG Blob, all in the browser.
 */
async function cleanSignature(file) {
  const { img, url } = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    const px = frame.data;

    const lum = new Float32Array(w * h);
    for (let i = 0, p = 0; i < lum.length; i += 1, p += 4) lum[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];

    // The paper's brightness in each tile: a high percentile, since most of a tile is paper.
    const TILE = 32;
    const tx = Math.ceil(w / TILE);
    const ty = Math.ceil(h / TILE);
    const paper = new Float32Array(tx * ty);
    for (let by = 0; by < ty; by += 1) {
      for (let bx = 0; bx < tx; bx += 1) {
        const vals = [];
        for (let y = by * TILE; y < Math.min(h, (by + 1) * TILE); y += 2) {
          for (let x = bx * TILE; x < Math.min(w, (bx + 1) * TILE); x += 2) vals.push(lum[y * w + x]);
        }
        vals.sort((a, b) => a - b);
        paper[by * tx + bx] = vals[Math.floor(vals.length * 0.9)] || 255;
      }
    }
    // Smooth the tiles with their neighbours so tile edges never show.
    const smooth = new Float32Array(tx * ty);
    for (let by = 0; by < ty; by += 1) {
      for (let bx = 0; bx < tx; bx += 1) {
        let best = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = bx + dx;
            const ny = by + dy;
            if (nx >= 0 && ny >= 0 && nx < tx && ny < ty) best = Math.max(best, paper[ny * tx + nx]);
          }
        }
        smooth[by * tx + bx] = best;
      }
    }

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        const p = i * 4;
        const bg = Math.max(smooth[Math.floor(y / TILE) * tx + Math.floor(x / TILE)], 60);
        const contrast = (bg - lum[i]) / bg; // 0 = paper, towards 1 = dark ink
        // Below ~15% darker than the paper is paper/noise; above ~38% is solid ink; a soft edge between.
        const t = Math.min(1, Math.max(0, (contrast - 0.15) / 0.23));
        const alpha = Math.round(255 * t * t * (3 - 2 * t));
        px[p + 3] = alpha;
        if (alpha > 0) {
          // Keep the pen's colour, a little deeper.
          px[p] = Math.round(px[p] * 0.75);
          px[p + 1] = Math.round(px[p + 1] * 0.75);
          px[p + 2] = Math.round(px[p + 2] * 0.75);
        }
      }
    }

    // Each separate mark (connected ink): a mark touching the photo's edge is the desk, the paper's
    // edge or a finger, and a speck far smaller than the signature's strokes is dust - both are
    // dropped. Small real marks such as dots in a signature are many times bigger than dust and kept.
    const mark = new Int32Array(w * h).fill(-1);
    const stack = new Int32Array(w * h);
    const sizes = [];
    const edges = [];
    for (let start = 0; start < w * h; start += 1) {
      if (mark[start] !== -1 || px[start * 4 + 3] === 0) continue;
      const id = sizes.length;
      let size = 0;
      let edge = false;
      let top = 0;
      stack[top++] = start;
      mark[start] = id;
      while (top > 0) {
        const i = stack[--top];
        size += 1;
        const x = i % w;
        const y = (i - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const n = ny * w + nx;
            if (mark[n] === -1 && px[n * 4 + 3] > 0) {
              mark[n] = id;
              stack[top++] = n;
            }
          }
        }
      }
      sizes.push(size);
      edges.push(edge);
    }
    // Dust: under 0.25% of the biggest stroke (and always under 12 pixels).
    let biggest = 0;
    sizes.forEach((size, i) => {
      if (!edges[i] && size > biggest) biggest = size;
    });
    const speck = Math.max(12, biggest * 0.0025);
    const drop = sizes.map((size, i) => edges[i] || size < speck);
    // Never drop everything: a signature that runs to the photo's edge is kept rather than lost.
    const keepAll = drop.every(Boolean);

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < w * h; i += 1) {
      if (mark[i] === -1) continue;
      if (!keepAll && drop[mark[i]]) {
        px[i * 4 + 3] = 0;
        continue;
      }
      if (px[i * 4 + 3] > 60) {
        const x = i % w;
        const y = (i - x) / w;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0 || (maxX - minX) * (maxY - minY) < 100) {
      throw new Error("No signature could be found in this photo. Sign in dark ink on plain paper and try again.");
    }
    ctx.putImageData(frame, 0, 0);

    const pad = 8;
    const cx = Math.max(0, minX - pad);
    const cy = Math.max(0, minY - pad);
    const cw = Math.min(w, maxX + pad + 1) - cx;
    const ch = Math.min(h, maxY + pad + 1) - cy;
    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d").drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    const blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The cleaned signature could not be made. Try another photo.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** How the signature reads on the quotation: on white, above the line, with the name below. */
function SignaturePreview({ url, name }) {
  return (
    <div style={{ maxWidth: 360, padding: "12px 14px", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
      <img src={url} alt="Your signature" style={{ display: "block", margin: "0 auto", maxWidth: "100%", maxHeight: 70, objectFit: "contain", objectPosition: "center bottom" }} />
      <div style={{ borderTop: "1px solid #9aa1ad", marginTop: 6, paddingTop: 8, color: "#111827" }}>
        <strong>For Bestserve Pest Management Pvt. Ltd.</strong>
        <div style={{ color: "#6b7280", fontSize: 13 }}>{name}</div>
      </div>
    </div>
  );
}

export default function MySignature() {
  const { persona, me } = useViewer();
  const toast = useToast();
  const fileRef = useRef(null);
  const [current, setCurrent] = useState(undefined); // undefined = loading, null = none, { url, uploadedAt }
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [cleaned, setCleaned] = useState(null); // { blob, url } - the cleaned photo, waiting to be saved

  // The cleaned preview's blob URL is released when it is replaced or the page closes.
  useEffect(() => () => cleaned && URL.revokeObjectURL(cleaned.url), [cleaned]);

  useEffect(() => {
    let alive = true;
    let url = null;
    getMySignature()
      .then((sig) => {
        url = sig?.url || null;
        if (alive) {
          setCurrent(sig);
          setError("");
        } else if (url) URL.revokeObjectURL(url);
      })
      .catch((err) => alive && (setCurrent(null), setError(err.message || "Could not load your signature.")));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [version]);

  // The people who make quotations: sales executives and the heads of sales.
  if (persona !== "sales" && persona !== "sales_manager") return <Navigate to={LEADS_HOME} replace />;

  // A photo was picked: clean it (paper removed, trimmed) and show it before anything is saved.
  async function pick(file) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast("Choose a PNG or JPG photo.", true);
    if (file.size > MAX_PICK_BYTES) return toast("The photo is too large (max 15 MB).", true);
    setBusy(true);
    try {
      const blob = await cleanSignature(file);
      if (blob.size > MAX_BYTES) throw new Error("The cleaned signature is too large. Crop the photo closer to the signature.");
      setCleaned({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      toast(err.message || "Could not read this photo.", true);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!cleaned) return;
    setBusy(true);
    try {
      await uploadMySignature(new File([cleaned.blob], "signature.png", { type: "image/png" }));
      toast(current ? "Signature replaced" : "Signature saved");
      setCleaned(null);
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message || "Could not save your signature.", true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(close) {
    setBusy(true);
    try {
      await deleteMySignature();
      toast("Signature removed");
      close();
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message || "Could not remove your signature.", true);
    } finally {
      setBusy(false);
    }
  }

  const uploadedOn = current?.uploadedAt
    ? new Date(current.uploadedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>My Signature</h1>
          <p>Your signature is printed above your name in the Acceptance section of every quotation you generate.</p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: "none" }}
        onChange={(e) => pick(e.target.files?.[0])}
        aria-label="Signature photo"
      />

      <Card
        title="Your signature"
        sub={uploadedOn ? `Uploaded ${uploadedOn}` : undefined}
        index={0}
        action={
          current ? (
            <span style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="ghost" icon={<FiUpload />} busy={busy} onClick={() => fileRef.current?.click()}>
                Replace
              </Button>
              <Button size="sm" variant="danger" icon={<FiTrash2 />} disabled={busy} onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            </span>
          ) : null
        }
      >
        {current === undefined ? (
          <SkeletonRows rows={2} />
        ) : !current ? (
          <Empty
            title={error ? "Could not load your signature" : "No signature yet"}
            text={error || "Upload a photo of your signature. Until then your quotations have a blank line to sign by hand."}
            icon={<FiEdit3 />}
            action={
              <Button icon={<FiUpload />} busy={busy} onClick={() => fileRef.current?.click()}>
                Upload Signature
              </Button>
            }
          />
        ) : (
          <SignaturePreview url={current.url} name={me.name} />
        )}
      </Card>

      {cleaned && (
        <Card title="Check before saving" sub="The paper has been removed - only your ink is kept. This is exactly what will print." index={1}>
          <SignaturePreview url={cleaned.url} name={me.name} />
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Button busy={busy} icon={<FiCheck />} onClick={save}>
              Save Signature
            </Button>
            <Button variant="ghost" icon={<FiUpload />} disabled={busy} onClick={() => fileRef.current?.click()}>
              Choose Another Photo
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setCleaned(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Note tone="info">
        Sign in dark blue or black ink on plain paper and take the photo straight on, in good light. The paper and its shadows are
        removed automatically and the signature is trimmed - you see the result before it is saved. PNG or JPG photo. Quotations you already
        generated keep the PDF they were made with; only new ones get the signature.
      </Note>

      {confirmRemove && (
        <Alert
          icon={<FiTrash2 />}
          tone="danger"
          title="Remove your signature?"
          onClose={() => setConfirmRemove(false)}
          actions={(close) => (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button variant="danger" busy={busy} icon={<FiTrash2 />} onClick={() => remove(close)}>
                Remove
              </Button>
            </>
          )}
        >
          New quotations will have a blank line to sign by hand. Quotations already generated are not changed.
        </Alert>
      )}
    </>
  );
}

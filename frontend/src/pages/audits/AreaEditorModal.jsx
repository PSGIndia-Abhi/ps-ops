import { useState } from "react";
import { auditsApi, newId } from "./auditsApi";
import { Modal } from "./shared";
import { fmtDate, titleCase } from "./format";

const FIELD_LABEL = {
  title: "Finding title",
  riskCategory: "Risk category",
  riskLevel: "Risk level",
  observationText: "Observation",
  customerActionText: "Customer action",
  bestserveActionText: "BestServe action",
  photos: "Photo (or no-photo reason)",
  findings: "At least one finding",
};

const KNOWN_CATEGORIES = ["HARBOURAGE", "BURROWS", "ENTRY_POINT", "FOOD_SOURCE", "WATER", "OTHER"];

// Target pests of the area (the same as the mobile app): saved in the area's zone box as text,
// e.g. "Cockroaches, Rodents, Lizards". Known pests are chips; anything else is typed under "Other".
const PEST_CODES = ["COCKROACHES", "RODENTS", "MOSQUITOES", "FLIES", "TERMITES"];
function splitPests(text) {
  const codes = [];
  const others = [];
  String(text || "").split(",").map((x) => x.trim()).filter(Boolean).forEach((x) => {
    const code = x.toUpperCase().replace(/\s+/g, "_");
    if (PEST_CODES.includes(code)) { if (!codes.includes(code)) codes.push(code); } else others.push(x);
  });
  return { codes, other: others.join(", ") };
}

function blankFinding(defaultLevel = "MEDIUM") {
  return {
    id: newId(), isNew: true, title: "", riskCategory: "HARBOURAGE", riskTypeText: "", riskLevel: defaultLevel,
    actionWithinDays: "", observationText: "", customerActionText: "", bestserveActionText: "", noPhotoReason: "",
  };
}

// Add or edit one area and its findings. Saves the whole area in one call.
export default function AreaEditorModal({ audit, area, lookups, onClose, onSaved }) {
  const isNew = !area;
  const [form, setForm] = useState(() => ({
    id: area?.id || newId(),
    areaName: area?.areaName || "",
    notes: area?.notes || "",
    rowVersion: area?.rowVersion,
  }));
  const [findings, setFindings] = useState(() =>
    area?.findings?.length
      ? area.findings.map((f) => ({
        ...f, actionWithinDays: f.actionWithinDays ?? "", riskTypeText: f.riskTypeText || "", noPhotoReason: f.noPhotoReason || "",
        // A category typed under "Other" comes back as its text: show it as Other + the text.
        ...(KNOWN_CATEGORIES.includes(f.riskCategory) ? {} : { riskCategory: "OTHER", categoryOther: f.riskCategory }),
      }))
      : [blankFinding()]);
  const [removed, setRemoved] = useState([]);
  const [pests, setPests] = useState(() => splitPests(area?.zoneName).codes);
  const [otherPest, setOtherPest] = useState(() => splitPests(area?.zoneName).other);
  const [otherPestOn, setOtherPestOn] = useState(() => !!splitPests(area?.zoneName).other);
  const togglePest = (p) => setPests((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));
  const typedPests = otherPestOn ? otherPest.split(",").map((x) => x.trim()).filter(Boolean) : [];
  const zoneName = [...pests.map(titleCase), ...typedPests].join(", ");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState([]);

  const levels = lookups?.riskLevels || [];
  const categories = lookups?.riskCategories || [];
  const customerLabel = audit.customerActionLabel || "Customer action";

  const setF = (i, k, v) => setFindings((list) => list.map((f, idx) => (idx === i ? { ...f, [k]: v } : f)));
  const removeFinding = (i) => {
    const f = findings[i];
    if (!f.isNew && (f.photos?.length || f.voice?.length)) {
      setError("This finding has photos or voice notes and cannot be removed.");
      return;
    }
    if (!f.isNew) setRemoved((r) => [...r, f.id]);
    setFindings((list) => list.filter((_, idx) => idx !== i));
  };

  // Photos picked from the computer, per finding; uploaded after the area is saved.
  const addFiles = (i, list) => {
    const ok = [...(list || [])].filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type));
    if (ok.length < (list?.length || 0)) setError("Only JPEG, PNG or WebP photos can be added.");
    setFindings((all) => all.map((f, idx) => (idx === i ? { ...f, newFiles: [...(f.newFiles || []), ...ok] } : f)));
  };
  const dropFile = (i, k) =>
    setFindings((all) => all.map((f, idx) => (idx === i ? { ...f, newFiles: f.newFiles.filter((_, n) => n !== k) } : f)));
  const [progress, setProgress] = useState("");

  async function save(markCompleted) {
    setError("");
    setMissing([]);
    if (!form.areaName.trim()) return setError("Enter the area name");
    const noOther = findings.findIndex((f) => f.riskCategory === "OTHER" && !f.categoryOther?.trim());
    if (noOther >= 0) return setError(`Finding ${noOther + 1}: type the risk category (Other)`);
    setSaving(true);
    try {
      let current = form.rowVersion;
      if (current === undefined) {
        // New area: create it first (idempotent by id), then save its findings.
        const added = await auditsApi.addAreas(audit.id, [{ id: form.id, areaName: form.areaName, zoneName, notes: form.notes }]);
        current = added.areas[0].rowVersion;
      }
      // Photos waiting: save as a draft first (the findings must exist), upload, then complete.
      const queued = findings.filter((f) => f.newFiles?.length);
      let versions = {};
      if (queued.length) {
        const draft = await saveBody(current, false, versions);
        current = draft.area.rowVersion;
        versions = Object.fromEntries(draft.findings.map((s) => [s.id, s.rowVersion]));
        setRemoved([]);
        const failed = [];
        const total = queued.reduce((n, f) => n + f.newFiles.length, 0);
        let done = 0;
        for (const f of queued) {
          const left = [];
          for (const file of f.newFiles) {
            done += 1;
            setProgress(`Uploading photo ${done} of ${total}…`);
            try {
              await auditsApi.uploadPhoto(audit.id, f.id, file);
            } catch (err) {
              failed.push(`${file.name}: ${err.message}`);
              left.push(file);
            }
          }
          setFindings((all) => all.map((x) => (x.id === f.id ? { ...x, newFiles: left, isNew: false, rowVersion: versions[x.id] ?? x.rowVersion } : x)));
        }
        setProgress("");
        setForm((x) => ({ ...x, rowVersion: current }));
        if (failed.length) {
          setError(`Area saved, but some photos did not upload: ${failed.join(" · ")}`);
          setSaving(false);
          onSaved(false);
          return;
        }
        if (!markCompleted) return onSaved(true);
      }
      // After a draft save the removed findings are already gone.
      const res = await saveBody(current, markCompleted, versions, queued.length ? [] : removed);
      afterSave(res, markCompleted);
    } catch (err) {
      setProgress("");
      if (err.code === "VERSION_CONFLICT") {
        setError("Someone else saved this area while you were editing. Close this window and reopen the area to see their changes.");
      } else {
        setError(err.message);
      }
      setSaving(false);
    }
  }

  function afterSave(res, markCompleted) {
    if (markCompleted && res.missing?.length) {
      setMissing(res.missing);
      setForm((x) => ({ ...x, rowVersion: res.area.rowVersion }));
      setFindings((list) => list.map((f) => {
        const saved = res.findings.find((s) => s.id === f.id);
        return saved ? { ...f, isNew: false, rowVersion: saved.rowVersion } : f;
      }));
      setRemoved([]);
      setSaving(false);
      onSaved(false);
      return;
    }
    onSaved(true);
  }

  function saveBody(rowVersion, markCompleted, versions, removedIds = removed) {
    return auditsApi.saveArea(audit.id, form.id, {
        rowVersion,
        areaName: form.areaName,
        zoneName,
        // Also added to the audit's target pests (report cover).
        targetPests: [...pests, ...typedPests],
        notes: form.notes,
        markCompleted,
        findings: findings.map((f) => ({
          id: f.id,
          rowVersion: versions[f.id] ?? (f.isNew ? undefined : f.rowVersion),
          title: f.title,
          // "Other" is saved as the typed text (the same as the mobile app).
          riskCategory: f.riskCategory === "OTHER" && f.categoryOther?.trim() ? f.categoryOther.trim() : f.riskCategory,
          riskTypeText: f.riskTypeText,
          riskLevel: f.riskLevel,
          actionWithinDays: f.actionWithinDays === "" ? undefined : Number(f.actionWithinDays),
          observationText: f.observationText,
          customerActionText: f.customerActionText,
          bestserveActionText: f.bestserveActionText,
          noPhotoReason: f.noPhotoReason,
        })),
        removedFindingIds: removedIds,
      });
  }

  const missingText = missing.map((m) => {
    const [, idx, field] = m.match(/^findings\[(\d+)\]\.(\w+)$/) || [];
    if (idx !== undefined) return `Finding ${Number(idx) + 1}: ${FIELD_LABEL[field] || field}`;
    return FIELD_LABEL[m] || m;
  });

  return (
    <Modal
      wide
      title={isNew ? "Add area" : `Area ${String(area.areaNumber).padStart(2, "0")} — ${area.areaName}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="au-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="au-btn" onClick={() => save(false)} disabled={saving}>Save draft</button>
          <button type="button" className="au-btn au-btn-primary" onClick={() => save(true)} disabled={saving}>
            {saving ? progress || "Saving…" : "Save & mark completed"}
          </button>
        </>
      )}
    >
      <div className="au-form">
        <div className="au-grid2">
          <div className="au-field">
            <label>Area name *</label>
            <input className="au-input" value={form.areaName} maxLength={200}
              onChange={(e) => setForm({ ...form, areaName: e.target.value })} placeholder="e.g. Front yard" />
          </div>
          <div className="au-field">
            <label>Area notes</label>
            <input className="au-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="au-field">
          <label>Target pest</label>
          <div className="au-chips">
            {PEST_CODES.map((p) => (
              <button type="button" key={p} className={`au-chip ${pests.includes(p) ? "active" : ""}`} onClick={() => togglePest(p)}>
                {titleCase(p)}
              </button>
            ))}
            <button type="button" className={`au-chip ${otherPestOn ? "active" : ""}`} onClick={() => setOtherPestOn((v) => !v)}>
              {otherPestOn ? "Other ✓" : "＋ Other"}
            </button>
          </div>
          {otherPestOn && (
            <input className="au-input au-mt8" value={otherPest} onChange={(e) => setOtherPest(e.target.value)} maxLength={100}
              placeholder="Type the other pest, e.g. Lizards" />
          )}
        </div>

        {findings.map((f, i) => (
          <fieldset key={f.id} className="au-finding">
            <legend>
              Finding {f.findingNumber ? String(f.findingNumber).padStart(2, "0") : `(new ${i + 1})`}
              {findings.length > 1 && (
                <button type="button" className="au-link-danger" onClick={() => removeFinding(i)}>Remove</button>
              )}
            </legend>
            <div className="au-grid3">
              <div className="au-field au-span2">
                <label>Finding title (optional)</label>
                <input className="au-input" value={f.title} maxLength={250} placeholder="e.g. Renovation debris"
                  onChange={(e) => setF(i, "title", e.target.value)} />
              </div>
              <div className="au-field">
                <label>Risk level *</label>
                <div className="au-seg">
                  {levels.map((l) => (
                    <button type="button" key={l.code}
                      className={`au-seg-btn ${f.riskLevel === l.code ? `active au-seg-${l.code.toLowerCase()}` : ""}`}
                      onClick={() => setF(i, "riskLevel", l.code)}>{l.label}</button>
                  ))}
                </div>
              </div>
              <div className="au-field">
                <label>Risk category *</label>
                <select className="au-input" value={f.riskCategory} onChange={(e) => setF(i, "riskCategory", e.target.value)}>
                  {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                {f.riskCategory === "OTHER" && (
                  <input className="au-input au-mt8" value={f.categoryOther || ""} maxLength={50} placeholder="Type the risk category, e.g. Drain blockage"
                    onChange={(e) => setF(i, "categoryOther", e.target.value)} />
                )}
              </div>
              <div className="au-field">
                <label>Risk type (short)</label>
                <input className="au-input" value={f.riskTypeText} maxLength={250} placeholder="e.g. burrowing beside a patient area"
                  onChange={(e) => setF(i, "riskTypeText", e.target.value)} />
              </div>
              <div className="au-field">
                <label>Action within (days)</label>
                <input type="number" min={0} max={365} className="au-input" value={f.actionWithinDays}
                  placeholder={`Default: ${levels.find((l) => l.code === f.riskLevel)?.defaultDays ?? "monitor"}`}
                  onChange={(e) => setF(i, "actionWithinDays", e.target.value)} />
              </div>
            </div>
            <div className="au-field">
              <label>Observation *</label>
              <textarea className="au-input" rows={2} value={f.observationText} onChange={(e) => setF(i, "observationText", e.target.value)} />
            </div>
            <div className="au-grid2">
              <div className="au-field">
                <label>{customerLabel} *</label>
                <textarea className="au-input" rows={2} value={f.customerActionText} onChange={(e) => setF(i, "customerActionText", e.target.value)} />
              </div>
              <div className="au-field">
                <label>BestServe action *</label>
                <textarea className="au-input" rows={2} value={f.bestserveActionText} onChange={(e) => setF(i, "bestserveActionText", e.target.value)} />
              </div>
            </div>
            {f.actionDueDate && <div className="au-muted">Due: {fmtDate(f.actionDueDate)}</div>}
            <div className="au-field">
              <label>Photos</label>
              <div className="au-photos">
                {(f.photos || []).length > 0 && (
                  <span className="au-muted">{f.photos.length} photo{f.photos.length === 1 ? "" : "s"} already saved</span>
                )}
                {(f.newFiles || []).map((file, k) => (
                  <span key={`${file.name}-${k}`} className="au-file-chip">
                    {file.name}
                    <button type="button" className="au-link-danger" onClick={() => dropFile(i, k)} disabled={saving}>×</button>
                  </span>
                ))}
              </div>
              <label className={`au-btn au-btn-small au-btn-dashed au-mt8 ${saving ? "au-disabled" : ""}`}>
                + Upload photos from computer
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                  onChange={(e) => { addFiles(i, e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          </fieldset>
        ))}

        <button type="button" className="au-btn au-btn-dashed" onClick={() => setFindings((l) => [...l, blankFinding()])}>
          + Add another finding in this area
        </button>

        <div className="au-note">Photos you add here upload when you save (JPEG, PNG or WebP, up to 15 MB each). Voice notes are recorded in the mobile app.</div>

        {missingText.length > 0 && (
          <div className="au-warn">
            Saved as a draft. To mark it completed, fill in:
            <ul>{missingText.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        {error && <div className="au-error">{error}</div>}
      </div>
    </Modal>
  );
}

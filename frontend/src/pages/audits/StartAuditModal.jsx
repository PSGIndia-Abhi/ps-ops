import { useEffect, useState } from "react";
import { auditsApi, newId } from "./auditsApi";
import { Modal } from "./shared";
import { AUDIT_TYPE_LABEL, titleCase, todayIso } from "./format";

// Start a new audit: customer + site, date, type, escort (pests are picked per area).
// The logged-in user becomes the auditor (set by the server).
export default function StartAuditModal({ onClose, onCreated }) {
  const [lookups, setLookups] = useState(null);
  const [siteQuery, setSiteQuery] = useState("");
  const [siteOptions, setSiteOptions] = useState([]);
  const [site, setSite] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [useSuggested, setUseSuggested] = useState(true);
  const [form, setForm] = useState({
    auditDate: todayIso(),
    escortName: "",
    escortDesignation: "",
    escortContact: "",
    customerActionLabel: "Customer action",
    siteNotes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Audit types (one or more) and "Other" texts, the same as the mobile app.
  const [auditTypes, setAuditTypes] = useState(["PRE_SALE"]);
  const [otherType, setOtherType] = useState("");
  const otherTypeOn = auditTypes.includes("OTHER");
  const toggleType = (t) => setAuditTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  useEffect(() => {
    auditsApi.lookups().then(setLookups).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (site) return undefined;
    const t = setTimeout(() => {
      auditsApi.siteOptions(siteQuery).then((r) => setSiteOptions(r.items)).catch((e) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [siteQuery, site]);

  useEffect(() => {
    if (!site) return;
    auditsApi.areaSuggestions(site.siteId).then(setSuggested).catch(() => setSuggested(null));
  }, [site]);

  const chooseSite = (o) => { setSuggested(null); setSite(o); };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!site) return setError("Choose the customer site");
    if (!auditTypes.length) return setError("Choose at least one audit type");
    if (otherTypeOn && !otherType.trim()) return setError("Type the other audit type");
    setSaving(true);
    try {
      const areas = useSuggested && suggested?.areas?.length
        ? suggested.areas.map((a, i) => ({ id: newId(), areaNumber: i + 1, areaName: a.areaName, zoneName: a.zoneName }))
        : [];
      const created = await auditsApi.create({
        companyId: site.companyId,
        siteId: site.siteId,
        ...form,
        // "Other" is sent as the typed text.
        auditType: [...auditTypes.filter((t) => t !== "OTHER"), ...(otherTypeOn ? [otherType.trim()] : [])],
        areas,
      });
      onCreated(created.id);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Start new audit"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="au-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="au-start-form" className="au-btn au-btn-primary" disabled={saving}>
            {saving ? "Starting…" : "Start audit"}
          </button>
        </>
      )}
    >
      <form id="au-start-form" className="au-form" onSubmit={submit}>
        {error && <div className="au-error">{error}</div>}
        <div className="au-field">
          <label>Customer / site *</label>
          {site ? (
            <div className="au-chosen">
              <div>
                <div className="au-strong">{site.companyName}</div>
                <div className="au-muted">{site.siteName}{site.siteAddress ? ` · ${site.siteAddress}` : ""}</div>
              </div>
              <button type="button" className="au-btn au-btn-small" onClick={() => { chooseSite(null); setSiteQuery(""); }}>Change</button>
            </div>
          ) : (
            <>
              <input className="au-input" placeholder="Search customer, site or address" value={siteQuery}
                onChange={(e) => setSiteQuery(e.target.value)} autoFocus />
              <div className="au-options">
                {siteOptions.map((o) => (
                  <button type="button" key={o.siteId} className="au-option" onClick={() => chooseSite(o)}>
                    <span className="au-strong">{o.companyName}</span>
                    <span className="au-muted">{o.siteName}{o.siteAddress ? ` · ${o.siteAddress}` : ""}</span>
                  </button>
                ))}
                {!siteOptions.length && <div className="au-muted au-pad">No active sites found in your area.</div>}
              </div>
            </>
          )}
        </div>

        {suggested?.areas?.length > 0 && (
          <label className="au-check">
            <input type="checkbox" checked={useSuggested} onChange={(e) => setUseSuggested(e.target.checked)} />
            Copy {suggested.areas.length} areas from the last audit ({suggested.fromAuditNumber})
          </label>
        )}

        <div className="au-grid2">
          <div className="au-field">
            <label>Audit date *</label>
            <input type="date" className="au-input" value={form.auditDate} onChange={set("auditDate")} required />
          </div>
        </div>

        <div className="au-field">
          <label>Audit type * <span className="au-muted">(one or more)</span></label>
          <div className="au-chips">
            {(lookups?.auditTypes || ["ROUTINE"]).map((t) => (
              <button type="button" key={t} className={`au-chip ${auditTypes.includes(t) ? "active" : ""}`} onClick={() => toggleType(t)}>
                {t === "OTHER" ? (otherTypeOn ? "Other ✓" : "＋ Other") : AUDIT_TYPE_LABEL[t] || titleCase(t)}
              </button>
            ))}
          </div>
          {otherTypeOn && (
            <input className="au-input au-mt8" value={otherType} onChange={(e) => setOtherType(e.target.value)} maxLength={20}
              placeholder="Type the other audit type, e.g. Fumigation" autoFocus />
          )}
        </div>

        <div className="au-grid2">
          <div className="au-field">
            <label>Escort person (optional)</label>
            <input className="au-input" value={form.escortName} onChange={set("escortName")} maxLength={150} />
          </div>
          <div className="au-field">
            <label>Designation</label>
            <input className="au-input" value={form.escortDesignation} onChange={set("escortDesignation")} maxLength={100} />
          </div>
          <div className="au-field">
            <label>Contact number</label>
            <input className="au-input" value={form.escortContact} onChange={set("escortContact")} maxLength={20} />
          </div>
          <div className="au-field">
            <label>Customer action label (in report)</label>
            <input className="au-input" value={form.customerActionLabel} onChange={set("customerActionLabel")} maxLength={40}
              placeholder="e.g. Hospital action" />
          </div>
        </div>

        <div className="au-field">
          <label>Site notes</label>
          <textarea className="au-input" rows={2} value={form.siteNotes} onChange={set("siteNotes")} />
        </div>

      </form>
    </Modal>
  );
}

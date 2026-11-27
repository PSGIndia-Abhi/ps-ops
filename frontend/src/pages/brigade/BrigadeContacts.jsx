import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiOutlineUserGroup,
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineMagnifyingGlass,
  HiOutlinePhone,
  HiOutlineEnvelope,
  HiOutlineMapPin,
  HiOutlineXMark,
} from "react-icons/hi2";
import ConfirmDialog from "../../components/ConfirmDialog";
import StatusAlertModal from "../../components/StatusAlertModal";
import { brigadeRequest } from "./brigadeShared";
import "./brigade.css";

// Master Settings → Contacts. People at a Brigade property location (site).
// Uses the existing /api/contacts and /api/sites APIs; the backend limits a
// Brigade Executive to Brigade Group sites and contacts.
const EMPTY = { name: "", phone: "", email: "", role: "", site_id: "" };
const PHONE_RE = /^\+?\d{7,15}$/;

export default function BrigadeContacts() {
  const [contacts, setContacts] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [search, setSearch] = useState("");
  const [property, setProperty] = useState("");
  const [form, setForm] = useState(null); // null | { id?, ...EMPTY, is_primary }
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([brigadeRequest("/api/contacts"), brigadeRequest("/api/sites")]);
      setContacts(Array.isArray(c) ? c : []);
      setSites(Array.isArray(s) ? s : []);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Property names (companies) for the filter chips, from the Brigade sites.
  const properties = useMemo(() => [...new Set(sites.map((s) => s.company_name).filter(Boolean))].sort(), [sites]);

  const q = search.trim().toLowerCase();
  const rows = contacts.filter((c) => {
    if (property && c.company_name !== property) return false;
    if (!q) return true;
    return [c.name, c.phone, c.email, c.company_site, c.company_name].some((v) => String(v || "").toLowerCase().includes(q));
  });

  async function openEdit(c) {
    try {
      const full = await brigadeRequest(`/api/contacts/${c.id}`);
      setForm({
        id: c.id,
        name: full.name || "",
        phone: full.phone || "",
        email: full.email || "",
        role: full.role || "",
        site_id: full.company_id || "",
        is_primary: Boolean(full.is_primary),
      });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  const phoneBad = form && form.phone.trim() !== "" && !PHONE_RE.test(form.phone.replace(/[\s-]/g, ""));
  const emailBad = form && form.email.trim() !== "" && !/^\S+@\S+\.\S+$/.test(form.email.trim());

  async function save(e) {
    e.preventDefault();
    const name = form.name.trim();
    const phone = form.phone.replace(/[\s-]/g, "");
    if (!name) return setStatus({ type: "error", message: "Enter the contact name" });
    if (!phone || phoneBad) return setStatus({ type: "error", message: "Enter a valid phone number" });
    if (emailBad) return setStatus({ type: "error", message: "Enter a valid email or leave it empty" });
    if (!form.id && !form.site_id) return setStatus({ type: "error", message: "Choose the property location" });

    setSaving(true);
    try {
      const body = { name, phone, email: form.email.trim() || null, role: form.role.trim() || null, is_primary: Boolean(form.is_primary) };
      if (form.id) {
        await brigadeRequest(`/api/contacts/${form.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await brigadeRequest("/api/contacts", { method: "POST", body: JSON.stringify({ ...body, company_id: form.site_id }) });
      }
      setStatus({ type: "success", message: form.id ? "Contact updated" : `${name} added` });
      setForm(null);
      await load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    const c = confirmDelete;
    setConfirmDelete(null);
    try {
      await brigadeRequest(`/api/contacts/${c.id}`, { method: "DELETE" });
      setStatus({ type: "success", message: `${c.name} removed` });
      await load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  return (
    <div className="bg-page bdz bms">
      <section className="bdz-hero bms-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Master Settings</span>
            <h1>Contacts</h1>
            <p>People at each Brigade property location</p>
          </div>
          <button type="button" className="bms-add" onClick={() => setForm({ ...EMPTY, is_primary: false })} disabled={!sites.length}>
            <HiOutlinePlus aria-hidden="true" /> Add contact
          </button>
        </div>
        <div className="bms-hero-stats">
          <div><span>Contacts</span><b>{contacts.length}</b></div>
          <div><span>Locations</span><b>{sites.length}</b></div>
          <div><span>Properties</span><b>{properties.length}</b></div>
        </div>
      </section>

      {error && <div className="bg-error">{error}</div>}

      <section className="bdz-panel">
        <div className="bms-toolbar">
          <label className="bms-search">
            <HiOutlineMagnifyingGlass aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email or location" aria-label="Search contacts" />
          </label>
          {properties.length > 1 && (
            <select className="bms-select" value={property} onChange={(e) => setProperty(e.target.value)} aria-label="Property">
              <option value="">All properties</option>
              {properties.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>

        {loading && !contacts.length ? (
          <div className="bms-cards">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="bdz-skel" style={{ height: 132 }} />)}</div>
        ) : !sites.length ? (
          <div className="bg-empty-state">
            <strong>No property locations yet</strong>
            Add a location under Master Settings → Locations first.
          </div>
        ) : !rows.length ? (
          <div className="bms-empty">
            <span className="bms-empty-ico"><HiOutlineUserGroup aria-hidden="true" /></span>
            <strong>{contacts.length ? "No contacts match" : "No contacts yet"}</strong>
            {!contacts.length && <p>Add the first contact for a property location.</p>}
          </div>
        ) : (
          <div className="bms-cards">
            {rows.map((c) => (
              <article key={c.id} className={`bms-card`}>
                <div className="bms-card-top">
                  <span className="bms-avatar" aria-hidden="true">{initials(c.name)}</span>
                  <div className="bms-card-name">
                    <strong>{c.name}</strong>
                    <small><HiOutlineMapPin aria-hidden="true" /> {[c.company_site, c.company_name].filter(Boolean).join(" · ") || "—"}</small>
                  </div>
                  <div className="bms-card-acts">
                    <button type="button" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} title="Edit"><HiOutlinePencilSquare /></button>
                    <button type="button" className="danger" onClick={() => setConfirmDelete(c)} aria-label={`Remove ${c.name}`} title="Remove"><HiOutlineTrash /></button>
                  </div>
                </div>
                <div className="bms-card-lines">
                  <a href={`tel:${c.phone}`}><HiOutlinePhone aria-hidden="true" /> {c.phone}</a>
                  {c.email ? <a href={`mailto:${c.email}`}><HiOutlineEnvelope aria-hidden="true" /> {c.email}</a> : <span className="muted"><HiOutlineEnvelope aria-hidden="true" /> No email</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {form && (
        <div className="bms-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !saving && setForm(null)}>
          <form className="bms-dialog" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="bms-contact-title">
            <div className="bms-dialog-head">
              <div>
                <h3 id="bms-contact-title">{form.id ? "Edit contact" : "Add contact"}</h3>
                <p>{form.id ? "Change the contact details" : "Link a person to a Brigade property location"}</p>
              </div>
              <button type="button" className="bms-x" onClick={() => setForm(null)} aria-label="Close"><HiOutlineXMark /></button>
            </div>
            <div className="bms-dialog-body">
              <label className="wide">
                Property location {form.id ? "" : <i>*</i>}
                <select value={form.site_id} disabled={Boolean(form.id)} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))} autoFocus={!form.id}>
                  <option value="">Choose a location…</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.company_name} — {s.name}</option>)}
                </select>
                {form.id && <small>The location of an existing contact cannot be changed.</small>}
              </label>
              <label className="wide">
                Name <i>*</i>
                <input value={form.name} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus={Boolean(form.id)} autoComplete="off" />
              </label>
              <label>
                Phone <i>*</i>
                <input value={form.phone} type="tel" inputMode="tel" maxLength={16} aria-invalid={phoneBad} className={phoneBad ? "invalid" : ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile" />
              </label>
              <label>
                Email
                <input value={form.email} type="email" maxLength={160} aria-invalid={emailBad} className={emailBad ? "invalid" : ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Optional" />
              </label>
              <label>
                Role / designation
                <input value={form.role} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="e.g. Facility Manager" />
              </label>
              <label className="bms-check">
                <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))} />
                Primary contact for this location
              </label>
            </div>
            <div className="bms-dialog-foot">
              <button type="button" className="bms-btn ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="bms-btn" disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Add contact"}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Remove contact?"
        message={confirmDelete ? `${confirmDelete.name} will no longer appear in contact lists. Past bookings keep their contact.` : ""}
        confirmLabel="Remove"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
      <StatusAlertModal status={status} onClose={() => setStatus(null)} />
    </div>
  );
}

const initials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

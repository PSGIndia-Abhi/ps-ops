import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { FiArchive, FiCheckCircle, FiChevronDown, FiChevronRight, FiPhone, FiPlus, FiRotateCcw, FiSearch, FiX } from "react-icons/fi";
import { DataError, EmptyRow, Pager } from "./ui";
import { fetchTdsSettings, usePaged } from "./data";
import { archiveCustomerContact, fetchAllCustomerContacts, restoreCustomerContact, saveCustomerContact } from "./followups";
import "./accountant.css";

const tel = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

// Contacts: the accountant's own phone list (who to call about payments), for every
// customer in one place. Add, edit, set the primary number, archive and restore.
// These are the same numbers the reminder panel and the reminder page show; they are
// kept apart from the admin's Contacts page.
export default function CustomerContactsPage() {
  const [tab, setTab] = useState("active"); // "active" | "archived"
  const [rows, setRows] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const location = useLocation();
  // "View all" on a reminder page opens this page already searched for that customer.
  const [search, setSearch] = useState(location.state?.search || "");
  const [form, setForm] = useState(null); // null = closed, {} = new, or the contact being edited
  const [archiving, setArchiving] = useState(null); // the contact the "Archive?" dialog is open for
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const archived = tab === "archived";

  const load = useCallback(async () => {
    try {
      const [active, old] = await Promise.all([fetchAllCustomerContacts(false), fetchAllCustomerContacts(true)]);
      setRows(archived ? old : active);
      setArchivedCount(old.length);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the contacts");
    } finally {
      setLoading(false);
    }
  }, [archived]);

  useEffect(() => {
    load();
  }, [load]);

  // The customers a number can be added for (the same list the TDS page uses).
  useEffect(() => {
    let cancelled = false;
    fetchTdsSettings().then((list) => { if (!cancelled) setCustomers(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // One line per customer: its primary number, with the customer's other numbers folded
  // under it (rows arrive grouped by customer, primary first). Archived numbers are listed
  // one by one. A search keeps the customers where anything matches, and opens a customer
  // whose match is one of the folded numbers.
  const shown = useMemo(() => {
    const groups = [];
    for (const r of rows) {
      const last = groups[groups.length - 1];
      if (!archived && last && last.customer_id === r.customer_id) last.rest.push(r);
      else groups.push({ key: archived ? r.id : r.customer_id, customer_id: r.customer_id, main: r, rest: [], found: false });
    }
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    const digits = needle.replace(/\D/g, "");
    const hit = (r) => r.name.toLowerCase().includes(needle) || (r.email || "").toLowerCase().includes(needle) ||
      (digits && String(r.phone).replace(/\D/g, "").includes(digits));
    return groups
      .map((g) => ({ ...g, found: g.rest.some(hit) }))
      .filter((g) => g.found || hit(g.main) || `${g.main.customer_name} ${g.main.customer_code || ""}`.toLowerCase().includes(needle));
  }, [rows, search, archived]);
  const { pageRows, page, setPage, pageSize } = usePaged(shown);
  const [openIds, setOpenIds] = useState({}); // customers whose other numbers are showing
  const toggle = (g, isOpen) => setOpenIds((o) => ({ ...o, [g.key]: !isOpen }));

  async function run(action, message) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await action();
      await load();
      setNotice(message);
      return true;
    } catch (err) {
      setActionError(err.message || "That did not work. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ac-page ac-contacts-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">Contacts</h2>
          <p className="ac-sub">Who to call about payments, for each customer</p>
        </div>
        <div className="ac-actions">
          <div className="ac-search">
            <FiSearch />
            <input className="ac-input" placeholder="Search customer, name or number" value={search} aria-label="Search contacts"
              onChange={(e) => { setSearch(e.target.value); setPage(0); setOpenIds({}); }} />
          </div>
          <button type="button" className="ac-btn ac-btn-primary" onClick={() => setForm({})}><FiPlus /> Add Contact</button>
        </div>
      </div>

      <DataError error={error} onRetry={load} />
      {actionError && <div className="ac-info error" role="alert"><span>{actionError}</span></div>}
      {notice && <div className="ac-info ok" role="status"><FiCheckCircle style={{ flexShrink: 0 }} /><span>{notice}</span></div>}

      <div className="ac-card">
        <div className="ac-tabs" style={{ marginBottom: 14 }}>
          <button type="button" className={`ac-tab ${!archived ? "active" : ""}`} onClick={() => { setTab("active"); setPage(0); }}>Active</button>
          <button type="button" className={`ac-tab ${archived ? "active" : ""}`} onClick={() => { setTab("archived"); setPage(0); }}>
            Archived{archivedCount ? ` (${archivedCount})` : ""}
          </button>
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead><tr><th>Customer</th><th>Contact Name</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead>
            <tbody>
              {pageRows.length ? pageRows.flatMap((g) => {
                // openIds remembers a click either way; untouched, a customer opens when the search found
                // one of its folded numbers, or narrowed the list down to that one customer
                const isOpen = openIds[g.key] ?? (g.found || (Boolean(search.trim()) && shown.length === 1));
                return [{ r: g.main, g }, ...(isOpen ? g.rest.map((r) => ({ r, g: null })) : [])].map(({ r, g: head }) => (
                <tr key={r.id} className={head ? "" : "ac-contacts-sub"}>
                  <td>
                    {head ? (
                      <>
                        {r.customer_name}{r.customer_code ? <span className="ac-contact-muted"> ({r.customer_code})</span> : ""}
                        {head.rest.length > 0 && (
                          <button type="button" className="ac-link ac-contacts-more" aria-expanded={isOpen} onClick={() => toggle(head, isOpen)}
                            aria-label={`${isOpen ? "Hide" : "Show"} ${head.rest.length} other number${head.rest.length === 1 ? "" : "s"} for ${r.customer_name}`}>
                            {isOpen ? <FiChevronDown /> : <FiChevronRight />} {isOpen ? "Hide" : `+${head.rest.length} more`}
                          </button>
                        )}
                      </>
                    ) : <span className="ac-contact-muted">{r.customer_name}</span>}
                  </td>
                  <td>{r.name}{r.is_primary && <span className="ac-contact-tag">Primary</span>}</td>
                  <td>{archived ? r.phone : <a className="ac-link ac-contacts-phone" href={tel(r.phone)}><FiPhone /> {r.phone}</a>}</td>
                  <td className="ac-contacts-email">
                    {!r.email ? <span className="ac-contact-muted">—</span> : archived ? r.email : <a className="ac-link" href={`mailto:${r.email}`}>{r.email}</a>}
                  </td>
                  <td>
                    <div className="ac-actions ac-contacts-actions">
                      {archived ? (
                        <button type="button" className="ac-btn ac-btn-sm" disabled={busy}
                          onClick={() => run(() => restoreCustomerContact(r.customer_id, r.id), `${r.name} was restored.`)}>
                          <FiRotateCcw /> Restore
                        </button>
                      ) : (
                        <>
                          <button type="button" className="ac-btn ac-btn-sm ac-contacts-edit" disabled={busy} onClick={() => setForm(r)}>Edit</button>
                          <button type="button" className="ac-btn ac-btn-sm ac-contacts-archive" disabled={busy} onClick={() => setArchiving(r)}>Archive</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                ));
              }) : (
                <EmptyRow cols={5} loading={loading}
                  text={search.trim() ? "No contact matches your search" : archived ? "No archived contacts" : "No contacts yet — use Add Contact to save a customer's number"} />
              )}
            </tbody>
          </table>
        </div>
        <Pager total={shown.length} pageSize={pageSize} page={page} onPage={setPage} />
      </div>

      {form && (
        <ContactDialog
          contact={form.id ? form : null}
          customers={customers}
          onClose={() => setForm(null)}
          onSaved={async (name) => { setForm(null); await load(); setActionError(""); setNotice(`${name} was saved.`); }}
        />
      )}

      {archiving && (
        <div className="ac-overlay" onMouseDown={() => !busy && setArchiving(null)}>
          <div className="ac-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Archive this contact?</h3>
            <p className="ac-sub" style={{ fontSize: 14 }}>
              {archiving.name} ({archiving.phone}) will be hidden from {archiving.customer_name}. Nothing is deleted: you can bring it back from the Archived tab.
              {archiving.is_primary ? " It is the primary number, so the customer's next number becomes primary." : ""}
            </p>
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn" onClick={() => setArchiving(null)} disabled={busy}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-primary" disabled={busy}
                onClick={async () => {
                  const ok = await run(() => archiveCustomerContact(archiving.customer_id, archiving.id), `${archiving.name} was archived.`);
                  if (ok) setArchiving(null);
                }}>
                <FiArchive /> {busy ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Add a number (the customer is chosen here) or edit one (the customer stays as it is).
function ContactDialog({ contact, customers, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState(contact?.customer_id || "");
  const [name, setName] = useState(contact?.name || "");
  const [phone, setPhone] = useState(contact?.phone || "");
  const [email, setEmail] = useState(contact?.email || "");
  const [primary, setPrimary] = useState(Boolean(contact?.is_primary));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (!customerId) return setError("Please choose the customer.");
    if (!name.trim()) return setError("Please enter the contact's name.");
    if (digits.length < 10 || digits.length > 15) return setError("Please enter a valid phone number (at least 10 digits).");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Please enter a valid email address, or leave it empty.");
    setSaving(true);
    setError("");
    try {
      await saveCustomerContact(customerId, { id: contact?.id, name, phone, email, primary });
      await onSaved(name.trim());
    } catch (err) {
      setError(err.message || "The contact could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="ac-overlay" onMouseDown={() => !saving && onClose()}>
      <form className="ac-modal ac-fu-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="ac-fu-modal-head">
          <h3>{contact ? "Edit Contact" : "Add Contact"}</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={onClose}><FiX /></button>
        </div>
        {error && <div className="ac-info error" style={{ marginBottom: 12 }} role="alert"><span>{error}</span></div>}
        <div className="ac-fu-form">
          <div className="ac-field">
            <label>Customer *</label>
            {contact ? (
              <input className="ac-input" value={`${contact.customer_name}${contact.customer_code ? ` (${contact.customer_code})` : ""}`} disabled aria-label="Customer" />
            ) : (
              <select className="ac-select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer" autoFocus>
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
              </select>
            )}
          </div>
          <div className="ac-grid-2">
            <div className="ac-field">
              <label>Contact name *</label>
              <input className="ac-input" value={name} maxLength={150} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi (Accounts)" aria-label="Contact name" />
            </div>
            <div className="ac-field">
              <label>Phone number *</label>
              <input className="ac-input" type="tel" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} placeholder="e.g. 98450 12345" aria-label="Phone number" />
            </div>
          </div>
          <div className="ac-field">
            <label>Email (optional)</label>
            <input className="ac-input" type="email" inputMode="email" value={email} maxLength={150} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. accounts@customer.com" aria-label="Email" />
          </div>
          <label className="ac-checkline">
            <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Set as primary contact
          </label>
          <p className="ac-sub">A customer's first number becomes its primary number automatically.</p>
        </div>
        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="ac-btn ac-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Contact"}</button>
        </div>
      </form>
    </div>
  );
}

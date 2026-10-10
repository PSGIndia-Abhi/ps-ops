import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiEdit2, FiPhone, FiPlus } from "react-icons/fi";
import CallDialog from "./CallDialog";
import { saveCustomerContact } from "../../pages/accountant/followups";
import "../../pages/accountant/accountant.css";

const tel = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;
const initials = (name) =>
  String(name || "").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

// The accountant's own phone numbers for a customer, with add and edit. They are linked
// straight to the customer and kept apart from the admin's Contacts page.
//   customerId: the customer the numbers belong to
//   data: what fetchCustomerContact() returned ({ contacts }); null while loading
//   onSaved(): reload `data` after a contact was saved
//   variant "panel": the Contact section of the reminder side panel (a card per contact)
//   variant "line":  the Phone row of the reminder page: only the primary number, with a link
//                    to the Contacts page for the rest (customerName is what it searches for)
export default function CustomerContacts({ customerId, customerName, data, onSaved, variant = "panel" }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null); // null = closed, "new", or the contact being edited
  const [calling, setCalling] = useState(null); // the contact the Call pop-up is open for

  if (data == null) return variant === "line" ? "…" : null;

  const contacts = data.contacts || [];
  const closed = editing == null;

  const form = !closed && (
    <ContactForm
      key={editing === "new" ? "new" : editing.id}
      customerId={customerId}
      contact={editing === "new" ? null : editing}
      first={!contacts.length}
      onCancel={() => setEditing(null)}
      onSaved={async () => { setEditing(null); await onSaved?.(); }}
    />
  );

  if (variant === "line") {
    const main = contacts[0];
    return (
      <div className="ac-contact-line">
        {main ? (
          <>
            {/* only the number to call first (the primary one), however many are saved */}
            <span className="ac-contact-line-row">
              <a className="ac-link" href={tel(main.phone)}><FiPhone /> {main.phone}</a>
              <span className="ac-contact-muted">· {main.name}</span>
              {main.is_primary && <span className="ac-contact-tag">Primary</span>}
              {closed && <button type="button" className="ac-link ac-contact-link" onClick={() => setEditing(main)}><FiEdit2 /> Edit</button>}
            </span>
            {closed && (
              <span className="ac-contact-line-row">
                <button type="button" className="ac-link ac-contact-link" onClick={() => setEditing("new")}><FiPlus /> Add another</button>
                {contacts.length > 1 && (
                  <button type="button" className="ac-link ac-contact-link" onClick={() => navigate("/accountant/contacts", { state: { search: customerName || "" } })}>
                    View all ({contacts.length})
                  </button>
                )}
              </span>
            )}
          </>
        ) : (
          <span className="ac-contact-line-row">
            <span className="ac-contact-muted">No phone number saved</span>
            {closed && <button type="button" className="ac-link ac-contact-link" onClick={() => setEditing("new")}><FiPlus /> Add phone</button>}
          </span>
        )}
        {form}
      </div>
    );
  }

  return (
    <section className="ac-contact">
      <div className="ac-drawer-row">
        <h4 className="ac-drawer-title">Contact</h4>
        {contacts.length > 0 && closed && (
          <button type="button" className="ac-link ac-contact-link" onClick={() => setEditing("new")}><FiPlus /> Add another</button>
        )}
      </div>

      {contacts.length ? (
        <ul className="ac-contact-list">
          {contacts.map((c) => (
            <li key={c.id}>
              <span className="ac-contact-avatar" aria-hidden="true">{initials(c.name)}</span>
              <div className="ac-contact-main">
                <strong>{c.name}{c.is_primary && <span className="ac-contact-tag">Primary</span>}</strong>
                <span>{c.phone}</span>
              </div>
              <div className="ac-contact-actions">
                <button type="button" className="ac-btn ac-btn-sm ac-contact-call" onClick={() => setCalling(c)}><FiPhone /> Call</button>
                <button type="button" className="ac-btn ac-btn-sm" onClick={() => setEditing(c)}><FiEdit2 /> Edit</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ac-contact-empty">
          <span>No phone number saved for this customer</span>
          {closed && <button type="button" className="ac-link ac-contact-link" onClick={() => setEditing("new")}><FiPlus /> Add phone</button>}
        </div>
      )}
      {form}
      {calling && <CallDialog name={calling.name} customer={customerName} phone={calling.phone} onClose={() => setCalling(null)} />}
    </section>
  );
}

function ContactForm({ customerId, contact, first, onCancel, onSaved }) {
  const [name, setName] = useState(contact?.name || "");
  const [phone, setPhone] = useState(contact?.phone || "");
  const [primary, setPrimary] = useState(contact ? Boolean(contact.is_primary) : first);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (!name.trim()) return setError("Please enter the contact's name.");
    if (digits.length < 10 || digits.length > 15) return setError("Please enter a valid phone number (at least 10 digits).");
    setSaving(true);
    setError("");
    try {
      await saveCustomerContact(customerId, { id: contact?.id, name, phone, primary });
      await onSaved();
    } catch (err) {
      setError(err.message || "The contact could not be saved.");
      setSaving(false);
    }
  }

  return (
    <form className="ac-contact-form" onSubmit={submit} noValidate>
      {error && <div className="ac-info error" role="alert"><span>{error}</span></div>}
      <div className="ac-contact-fields">
        <div className="ac-field">
          <label>Contact name *</label>
          <input className="ac-input" value={name} maxLength={150} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi (Accounts)" aria-label="Contact name" autoFocus />
        </div>
        <div className="ac-field">
          <label>Phone number *</label>
          <input className="ac-input" type="tel" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} placeholder="e.g. 98450 12345" aria-label="Phone number" />
        </div>
      </div>
      <label className="ac-checkline">
        <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Set as primary contact
      </label>
      <div className="ac-actions ac-contact-form-foot">
        <button type="button" className="ac-btn ac-btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="ac-btn ac-btn-primary ac-btn-sm" disabled={saving}>{saving ? "Saving…" : "Save Contact"}</button>
      </div>
    </form>
  );
}

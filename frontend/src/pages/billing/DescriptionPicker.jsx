import { useState } from "react";
import { billingPost, billingPut, useBilling } from "./billingApi";

// "Description on invoice" for a contract: a dropdown of the master list (Masters > Invoice
// Descriptions) with Edit and New right beside it, so a wording can be fixed or added without
// leaving the contract. The list is shared: editing a wording changes it on every contract using it.

const PLACEHOLDERS = ["{month}", "{period}", "{from_month}", "{to_month}"];

// onListChanged: called after a wording is saved (an edit also updates the contracts using it,
// so an open contract should reload before it is saved again).
export default function DescriptionPicker({ value, onChange, onListChanged, canEdit = false, disabled = false }) {
  const { data: list, reload } = useBilling("/descriptions?active=true");
  const [mode, setMode] = useState(null); // null | "edit" | "new"
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const items = list || [];
  const current = items.find((d) => d.text === value) || null;

  function open(next) {
    setMode(next);
    setText(next === "edit" ? current?.text || "" : "");
    setError("");
  }

  async function save() {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return;
    setBusy(true);
    setError("");
    try {
      const saved = mode === "edit" ? await billingPut(`/descriptions/${current.id}`, { text: t }) : await billingPost("/descriptions", { text: t });
      reload();
      onChange(saved.text);
      onListChanged?.();
      setMode(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (mode) {
    // Other contracts using this wording (this one is counted too when it is already saved with it).
    const others = mode === "edit" ? Number(current?.contracts || 0) : 0;
    return (
      <div className="dp-edit">
        <input className="ac-input" autoFocus value={text} maxLength={500} placeholder="e.g. Pest control services for the month of {month}"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setMode(null); }} />
        <div className="bl-chipbar">
          {PLACEHOLDERS.map((p) => <button key={p} type="button" className="bl-chip" onClick={() => setText(`${text}${p}`)}>{p}</button>)}
        </div>
        {mode === "edit" && others > 0 && <div className="dp-warn">⚠ This wording is used by {others} contract{others === 1 ? "" : "s"}; saving changes it on all of them.</div>}
        {error && <div className="dp-error">{error}</div>}
        <div className="ac-actions">
          <button type="button" className="ac-btn sm ac-btn-primary" disabled={busy || !text.trim()} onClick={save}>{busy ? "Saving…" : mode === "edit" ? "Save wording" : "Add and use"}</button>
          <button type="button" className="ac-btn sm" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dp-row">
      <select className="ac-select" value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{list ? "Choose the description…" : "Loading…"}</option>
        {items.map((d) => <option key={d.id} value={d.text}>{d.text}</option>)}
        {/* a contract's own description stays selectable even if it was switched off in the list */}
        {value && !current && <option value={value}>{value}</option>}
      </select>
      {canEdit && !disabled && (
        <>
          <button type="button" className="ac-btn" disabled={!current} title={current ? "Edit this wording" : "Choose a description first"} onClick={() => open("edit")}>✎ Edit</button>
          <button type="button" className="ac-btn" title="Add a new wording" onClick={() => open("new")}>+ New</button>
        </>
      )}
    </div>
  );
}

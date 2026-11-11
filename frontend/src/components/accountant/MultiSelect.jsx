import { useEffect, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import "../../pages/accountant/accountant.css";

// A dropdown where several options can be ticked. It has a search box, and a Clear link.
// Clicking outside or pressing Escape closes it.
//   options:  ["AK Castle", ...] or [{ value: "PARTIAL", label: "Partially Paid" }, ...]
//   value / onChange(list): the ticked values ([] = nothing ticked, shown as allLabel)
//   searchable: show the search box (default: only when there are more than 8 options)
export default function MultiSelect({ options, value, onChange, allLabel = "All", ariaLabel, searchable }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef(null);

  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const labelOf = (v) => items.find((o) => o.value === v)?.label ?? v;
  const showSearch = searchable ?? items.length > 8;
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((o) => o.label.toLowerCase().includes(q)) : items;
  const ticked = new Set(value);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (box.current && !box.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function toggle(v) {
    onChange(ticked.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  const label = value.length === 0 ? allLabel : value.length === 1 ? labelOf(value[0]) : `${value.length} selected`;

  return (
    <div ref={box} style={{ position: "relative", minWidth: 0 }} onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); close(); } }}>
      <button type="button" className="ac-select" aria-label={ariaLabel} aria-expanded={open} title={value.map(labelOf).join(", ")}
        onClick={() => (open ? close() : setOpen(true))}
        style={{ textAlign: "left", cursor: "pointer", paddingRight: 34, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </button>
      <FiChevronDown aria-hidden="true"
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748b" }} />
      {open && (
        <div style={{ position: "absolute", zIndex: 30, left: 0, top: "calc(100% + 4px)", minWidth: "100%", width: 280, maxWidth: "90vw",
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 12px 28px rgba(15, 23, 42, 0.15)" }}>
          <div style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
            {showSearch && <input className="ac-input" autoFocus placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 6 }} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#64748b" }}>
              <span>{value.length} selected</span>
              <button type="button" className="ac-link" disabled={!value.length} onClick={() => onChange([])}>Clear</button>
            </div>
          </div>
          <ul role="listbox" aria-multiselectable="true" style={{ maxHeight: 260, overflowY: "auto", margin: 0, padding: 4, listStyle: "none" }}>
            {shown.length ? shown.map((o) => (
              <li key={o.value} role="option" aria-selected={ticked.has(o.value)}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 14 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  <input type="checkbox" checked={ticked.has(o.value)} onChange={() => toggle(o.value)} />
                  {o.label}
                </label>
              </li>
            )) : (
              <li style={{ padding: "8px 10px", color: "#64748b", fontSize: 14 }}>{q ? `No match for "${query.trim()}"` : "Nothing to choose"}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

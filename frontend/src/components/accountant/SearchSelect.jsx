import { useEffect, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import "../../pages/accountant/accountant.css";

// A dropdown that can also be searched. Typing filters the list; arrow keys move, Enter picks,
// Escape closes. Clicking outside closes it too.
//   options:  [{ value, label, search? }]  (`search` = extra text matched besides the label, e.g. an id)
//   value / onChange(value): the chosen option's value ("" = nothing chosen)
//   allLabel: when given, a first option with that label that sets the value to "" (e.g. "All customers")
export default function SearchSelect({ options, value, onChange, placeholder = "Search or select", allLabel = "", ariaLabel, listId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef(null);

  const selected = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => `${o.label} ${o.search || ""}`.toLowerCase().includes(q)) : options;
  const shown = allLabel && !q ? [{ value: "", label: allLabel }, ...matches] : matches;

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

  function pick(o) {
    onChange(o.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && shown[active]) {
        e.preventDefault();
        pick(shown[active]);
      }
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      setQuery("");
    }
  }

  const shownText = selected ? selected.label : allLabel;

  return (
    <div ref={box} style={{ position: "relative" }}>
      <input
        className="ac-input"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        placeholder={shownText || placeholder}
        value={open ? query : shownText}
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
        style={{ width: "100%", boxSizing: "border-box", paddingRight: 34 }}
      />
      <FiChevronDown aria-hidden="true"
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748b" }} />
      {open && (
        <ul id={listId} role="listbox"
          style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "calc(100% + 4px)", maxHeight: 240, overflowY: "auto",
            margin: 0, padding: 4, listStyle: "none", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.15)" }}>
          {shown.length ? shown.map((o, i) => (
            <li key={o.value || "__all"} role="option" aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 14,
                background: i === active ? "#eff6ff" : "transparent", fontWeight: o.value === value ? 600 : 400 }}>
              {o.label}
            </li>
          )) : (
            <li style={{ padding: "8px 10px", color: "#64748b", fontSize: 14 }}>No match for "{query.trim()}"</li>
          )}
        </ul>
      )}
    </div>
  );
}

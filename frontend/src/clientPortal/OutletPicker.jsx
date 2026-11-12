import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineMapPin, HiOutlineChevronDown, HiOutlineCheck, HiOutlineMagnifyingGlass, HiOutlineBuildingStorefront } from "react-icons/hi2";

// Styled outlet dropdown (replaces the browser's native select).
// value "" = all outlets.
export default function OutletPicker({ outlets, value, onChange, className = "", align = "left" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = outlets.filter((o) => !q || [o.name, o.city, o.id].some((v) => v && String(v).toLowerCase().includes(q)));
    return [{ id: "", name: "All outlets", city: `${outlets.length} outlet${outlets.length === 1 ? "" : "s"}`, all: true }, ...list];
  }, [outlets, query]);

  const selected = outlets.find((o) => o.id === value);
  const label = selected ? selected.name || selected.id : `All outlets (${outlets.length})`;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    setOpen((o) => {
      if (!o) {
        setQuery("");
        setActive(Math.max(0, options.findIndex((x) => x.id === value)));
        setTimeout(() => searchRef.current?.focus(), 0);
      }
      return !o;
    });
  }

  function choose(id) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      toggle();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[active]) choose(options[active].id); }
  }

  return (
    <div className={`cp-picker ${open ? "open" : ""} ${className}`} ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" className="cp-picker-trigger" onClick={toggle} aria-haspopup="listbox" aria-expanded={open} title="Filter by outlet">
        <HiOutlineMapPin className="cp-picker-pin" aria-hidden="true" />
        <span className="cp-picker-label">{label}</span>
        <HiOutlineChevronDown className="cp-picker-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className={`cp-picker-menu align-${align}`} role="listbox" aria-label="Outlets">
          {outlets.length > 6 && (
            <label className="cp-picker-search">
              <HiOutlineMagnifyingGlass aria-hidden="true" />
              <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder="Search outlet" />
            </label>
          )}
          <ul>
            {options.map((o, i) => {
              const isSel = o.id === value;
              return (
                <li key={o.id || "all"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    className={`cp-picker-option ${isSel ? "selected" : ""} ${i === active ? "active" : ""} ${o.all ? "all" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o.id)}
                  >
                    <span className="cp-picker-icon">{o.all ? <HiOutlineBuildingStorefront /> : <HiOutlineMapPin />}</span>
                    <span className="cp-picker-text">
                      <strong>{o.name || o.id}</strong>
                      {o.city && <small>{o.city}</small>}
                    </span>
                    {isSel && <HiOutlineCheck className="cp-picker-check" aria-hidden="true" />}
                  </button>
                  {o.all && options.length > 1 && <div className="cp-picker-sep" />}
                </li>
              );
            })}
            {options.length === 1 && query && <li className="cp-picker-empty">No outlet matches “{query}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

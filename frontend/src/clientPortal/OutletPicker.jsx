import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineMapPin, HiOutlineChevronDown, HiOutlineCheck, HiOutlineMagnifyingGlass, HiOutlineBuildingStorefront } from "react-icons/hi2";

// Styled outlet dropdown: always has a search box (name, area/address, city) and lists the
// outlets grouped by region (city). value "" = all outlets.
const regionOf = (o) => String(o.city || o.state || "").trim() || "Other";

export default function OutletPicker({ outlets, value, onChange, className = "", align = "left" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  // Matching outlets grouped by region; "All outlets" is always the first option.
  const { groups, flat } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = outlets.filter((o) => !q || [o.name, o.address, o.city, o.state, o.id].some((v) => v && String(v).toLowerCase().includes(q)));
    const byRegion = new Map();
    for (const o of list) {
      const r = regionOf(o);
      if (!byRegion.has(r)) byRegion.set(r, []);
      byRegion.get(r).push(o);
    }
    const sorted = [...byRegion.entries()]
      .sort(([a], [b]) => (a === "Other") - (b === "Other") || a.localeCompare(b))
      .map(([region, items]) => ({ region, items: items.sort((x, y) => String(x.name || "").localeCompare(String(y.name || ""))) }));
    const all = { id: "", name: "All outlets", city: `${outlets.length} outlet${outlets.length === 1 ? "" : "s"}`, all: true };
    return { groups: sorted, flat: [all, ...sorted.flatMap((g) => g.items)] };
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
        setActive(0);
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
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[active]) choose(flat[active].id); }
  }

  const option = (o, i) => {
    const isSel = o.id === value;
    return (
      <li key={o.id || "all"}>
        <button
          type="button" role="option" aria-selected={isSel}
          className={`cp-picker-option ${isSel ? "selected" : ""} ${i === active ? "active" : ""} ${o.all ? "all" : ""}`}
          onMouseEnter={() => setActive(i)} onClick={() => choose(o.id)}
        >
          <span className="cp-picker-icon">{o.all ? <HiOutlineBuildingStorefront /> : <HiOutlineMapPin />}</span>
          <span className="cp-picker-text">
            <strong>{o.name || o.id}</strong>
            {o.all ? <small>{o.city}</small> : (o.address || o.city) && <small title={o.address || o.city}>{o.address || o.city}</small>}
          </span>
          {isSel && <HiOutlineCheck className="cp-picker-check" aria-hidden="true" />}
        </button>
      </li>
    );
  };

  let index = 0;
  return (
    <div className={`cp-picker ${open ? "open" : ""} ${className}`} ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" className="cp-picker-trigger" onClick={toggle} aria-haspopup="listbox" aria-expanded={open} title="Filter by outlet">
        <HiOutlineMapPin className="cp-picker-pin" aria-hidden="true" />
        <span className="cp-picker-label">{label}</span>
        <HiOutlineChevronDown className="cp-picker-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className={`cp-picker-menu align-${align}`} role="listbox" aria-label="Outlets">
          <label className="cp-picker-search">
            <HiOutlineMagnifyingGlass aria-hidden="true" />
            <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder="Search outlet, area or city" aria-label="Search outlets" />
          </label>
          <ul>
            {option(flat[0], index++)}
            {groups.length > 0 && <div className="cp-picker-sep" />}
            {groups.map((g) => (
              <li key={g.region} className="cp-picker-region">
                <span className="cp-picker-region-label">{g.region} <i>{g.items.length}</i></span>
                <ul>{g.items.map((o) => option(o, index++))}</ul>
              </li>
            ))}
            {groups.length === 0 && query && <li className="cp-picker-empty">No outlet matches “{query}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiChevronDown, FiSearch, FiUsers, FiX } from "react-icons/fi";

// Customer filter: a drop-down with checkboxes. Customers are listed under their group with their
// outlets underneath; ticking a group ticks all its customers. Search, Select all and Clear.
// options: [{ id, name, group, outlets }]   value: [ids] - empty = all customers   onChange(ids)

const NO_GROUP = "Other customers";

export default function CustomerFilter({ options, value, onChange, label = "customers" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const picked = useMemo(() => new Set(value || []), [value]);
  // No options yet (loading, or nothing to pick) counts as "all customers".
  const all = !options.length || picked.size === 0 || (!picked.has("__none__") && picked.size >= options.length);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const term = search.trim().toLowerCase();
  const shown = term ? options.filter((o) => `${o.name} ${o.group || ""} ${o.outlets || ""}`.toLowerCase().includes(term)) : options;
  const groups = useMemo(() => {
    const map = new Map();
    for (const o of shown) {
      const g = o.group || NO_GROUP;
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(o);
    }
    return [...map.entries()].sort(([a], [b]) => (a === NO_GROUP) - (b === NO_GROUP) || a.localeCompare(b));
  }, [shown]);

  // "All" is stored as an empty list, so a new customer is included automatically.
  const isOn = (id) => all || picked.has(id);
  const commit = (set) => onChange(set.size === 0 || set.size >= options.length ? [] : [...set]);
  const current = () => new Set(all ? options.map((o) => o.id) : picked);
  const toggle = (id) => {
    const set = current();
    if (set.has(id)) set.delete(id);
    else set.add(id);
    if (set.size === 0) onChange(["__none__"]); // nothing ticked: show nothing until something is picked
    else commit(set);
  };
  const toggleGroup = (items) => {
    const set = current();
    const every = items.every((o) => set.has(o.id));
    for (const o of items) {
      if (every) set.delete(o.id);
      else set.add(o.id);
    }
    if (set.size === 0) onChange(["__none__"]);
    else commit(set);
  };
  const none = options.length > 0 && picked.has("__none__");
  const count = none ? 0 : all ? options.length : picked.size;
  const text = none ? `No ${label} selected` : all ? `All ${label}` : count === 1 ? options.find((o) => picked.has(o.id))?.name || `1 ${label.replace(/s$/, "")}` : `${count} of ${options.length} ${label}`;

  return (
    <div className="cf" ref={ref}>
      <button type="button" className={`cf-trigger ${!all || none ? "on" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} disabled={!options.length} title={!options.length ? "No customers to filter yet" : undefined}>
        <FiUsers className="cf-ic" />
        <span className="cf-text">{text}</span>
        {(!all || none) && <span className="cf-badge">{count}</span>}
        <FiChevronDown className={`cf-chev ${open ? "up" : ""}`} />
      </button>
      {open && (
        <div className="cf-pop" role="listbox" aria-multiselectable="true">
          <div className="cf-search">
            <FiSearch />
            <input autoFocus value={search} placeholder={`Search ${label}, group or outlet…`} onChange={(e) => setSearch(e.target.value)} aria-label={`Search ${label}`} />
            {search && <button type="button" className="cf-x" onClick={() => setSearch("")} aria-label="Clear search"><FiX /></button>}
          </div>
          <div className="cf-actions">
            <button type="button" onClick={() => onChange([])}>Select all</button>
            <button type="button" onClick={() => onChange(["__none__"])}>Clear</button>
            <span>{count} selected</span>
          </div>
          <div className="cf-list">
            {!groups.length && <div className="cf-empty">No match</div>}
            {groups.map(([g, items]) => {
              const on = items.filter((o) => !none && isOn(o.id)).length;
              const state = on === 0 ? "" : on === items.length ? "all" : "some";
              return (
                <div key={g} className="cf-group">
                  <button type="button" className="cf-grow" onClick={() => toggleGroup(items)}>
                    <span className={`cf-box ${state}`}>{state === "all" ? <FiCheck /> : state === "some" ? <span className="cf-dash" /> : null}</span>
                    <span className="cf-gname">{g}</span>
                    <span className="cf-gcount">{items.length}</span>
                  </button>
                  {items.map((o) => {
                    const checked = !none && isOn(o.id);
                    return (
                      <button key={o.id} type="button" role="option" aria-selected={checked} className="cf-row" onClick={() => (none ? onChange([o.id]) : toggle(o.id))}>
                        <span className={`cf-box ${checked ? "all" : ""}`}>{checked && <FiCheck />}</span>
                        <span className="cf-main"><b>{o.name}</b>{o.outlets && <span>{o.outlets}</span>}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="cf-foot"><button type="button" className="ac-btn ac-btn-primary sm" onClick={() => setOpen(false)}>Done</button></div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiSearch, FiX } from "react-icons/fi";

/**
 * One field to search and choose a customer: type to filter, pick from the list underneath
 * (mouse or arrow keys + Enter). customers: [{ id, name, sites }]; value: the chosen id.
 */
export default function CustomerPicker({ customers, value, onChange }) {
  const chosen = customers?.find((c) => c.id === value) || null;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (customers || []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [customers, text]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(c) {
    onChange(c.id);
    setText("");
    setOpen(false);
  }

  function onKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setText("");
    }
  }

  const showText = open ? text : chosen?.name || "";

  return (
    <div className="fb-picker" ref={box}>
      <div className={`fb-picker-box ${open ? "is-open" : ""}`}>
        <FiSearch aria-hidden="true" className="fb-muted" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="fb-picker-list"
          aria-label="Customer"
          className="fb-picker-input"
          placeholder={customers ? `Search or choose from ${customers.length} customers` : "Loading customers…"}
          value={showText}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        {chosen && !open ? (
          <button type="button" className="fb-picker-icon" aria-label="Clear the customer" onClick={() => onChange("")}>
            <FiX />
          </button>
        ) : (
          <button type="button" className="fb-picker-icon" aria-label="Show customers" tabIndex={-1} onClick={() => setOpen((o) => !o)}>
            <FiChevronDown />
          </button>
        )}
      </div>
      {open && (
        <ul className="fb-picker-list" id="fb-picker-list" role="listbox" ref={listRef}>
          {matches.length ? (
            matches.map((c, i) => (
              <li
                key={c.id}
                data-i={i}
                role="option"
                aria-selected={c.id === value}
                className={`${i === active ? "is-active" : ""} ${c.id === value ? "is-chosen" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
              >
                <span className="fb-strong">{c.name}</span>
                <span className="fb-small fb-muted">
                  {c.sites.length === 1 ? `${c.sites[0].name}${c.sites[0].city ? ` · ${c.sites[0].city}` : ""}` : `${c.sites.length} sites`}
                </span>
              </li>
            ))
          ) : (
            <li className="fb-picker-empty">No customer matches "{text}"</li>
          )}
        </ul>
      )}
    </div>
  );
}

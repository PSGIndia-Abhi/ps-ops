import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiChevronDown, FiSearch, FiX } from "react-icons/fi";
import {
  MdPestControl, MdPestControlRodent, MdCleaningServices, MdLayers, MdElectricalServices, MdPlumbing, MdFormatPaint, MdAutoAwesome,
} from "react-icons/md";
import { GiBugNet, GiBeetleShell, GiAnt, GiBed, GiFly, GiBee, GiSnake, GiGecko, GiHouse, GiWaterDrop, GiSmokeBomb, GiSpray } from "react-icons/gi";

// Icon + colour for a service, picked from words in its name. First match wins.
const VISUALS = [
  { test: /general pest/i, Icon: MdPestControl, tone: "green" },
  { test: /mosquito/i, Icon: GiBugNet, tone: "blue" },
  { test: /cockroach/i, Icon: GiBeetleShell, tone: "orange" },
  { test: /\bant\b/i, Icon: GiAnt, tone: "orange" },
  { test: /bed bug/i, Icon: GiBed, tone: "orange" },
  { test: /\bfly\b/i, Icon: GiFly, tone: "orange" },
  { test: /bee/i, Icon: GiBee, tone: "amber" },
  { test: /rodent/i, Icon: MdPestControlRodent, tone: "violet" },
  { test: /snake/i, Icon: GiSnake, tone: "violet" },
  { test: /lizard/i, Icon: GiGecko, tone: "violet" },
  { test: /termite/i, Icon: GiHouse, tone: "brown" },
  { test: /drainage/i, Icon: GiWaterDrop, tone: "teal" },
  { test: /fumigation/i, Icon: GiSmokeBomb, tone: "slate" },
  { test: /clean|scrub|sticker|debris/i, Icon: MdCleaningServices, tone: "blue" },
  { test: /floor/i, Icon: MdLayers, tone: "teal" },
  { test: /electrical/i, Icon: MdElectricalServices, tone: "amber" },
  { test: /plumbing/i, Icon: MdPlumbing, tone: "teal" },
  { test: /paint/i, Icon: MdFormatPaint, tone: "violet" },
];
const visualFor = (name) => VISUALS.find((v) => v.test.test(name)) || { Icon: GiSpray, tone: "slate" };

const HEADERS = {
  PEST: { title: "Pest control services", Icon: MdPestControl, tone: "green" },
  DEEP: { title: "Cleaning services", Icon: MdCleaningServices, tone: "blue" },
  BOTH: { title: "All services", Icon: MdAutoAwesome, tone: "violet" },
};

// Multi-select dropdown for services: cards (2 per row) with a service icon and a round tick,
// a search box, and a footer with "N selected", Clear all and Done.
// Chosen services show as green pill tags in the box (✕ removes one).
export default function ServiceMultiSelect({ options, value, onChange, type = "PEST", placeholder = "Select services…" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const head = HEADERS[type] || HEADERS.PEST;
  const HeadIcon = head.Icon;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Close on a click outside or on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openList() {
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function toggle(service) {
    onChange(value.includes(service) ? value.filter((s) => s !== service) : [...value, service]);
  }

  return (
    <div className={`cp-ms ${open ? "open" : ""}`} ref={rootRef}>
      <div className="cp-ms-field" onClick={() => (open ? setOpen(false) : openList())}>
        {value.length === 0 && <span className="cp-ms-placeholder">{placeholder}</span>}
        {value.map((s) => {
          const v = visualFor(s);
          const Icon = v.Icon;
          return (
            <span key={s} className="cp-ms-tag" title={s}>
              <span className="cp-ms-tag-icon" aria-hidden="true"><Icon /></span>
              <span className="cp-ms-tag-text">{s}</span>
              <button type="button" aria-label={`Remove ${s}`} onClick={(e) => { e.stopPropagation(); toggle(s); }}>
                <FiX aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <button
          type="button" className="cp-ms-toggle" aria-haspopup="listbox" aria-expanded={open}
          aria-label={open ? "Close the services list" : "Open the services list"}
          onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else openList(); }}
        >
          <FiChevronDown aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="cp-ms-panel">
          <div className="cp-ms-head">
            <span className={`cp-ms-head-icon tone-${head.tone}`} aria-hidden="true"><HeadIcon /></span>
            <span className="cp-ms-head-text">
              <strong>{head.title}</strong>
              <small>Tick everything you need — you can pick several</small>
            </span>
            <span className="cp-ms-count">{value.length} of {options.length} selected</span>
          </div>
          <label className="cp-ms-search">
            <FiSearch aria-hidden="true" />
            <input ref={searchRef} type="search" placeholder="Search services…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search services" />
          </label>
          <ul className="cp-ms-grid" role="listbox" aria-multiselectable="true" aria-label={head.title}>
            {shown.map((s) => {
              const on = value.includes(s);
              const v = visualFor(s);
              const Icon = v.Icon;
              return (
                <li key={s} role="option" aria-selected={on}>
                  <label className={`cp-ms-card ${on ? "on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(s)} />
                    <span className={`cp-ms-icon tone-${v.tone}`} aria-hidden="true"><Icon /></span>
                    <span className="cp-ms-name">{s}</span>
                    <span className="cp-ms-tick" aria-hidden="true">{on && <FiCheck />}</span>
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li className="cp-ms-none">No service matches “{query}”.</li>}
          </ul>
          <div className="cp-ms-foot">
            <span><b>{value.length}</b> service{value.length === 1 ? "" : "s"} selected</span>
            <button type="button" className="cp-ms-clear" onClick={() => onChange([])} disabled={!value.length}>Clear all</button>
            <button type="button" className="cp-ms-done" onClick={() => setOpen(false)}><FiCheck aria-hidden="true" /> Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

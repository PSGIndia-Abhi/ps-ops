import { useEffect, useId, useRef, useState } from "react";
import { useBilling } from "./billingApi";

// "Description on invoice" for a contract: one text box with its own dropdown. Clicking the box (or ▼)
// shows every saved wording (Masters > Invoice Descriptions), whatever is already in the box; typing
// narrows the list. A typed wording is added to the list when the contract is saved, so it can be
// picked next time. {month}, {period}, {from_month} and {to_month} are filled in on each invoice.
// (A browser <datalist> was used before, but it only showed wordings matching the text already in the
// box - with a suggested wording filled in, that was just the one.)

export default function DescriptionPicker({ value, onChange, disabled = false }) {
  const { data: list } = useBilling("/descriptions?active=true");
  const listId = useId();
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // typed since opening: filter the list by the text
  const [active, setActive] = useState(-1);
  const items = list || [];
  const text = value || "";

  const q = text.replace(/\s+/g, " ").trim().toLowerCase();
  const shown = typed && q ? items.filter((d) => d.text.toLowerCase().includes(q)) : items;

  const show = () => {
    if (disabled) return;
    setTyped(false);
    setActive(Math.max(0, items.findIndex((d) => d.text === text)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const pick = (d) => {
    onChange(d.text);
    close();
  };

  // close when clicking anywhere outside
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // the box wraps and grows to show the whole wording (no "…" cut-off)
  useEffect(() => {
    const fit = () => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text]);

  // keep the highlighted wording in view
  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      if (!shown.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i < 0 ? (step > 0 ? 0 : shown.length - 1) : (i + step + shown.length) % shown.length));
    } else if (e.key === "Enter") {
      // one line on the invoice: Enter picks the highlighted wording, never adds a new line
      e.preventDefault();
      if (open && shown[active]) pick(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") close();
  };

  return (
    <div className="dp-combo" ref={wrapRef}>
      <textarea
        ref={inputRef}
        rows={1}
        className="ac-input dp-text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 && shown[active] ? `${listId}-${active}` : undefined}
        value={text}
        disabled={disabled}
        maxLength={500}
        autoComplete="off"
        placeholder={list ? "Type or choose the description" : "Loading…"}
        onClick={() => !open && show()}
        onChange={(e) => {
          onChange(e.target.value.replace(/[\r\n]+/g, " ")); // pasted line breaks become spaces
          setTyped(true);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          const tidy = e.target.value.replace(/\s+/g, " ").trim();
          if (tidy !== e.target.value) onChange(tidy);
        }}
      />
      <button
        type="button"
        className="dp-caret"
        tabIndex={-1}
        disabled={disabled}
        aria-label={open ? "Close the list" : "Show saved descriptions"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) close();
          else {
            show();
            inputRef.current?.focus();
          }
        }}
      >
        ▾
      </button>
      {open && (
        <ul className="dp-menu" id={listId} role="listbox" ref={listRef}>
          {!list && <li className="dp-empty">Loading…</li>}
          {list && !shown.length && <li className="dp-empty">{items.length ? "No saved wording matches. This new wording is saved with the contract." : "No saved descriptions yet. Type one; it is saved with the contract."}</li>}
          {shown.map((d, i) => (
            <li
              key={d.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={d.text === text}
              className={`dp-opt ${i === active ? "is-active" : ""} ${d.text === text ? "is-chosen" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(d)}
            >
              {d.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

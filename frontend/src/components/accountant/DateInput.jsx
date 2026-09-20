import { useState } from "react";
import { FiCalendar } from "react-icons/fi";
import "../../pages/accountant/accountant.css";

// A date box that always shows dd/mm/yyyy, whatever the browser's region setting is.
//   value: "YYYY-MM-DD" or ""      onChange(value): called with "YYYY-MM-DD", or "" when the box is cleared or incomplete
// You can type the date (slashes are added for you) or pick it from the calendar button.

const pad = (n) => String(n).padStart(2, "0");

// "2026-09-19" -> "19/09/2026"
const toDisplay = (ymd) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd || "") ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "");

// "19/09/2026" -> "2026-09-19", or "" when it is not a real date (e.g. 31/02/2026)
function toYmd(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const real = d.getFullYear() === Number(yyyy) && d.getMonth() === Number(mm) - 1 && d.getDate() === Number(dd);
  return real ? `${yyyy}-${pad(Number(mm))}-${pad(Number(dd))}` : "";
}

// Keeps only digits and adds the slashes: "19092026" -> "19/09/2026"
function mask(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function DateInput({ value = "", onChange, ariaLabel, style }) {
  const [draft, setDraft] = useState(null); // what the user is typing, until it is a complete valid date

  function type(e) {
    const text = mask(e.target.value);
    const ymd = toYmd(text);
    if (ymd) {
      setDraft(null);
      onChange(ymd);
    } else {
      setDraft(text);
      if (value) onChange(""); // an unfinished date must not keep filtering with the old one
    }
  }

  return (
    <div className="ac-date" style={style}>
      <input
        className={`ac-input ac-date-text${draft ? " invalid" : ""}`}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={draft ?? toDisplay(value)}
        onChange={type}
        aria-label={ariaLabel}
      />
      <span className="ac-date-btn" aria-hidden="true"><FiCalendar /></span>
      {/* The browser's own calendar sits invisibly over the icon, so a click opens it directly */}
      <input
        className="ac-date-native"
        type="date"
        aria-label={`${ariaLabel || "Date"}: open calendar`}
        value={value}
        onChange={(e) => { setDraft(null); onChange(e.target.value); }}
      />
    </div>
  );
}

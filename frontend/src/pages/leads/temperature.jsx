// Hot / Warm / Cold - how interested the customer is. Separate from the lead's stage.
// Set by the people who own leads (sales executive on their own leads; sales manager, MD, PA and
// admin on any). Optional. Every change lands on the lead's Activities tab.
// Same design as the Android app: three compact cards, a "What's this" popup, a small "Saved".
import { useEffect, useRef, useState } from "react";
import { FiCheck, FiCheckCircle, FiHelpCircle, FiSun, FiX } from "react-icons/fi";
import { dateTime } from "./format";
import { TEMPERATURE_KEYS, TEMPERATURE_LABEL, setLeadTemperature } from "./leadsApi";
import { useToast } from "./hooks";

const Flame = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5c.6 3.2 4.8 5.6 4.8 10.4A4.8 4.8 0 0 1 12 17.7a4.8 4.8 0 0 1-4.8-4.8c0-2.2 1.1-3.6 2.2-4.8.3 1.6 1.2 2.6 2.1 3 0-3.1-.4-6 .5-8.6Z" />
    <path d="M8 20.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
  </svg>
);
const Snow = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.5 4.2 12 6.5l2.5-2.3M9.5 19.8 12 17.5l2.5 2.3" />
  </svg>
);
const ICON = { HOT: <Flame />, WARM: <FiSun />, COLD: <Snow /> };

const MEANING = {
  HOT: { title: "Ready to take the service", text: "Wants to start soon, asked for the quotation or the price is agreed.", next: "Call again tomorrow" },
  WARM: { title: "Interested, not yet ready", text: "Likes the service but is comparing prices or asked to call back later.", next: "Call again in 3-7 days" },
  COLD: { title: "Not interested right now", text: "Not needed now, no response, or only asking for prices.", next: "Call again in a month" },
};

/** The small coloured tag on a lead row. Nothing when not set. */
export function TemperatureChip({ value }) {
  if (!TEMPERATURE_KEYS.includes(value)) return null;
  return (
    <span className={`lm-temp-chip ${value.toLowerCase()}`} title={`${TEMPERATURE_LABEL[value]} lead`}>
      {ICON[value]}
      {TEMPERATURE_LABEL[value]}
    </span>
  );
}

/** "What's this" popup: what Hot, Warm and Cold mean. */
function TemperatureHelp({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="lm-temp-help-back" onClick={onClose} role="presentation">
      <div className="lm-temp-help" role="dialog" aria-modal="true" aria-label="Hot, Warm or Cold" onClick={(e) => e.stopPropagation()}>
        <div className="lm-temp-help-top">
          <button type="button" className="lm-temp-help-x" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
          <small>CUSTOMER INTEREST</small>
          <h3>Hot, Warm or Cold?</h3>
          <p>Mark how ready the customer is to take the service after you talk to them.</p>
        </div>
        <div className="lm-temp-help-body">
          {TEMPERATURE_KEYS.map((k) => (
            <div key={k} className={`lm-temp-help-item ${k.toLowerCase()}`}>
              <span className="lm-temp-help-icon">{ICON[k]}</span>
              <div>
                <strong>{TEMPERATURE_LABEL[k]}</strong>
                <em>{MEANING[k].title}</em>
                <p>{MEANING[k].text}</p>
                <span className="lm-temp-help-next">{MEANING[k].next}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="lm-temp-help-note">Optional - change it any time. Click the selected one again to clear it.</p>
        <button type="button" className="lm-temp-help-ok" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

/**
 * The three cards on the lead page, with who set it last. Read-only (just the current one) for
 * someone who may not change it; hidden entirely when it is not set and cannot be set.
 */
export function TemperaturePicker({ lead, canSet }) {
  const toast = useToast();
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState(false);
  const [help, setHelp] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const current = lead.temperature;
  if (!canSet && !current) return null;

  const pick = async (key) => {
    const next = key === current ? null : key; // clicking the chosen one again clears it
    setSaving(key);
    setSaved(false);
    try {
      await setLeadTemperature(lead.id, next);
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      toast(err.message || "Could not save Hot / Warm / Cold.", true);
    } finally {
      setSaving("");
    }
  };

  const setBy = current && lead.temperatureBy ? `Set by ${lead.temperatureBy}${lead.temperatureAt ? ` · ${dateTime(lead.temperatureAt.replace(" ", "T"))}` : ""}` : canSet ? "Not marked yet" : "";

  return (
    <div className="lm-temp">
      <div className="lm-temp-head">
        <span className="lm-temp-overline">Customer interest</span>
        <button type="button" className="lm-temp-what" onClick={() => setHelp(true)}>
          <FiHelpCircle /> What&apos;s this
        </button>
      </div>
      <div className="lm-temp-options" role="radiogroup" aria-label="Hot, warm or cold">
        {TEMPERATURE_KEYS.filter((k) => canSet || k === current).map((key) => {
          const on = current === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              className={`lm-temp-btn ${key.toLowerCase()}${on ? " on" : ""}${saving && saving !== key ? " dim" : ""}`}
              disabled={!canSet || !!saving}
              onClick={() => pick(key)}
              title={canSet ? (on ? "Click again to clear" : `Mark ${TEMPERATURE_LABEL[key]}`) : undefined}
            >
              <span className="lm-temp-ico">{saving === key ? <span className="lm-temp-spin" /> : ICON[key]}</span>
              <span className="lm-temp-name">{TEMPERATURE_LABEL[key]}</span>
              {on && <FiCheck className="lm-temp-tick" />}
            </button>
          );
        })}
      </div>
      <div className="lm-temp-foot">
        <small>{setBy}</small>
        <span className={`lm-temp-saved${saved ? " show" : ""}`} aria-live="polite">
          <FiCheckCircle /> Saved
        </span>
      </div>
      {help && <TemperatureHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

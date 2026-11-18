// Hot / Warm / Cold - how interested the customer is. Separate from the lead's stage.
// Set by the people who own leads (sales executive on their own leads; sales manager, MD, PA and
// admin on any). Optional. Every change lands on the lead's Activities tab.
import { useState } from "react";
import { dateTime } from "./format";
import { TEMPERATURE_KEYS, TEMPERATURE_LABEL, setLeadTemperature } from "./leadsApi";
import { useToast } from "./hooks";

/** The small coloured tag on a lead card / row. Nothing when not set. */
export function TemperatureChip({ value }) {
  if (!TEMPERATURE_KEYS.includes(value)) return null;
  return (
    <span className={`lm-temp-chip ${value.toLowerCase()}`} title={`${TEMPERATURE_LABEL[value]} lead`}>
      <i />
      {TEMPERATURE_LABEL[value]}
    </span>
  );
}

/**
 * The three buttons on the lead page, with who set it last. Read-only (just the current tag) for
 * someone who may not change it; hidden entirely when it is not set and cannot be set.
 */
export function TemperaturePicker({ lead, canSet }) {
  const toast = useToast();
  const [saving, setSaving] = useState("");
  const current = lead.temperature;
  if (!canSet && !current) return null;

  const pick = async (key) => {
    const next = key === current ? null : key; // tapping the chosen one again clears it
    setSaving(key);
    try {
      await setLeadTemperature(lead.id, next);
      toast(next ? `Marked ${TEMPERATURE_LABEL[next]}` : "Hot / Warm / Cold cleared");
    } catch (err) {
      toast(err.message || "Could not save Hot / Warm / Cold.", true);
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="lm-temp">
      <div className="lm-temp-head">
        <strong>How interested is the customer?</strong>
        {current && lead.temperatureBy && (
          <small>
            Set by {lead.temperatureBy}
            {lead.temperatureAt ? ` · ${dateTime(lead.temperatureAt.replace(" ", "T"))}` : ""}
          </small>
        )}
      </div>
      <div className="lm-temp-options" role="radiogroup" aria-label="Hot, warm or cold">
        {TEMPERATURE_KEYS.map((key) => {
          const on = current === key;
          if (!canSet && !on) return null;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              className={`lm-temp-btn ${key.toLowerCase()}${on ? " on" : ""}`}
              disabled={!canSet || !!saving}
              onClick={() => pick(key)}
              title={canSet ? (on ? "Tap again to clear" : `Mark ${TEMPERATURE_LABEL[key]}`) : undefined}
            >
              <i />
              {saving === key ? "Saving..." : TEMPERATURE_LABEL[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useId } from "react";
import { useBilling } from "./billingApi";

// "Description on invoice" for a contract: one text box. Pick a wording from the list underneath
// (Masters > Invoice Descriptions) or type a new one; a typed wording is added to the list when the
// contract is saved, so it can be picked next time. {month}, {period}, {from_month} and {to_month}
// are filled in on each invoice.

export default function DescriptionPicker({ value, onChange, disabled = false }) {
  const { data: list } = useBilling("/descriptions?active=true");
  const listId = useId();
  const items = list || [];

  return (
    <>
      <input
        className="ac-input"
        list={listId}
        value={value || ""}
        disabled={disabled}
        maxLength={500}
        placeholder={list ? "Type or choose the description" : "Loading…"}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const tidy = e.target.value.replace(/\s+/g, " ").trim();
          if (tidy !== e.target.value) onChange(tidy);
        }}
      />
      <datalist id={listId}>
        {items.map((d) => (
          <option key={d.id} value={d.text} />
        ))}
      </datalist>
    </>
  );
}

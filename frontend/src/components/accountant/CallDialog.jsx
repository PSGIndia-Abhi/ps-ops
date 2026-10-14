import { useState } from "react";
import { FiPhone, FiX } from "react-icons/fi";
import "../../pages/accountant/accountant.css";

// Call Customer on the web: shows who to call and the number, to dial from a phone or copy.
// (No tel: link: on a computer it only opens the system's "choose an app" prompt.)
//   name / customer: the contact and the customer they belong to (either may be empty)
//   hint: an extra sentence after "Dial this number from your phone."
export default function CallDialog({ name, customer, phone, hint = "", onClose }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  // stopPropagation: inside the reminder side panel, a click here must not also close the panel
  return (
    <div className="ac-overlay" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="ac-modal ac-fu-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ac-fu-modal-head">
          <h3>Call Customer</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={onClose}><FiX /></button>
        </div>
        <p className="ac-sub" style={{ marginBottom: 4 }}>{[name, customer].filter(Boolean).join(" · ") || "Customer"}</p>
        <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>{phone}</p>
        <div className="ac-note info" style={{ marginBottom: 4 }}>
          <FiPhone /> Dial this number from your phone.{hint ? ` ${hint}` : ""}
        </div>
        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={onClose}>Close</button>
          <button type="button" className="ac-btn ac-btn-primary" onClick={copy}>{copied ? "Copied" : "Copy Number"}</button>
        </div>
      </div>
    </div>
  );
}

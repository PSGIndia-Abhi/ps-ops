// The default email that goes with a quotation (Share > Email): a greeting to the contact person,
// the company overview with our client list, and the signature of whoever is signed in.
// The Android app has the same text in mobile/src/leads/proposalEmail.ts - keep the two alike.

import { industryLabel } from "./constants";

const CLIENTS = [
  "LSG Sky Chefs (India) Pvt. Ltd",
  "Taj SATS Air Catering Ltd",
  "MTR Foods",
  "NKP Empire Ventures Pvt. Ltd.",
  "Loyal Hospitality Pvt. Ltd. (Kitchens @)",
  "Swiggy Kitchens",
  "Rameshwaram Cafe",
  "TOIT Brewpubs",
  "Chai Days",
  "MakeMyTrip (India) Pvt. Ltd. – Corporate office",
  "Organic Industries Pvt. Ltd. – Manufacturing & warehouses",
  "Health & Glow – Retail outlets & offices",
  "Narayana Health Group – Hospitals & Clinics",
  "Narayana Nethralaya – Eye hospitals",
  "Cadabams Hospital Group – Hospitals, diagnostics & clinics",
  "Dr. B.R. Ambedkar Medical College & Hospital",
  "SDS Rajiv Gandhi Hospital",
  "The Director (DRDO - Chitradurga)",
  "NU Hospital Private Limited",
  "Hotel Dhruvatare",
  "Promount",
  "Adarsh Builder",
  "Kalpataru",
  "Nimhans Hospital",
];

/**
 * The proposal email for a lead.
 * lead: { company, contact, industry } - industry is the lead's code ("restaurant", ...); "other" is left out.
 * sender: the signed-in user { name, phone }.
 */
export function proposalEmail(lead, sender) {
  const company = (lead.company || "").trim();
  const contact = (lead.contact || "").trim();
  const industry = lead.industry && lead.industry !== "other" ? industryLabel(lead.industry) : "";
  const place = [company, industry].filter(Boolean).join(" ") || "premises";
  const signature = ["Best Regards,", sender?.name?.trim(), sender?.phone?.trim() ? `Ph : ${sender.phone.trim()}` : ""].filter(Boolean);

  const body = [
    contact ? `Dear ${contact} Ji,` : "Dear Sir/Madam,",
    "",
    "Greetings from Bestserve Pest Management Pvt Ltd",
    "",
    `Please find the attached Pest Control Proposal for your ${place}.`,
    "",
    "Company Overview",
    "",
    "Bestserve Pest Management Pvt. Ltd. is a professionally managed pest control organization with over 14+ years of proven experience in delivering integrated pest management (IPM) solutions across healthcare, hospitality, food processing, aviation catering, retail, corporate offices, and manufacturing facilities.",
    "",
    "We currently serve more than 400 corporate clients. Few of the following reputed organizations are:",
    "",
    ...CLIENTS,
    "",
    "Looking forward to working together.",
    ...signature,
  ].join("\n");

  return { subject: `Pest Control Proposal${company ? ` - ${company}` : ""} - Bestserve Pest Management Pvt. Ltd.`, body };
}

/** Gmail's compose window with the email written in. */
export const gmailCompose = (to, { subject, body }) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to || "")}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** Downloads the company profile (frontend/public/BestServe_Company_Profile.pdf) to attach with the quotation. */
export function downloadCompanyProfile() {
  const a = document.createElement("a");
  a.href = "/BestServe_Company_Profile.pdf";
  a.download = "BestServe_Company_Profile.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Fixed lists the Lead Management screens are built on: the pipeline stages,
// the choices offered in its forms, and how the server's values read on screen.

export const STAGES = [
  { key: "NEW", label: "New", tone: "info" },
  { key: "TO_CALL", label: "To Call", tone: "warn" },
  { key: "NEED_MORE_INFO", label: "Need More Info", tone: "violet" },
  { key: "QUALIFIED", label: "Qualified", tone: "success" },
  { key: "MEETING_SCHEDULED", label: "Meeting Scheduled", tone: "info" },
  { key: "VISIT_COMPLETED", label: "Visit Completed", tone: "teal" },
  { key: "QUOTATION_SENT", label: "Quotation Sent", tone: "violet" },
  { key: "WON", label: "Converted", tone: "success" },
  { key: "LOST", label: "Lost", tone: "danger" },
  { key: "NOT_GENUINE", label: "Not Genuine", tone: "danger" },
];

/** The happy path, in order - drives the progress stepper on a lead. */
export const PIPELINE = ["NEW", "QUALIFIED", "MEETING_SCHEDULED", "VISIT_COMPLETED", "QUOTATION_SENT", "WON"];

/**
 * What staff may choose as the source when adding a lead. These are exactly
 * the values POST /api/crm/leads accepts for a commercial lead.
 */
export const FORM_SOURCES = [
  { value: "google", label: "Google" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "other", label: "Other" },
];

/** A lead a provider submits always carries this source (a row of the server's lead-source list). */
export const PROVIDER_SOURCE = "Lead Provider";

/** Every source a lead can show, for the list filter: the staff values above plus the provider-portal ones. */
export const SOURCES = ["Lead Provider", "Field Visit", "Referral", "Website", "Google", "Social Media", "Existing Client Reference", "Other"];

/** The stored source as it reads on screen ("social_media" -> "Social Media"). */
export function sourceLabel(raw) {
  if (!raw) return "Other";
  const staff = FORM_SOURCES.find((s) => s.value === String(raw).toLowerCase());
  return staff ? staff.label : String(raw);
}

export const REASONS = {
  NOT_GENUINE: ["Duplicate lead", "Invalid contact number", "Unreachable after 3 attempts", "Already a vendor / customer", "Not a real enquiry"],
  LOST: ["Not interested", "Budget issue", "Competitor selected", "Quotation rejected", "Postponed indefinitely"],
};

export const VISIT_OUTCOMES = ["Quotation provided", "Customer interested", "Need follow-up", "Not interested"];

/** Outcomes the mobile app can save for a visit, so one recorded there reads correctly here too. */
export const KNOWN_VISIT_OUTCOMES = [...VISIT_OUTCOMES, "Customer not interested", "Close deal", "Cancel lead"];

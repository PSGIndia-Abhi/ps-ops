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
 * The fixed source codes POST /api/crm/leads has always accepted (the mobile app sends these).
 * The forms offer the lead source master instead; this list is only the fallback when the
 * master cannot be read, and how an old code reads on screen.
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

/**
 * A commercial lead's industry comes from the Industry Types master (GET /api/crm/industry-types),
 * which leadsApi reads with the workspace and hands over with setIndustryTypes(). These seven are
 * only the fallback for when it cannot be read.
 * Each type: { value: code, label: name, word: agreement word, active }.
 */
const BUILT_IN_INDUSTRY_TYPES = [
  { value: "restaurant", label: "Restaurant", word: "Restaurant", active: true },
  { value: "apartment", label: "Apartment", word: "Apartment", active: true },
  { value: "hospital", label: "Hospital", word: "Hospital", active: true },
  { value: "it", label: "IT", word: "IT", active: true },
  { value: "qsr", label: "QSR", word: "QSR", active: true },
  { value: "builder", label: "Builder", word: "Builder", active: true },
  { value: "other", label: "Other", word: "Company", active: true },
];
let industryTypes = BUILT_IN_INDUSTRY_TYPES;

/** Takes the master's rows ({ code, name, agreement_word, is_active }, already in order). */
export function setIndustryTypes(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  industryTypes = rows.map((r) => ({ value: r.code, label: r.name, word: r.agreement_word, active: r.is_active !== false }));
}

/** What the lead form offers: the active types, plus `current` if the lead has a switched-off one. */
export const industryOptions = (current = "") => industryTypes.filter((o) => o.active || o.value === current);

/** A type's name for its code ("" when unknown). */
export const industryLabel = (v) => industryTypes.find((o) => o.value === v)?.label || "";

/** The words the active types use in the agreement text, in order and without repeats. */
export const industryAgreementWords = () => [...new Set(industryTypes.filter((o) => o.active).map((o) => o.word).filter(Boolean))];
// Services requested are Quotation Master services: the server sends their names with the lead.

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

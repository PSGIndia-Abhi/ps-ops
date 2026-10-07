// SAMPLE DATA for the Lead Management screens.
//
// Nothing here comes from the server. It exists so the screens can be built
// and reviewed before the lead APIs are ready; leadsApi.js is the only file
// that reads it, and is where the real calls will go.
//
// Dates are worked out from "now" each time the app loads, so "today's
// meetings" and "this month" always have something in them.

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

export const SOURCES = ["Lead Provider", "Field Visit", "Referral", "Website", "Google", "Email", "Other"];

export const REASONS = {
  NOT_GENUINE: ["Duplicate lead", "Invalid contact number", "Unreachable after 3 attempts", "Already a vendor / customer", "Not a real enquiry"],
  LOST: ["Not interested", "Budget issue", "Competitor selected", "Quotation rejected", "Postponed indefinitely"],
};

export const VISIT_OUTCOMES = ["Quotation provided", "Customer interested", "Need follow-up", "Not interested"];

export const USERS = [
  { id: "u-mgr", name: "Anita Desai", role: "sales_manager", title: "Sales Manager" },
  { id: "u-tc1", name: "Rahul Sharma", role: "telecaller", title: "Telecaller" },
  { id: "u-tc2", name: "Priya Menon", role: "telecaller", title: "Telecaller" },
  { id: "u-s1", name: "Vijay Nair", role: "sales", title: "Sales Executive" },
  { id: "u-s2", name: "Suresh K", role: "sales", title: "Sales Executive" },
  { id: "u-s3", name: "Amita R", role: "sales", title: "Sales Executive" },
  { id: "u-s4", name: "Karan M", role: "sales", title: "Sales Executive" },
];

export const PROVIDERS = [
  { id: "p-1", code: "LP-001", name: "Surya Marketing", contact: "Surya Prakash", phone: "9845012345", email: "leads@suryamarketing.in", active: true, userId: "u-p1" },
  { id: "p-2", code: "LP-002", name: "Metro Lead Works", contact: "Deepa Rao", phone: "9886023456", email: "deepa@metroleads.in", active: true, userId: "u-p2" },
  { id: "p-3", code: "LP-003", name: "GrowthHub Associates", contact: "Imran Khan", phone: "9900034567", email: "imran@growthhub.co", active: false, userId: "u-p3" },
];

/** Who each dashboard is "signed in" as while the data is sample data. */
export const PERSONA_USER = {
  lead_provider: { id: "u-p1", name: "Surya Marketing", title: "Lead Provider", providerId: "p-1" },
  telecaller: USERS[1],
  sales: USERS[3],
  sales_manager: USERS[0],
};

const DAY = 86400000;

/** A date `days` from today (negative = past) at the given local time. */
export function at(days, hour = 10, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return new Date(d.getTime() + days * DAY).toISOString();
}

// company, contact, phone, area, source, quote, stage, provider, sales, created (days ago), requirement
const SEED = [
  ["ABC Pharma Pvt Ltd", "Ravi Kumar", "9876543210", "Whitefield", "Lead Provider", 500000, "MEETING_SCHEDULED", "p-1", "u-s1", 4, "Pest control contract for factory and warehouse."],
  ["Metro Foods", "Lakshmi Iyer", "9988776655", "Koramangala", "Referral", 180000, "MEETING_SCHEDULED", null, "u-s1", 5, "Monthly GPC and rodent control for two outlets."],
  ["Tech Solutions India", "Arun Prasad", "9123456780", "Electronic City", "Website", 240000, "MEETING_SCHEDULED", null, "u-s1", 3, "Annual contract for a 4-floor office."],
  ["Green Mart", "Fathima Begum", "8877665544", "Indiranagar", "Lead Provider", 95000, "MEETING_SCHEDULED", "p-1", "u-s1", 6, "Cockroach and fly control for supermarket."],
  ["Sunrise Hospitals", "Dr. Mohan Rao", "9988123456", "Jayanagar", "Email", 620000, "NOT_GENUINE", null, null, 7, "Enquiry for hospital-wide pest management."],
  ["XYZ Industries", "Naveen Gowda", "9123456789", "Peenya", "Lead Provider", 310000, "QUALIFIED", "p-1", null, 2, "Termite treatment for a new godown."],
  ["KLM Hospitals", "Sister Mary", "9988776600", "Hebbal", "Lead Provider", 450000, "NOT_GENUINE", "p-1", null, 9, "Requested quote for general pest control."],
  ["Metro Stores", "Sanjay Jain", "9988123450", "Malleshwaram", "Lead Provider", 150000, "QUOTATION_SENT", "p-1", "u-s2", 18, "GPC for a chain of five stores."],
  ["New Era Hotels", "Suresh Pai", "9876543219", "Indiranagar", "Field Visit", 250000, "QUOTATION_SENT", null, "u-s1", 12, "Termite control for three buildings."],
  ["Brigade Tech Park", "Meera Shetty", "9845098450", "Whitefield", "Google", 880000, "VISIT_COMPLETED", null, "u-s3", 8, "Integrated pest management for tech park campus."],
  ["Udupi Grand Restaurant", "Ganesh Bhat", "9740012340", "Jayanagar", "Field Visit", 72000, "WON", null, "u-s1", 26, "Monthly cockroach and rodent control."],
  ["Prestige Apartments", "Rekha Menon", "9611023450", "Koramangala", "Referral", 210000, "WON", null, "u-s2", 30, "Common-area GPC and mosquito control."],
  ["Sapphire Diagnostics", "Dr. Anil Kumar", "9535034560", "HSR Layout", "Lead Provider", 130000, "WON", "p-2", "u-s3", 22, "Quarterly disinfection and pest control."],
  ["Orion Logistics", "Farhan Ali", "9900045670", "Bommasandra", "Lead Provider", 340000, "LOST", "p-2", "u-s4", 28, "Warehouse rodent control."],
  ["Cafe Aroma", "Nisha Thomas", "9448056780", "Indiranagar", "Field Visit", 48000, "LOST", null, "u-s2", 20, "Fly control for cafe kitchen."],
  ["Vertex Software", "Pradeep N", "9739067890", "Bellandur", "Website", 165000, "NEW", null, null, 0, "Pest control for office pantry and washrooms."],
  ["Lakeview School", "Principal Shobha", "9620078901", "Yelahanka", "Lead Provider", 120000, "NEW", "p-1", null, 0, "Snake and honeybee control on school grounds."],
  ["Royal Bakers", "Imtiaz Ahmed", "9880089012", "Frazer Town", "Lead Provider", 60000, "NEW", "p-2", null, 1, "Cockroach control for bakery unit."],
  ["Shree Textiles", "Mahesh Agarwal", "9341090123", "Chickpet", "Email", 90000, "NEW", null, null, 1, "Rodent problem in a cloth godown."],
  ["Apex Builders", "Kiran Reddy", "9845101234", "Sarjapur", "Field Visit", 700000, "TO_CALL", null, "u-s4", 2, "Pre-construction anti-termite treatment."],
  ["Blue Ocean Seafoods", "Thomas Kurian", "9447112345", "Yeshwanthpur", "Lead Provider", 110000, "TO_CALL", "p-1", null, 2, "Fly and rodent control for cold storage."],
  ["Nandi Motors", "Chetan Hegde", "9972123456", "Rajajinagar", "Google", 85000, "TO_CALL", null, null, 3, "General pest control for showroom."],
  ["Silver Oak Residency", "Asha Kulkarni", "9900134567", "Marathahalli", "Referral", 195000, "NEED_MORE_INFO", null, null, 4, "Association enquiry, number of blocks not confirmed."],
  ["Coastal Kitchen", "Rohan D'Souza", "9886145678", "MG Road", "Lead Provider", 54000, "NEED_MORE_INFO", "p-2", null, 5, "Restaurant pest control, timings to be confirmed."],
  ["Fortune Plaza Mall", "Vandana Kapoor", "9845156789", "Hebbal", "Website", 950000, "QUALIFIED", null, null, 3, "Mall-wide annual maintenance contract."],
  ["Garden City College", "Prof. Ramesh", "9739167890", "KR Puram", "Lead Provider", 140000, "QUALIFIED", "p-1", null, 4, "Hostel and canteen pest control."],
  ["Zenith Pharma", "Kavya S", "9611178901", "Bommasandra", "Field Visit", 380000, "VISIT_COMPLETED", null, "u-s1", 9, "GMP-compliant pest control for production unit."],
  ["Hotel Sai Residency", "Venkatesh M", "9448189012", "Majestic", "Lead Provider", 175000, "VISIT_COMPLETED", "p-2", "u-s2", 10, "Bed bug and cockroach treatment for 40 rooms."],
  ["Elite Fitness Club", "Roshni Patel", "9880190123", "HSR Layout", "Google", 42000, "QUOTATION_SENT", null, "u-s3", 14, "Monthly GPC for gym and locker rooms."],
  ["Kaveri Agro Foods", "Basavaraj P", "9341201234", "Peenya", "Field Visit", 290000, "QUOTATION_SENT", null, "u-s4", 15, "Stored-grain pest control and fumigation."],
  ["Mantri Corporate Tower", "Sunil Mehta", "9845212345", "Malleshwaram", "Referral", 560000, "WON", null, "u-s1", 34, "Annual contract for 12-floor office tower."],
  ["Little Hearts Preschool", "Divya Nair", "9972223456", "Jayanagar", "Website", 36000, "WON", null, "u-s4", 24, "Child-safe pest control every quarter."],
  ["Star Bazaar Outlet", "Harish Shenoy", "9900234567", "Banashankari", "Lead Provider", 125000, "MEETING_SCHEDULED", "p-1", "u-s2", 5, "Rodent and cockroach control for retail outlet."],
  ["Infinity Co-working", "Tanvi Joshi", "9886245678", "Koramangala", "Google", 98000, "MEETING_SCHEDULED", null, "u-s3", 4, "Fortnightly GPC for co-working floors."],
  ["Maruthi Printers", "Lokesh Gowda", "9845256789", "Rajajinagar", "Field Visit", 67000, "LOST", null, "u-s3", 19, "Silverfish and rodent control for paper store."],
  ["Deccan Dairy", "Yusuf Sharif", "9739267890", "Yelahanka", "Lead Provider", 230000, "NOT_GENUINE", "p-2", null, 11, "Number given was not reachable."],
];

const order = (key) => STAGES.findIndex((s) => s.key === key);
const reached = (lead, key) => PIPELINE.includes(lead.stage) && order(lead.stage) >= order(key);

function buildLead(row, i) {
  const [company, contact, phone, area, source, quote, stage, providerId, salesId, daysAgo, requirement] = row;
  const telecallerId = stage === "NEW" ? null : i % 3 === 0 ? "u-tc2" : "u-tc1";
  return {
    id: `l-${i + 1}`,
    number: `LD-2026-${String(101 + i).padStart(6, "0")}`,
    company,
    contact,
    phone,
    altPhone: i % 4 === 0 ? `99${String(88000000 + i * 7919).slice(0, 8)}` : "",
    email: `${contact.split(" ").pop().toLowerCase().replace(/[^a-z]/g, "")}@${company.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}.com`,
    address: `${12 + i * 3}, ${area}, Bengaluru`,
    area,
    source,
    quote,
    requirement,
    stage,
    providerId,
    createdBy: providerId ? PROVIDERS.find((p) => p.id === providerId).userId : salesId || "u-s1",
    telecallerId,
    salesId,
    priority: quote >= 500000 ? "HIGH" : "NORMAL",
    reason:
      stage === "NOT_GENUINE" ? REASONS.NOT_GENUINE[i % REASONS.NOT_GENUINE.length] : stage === "LOST" ? REASONS.LOST[i % REASONS.LOST.length] : "",
    providerFeedback:
      stage === "NOT_GENUINE"
        ? "Not genuine (already vendor)"
        : stage === "WON"
          ? "Customer created"
          : stage === "QUOTATION_SENT"
            ? "Quotation shared"
            : stage === "MEETING_SCHEDULED"
              ? "Meeting scheduled"
              : "",
    nextFollowUpAt: stage === "TO_CALL" ? at(i % 2 === 0 ? 0 : 1, 11 + (i % 5), 0) : stage === "NEED_MORE_INFO" ? at(1, 15, 30) : null,
    createdAt: at(-daysAgo, 9 + (i % 7), (i * 13) % 60),
    updatedAt: at(-Math.max(0, daysAgo - 1), 16, 5),
  };
}

function buildMeeting(lead, i) {
  // A lead that reached a meeting has one; so does a lost lead, since it was lost after a visit.
  if (!lead.salesId || (!reached(lead, "MEETING_SCHEDULED") && lead.stage !== "LOST")) return null;
  const upcoming = lead.stage === "MEETING_SCHEDULED";
  // Vijay's scheduled meetings land today so his dashboard has a full day.
  const day = upcoming ? (lead.salesId === "u-s1" ? 0 : (i % 3) + 1) : -Math.max(1, (i % 6) + 1);
  const hours = [10, 11, 15, 16, 12, 14];
  const scheduledAt = at(day, hours[i % hours.length], i % 2 ? 30 : 0);
  const done = !upcoming;
  return {
    id: `m-${lead.id}`,
    leadId: lead.id,
    salesId: lead.salesId,
    type: i % 4 === 2 ? "MEETING" : "SITE_VISIT",
    locationType: i % 4 === 2 ? "OFFICE" : "CUSTOMER",
    address: i % 4 === 2 ? "BestServe Office, Jayanagar" : lead.address,
    scheduledAt,
    status: done ? "COMPLETED" : i % 5 === 4 ? "FOLLOW_UP" : i % 5 === 0 ? "IN_PROGRESS" : "SCHEDULED",
    outcome: done ? (lead.stage === "LOST" ? "Not interested" : lead.stage === "VISIT_COMPLETED" ? "Customer interested" : "Quotation provided") : "",
    notes: done ? "Site inspected, requirement confirmed with the customer." : "Discuss annual pest control contract and site visit.",
    checkInAt: done ? scheduledAt : null,
    checkOutAt: done ? new Date(new Date(scheduledAt).getTime() + 55 * 60000).toISOString() : null,
  };
}

function buildActivities(lead, meeting) {
  const name = (id) => USERS.find((u) => u.id === id)?.name || PROVIDERS.find((p) => p.userId === id)?.name || "System";
  const list = [];
  let step = 0;
  const base = new Date(lead.createdAt).getTime();
  const add = (type, text, by, extra = {}) => {
    list.push({ id: `a-${lead.id}-${step}`, leadId: lead.id, type, text, by: name(by), at: new Date(base + step * 0.6 * DAY).toISOString(), ...extra });
    step += 1;
  };

  add("CREATED", `Lead created by ${name(lead.createdBy)}${lead.providerId ? " (Lead Provider)" : ""}`, lead.createdBy);
  if (lead.stage === "NEW") return list;

  add("CALL", `Called by ${name(lead.telecallerId)}`, lead.telecallerId, { note: "Spoke to the contact person and confirmed the requirement." });
  if (lead.stage === "TO_CALL") return list;
  if (lead.stage === "NEED_MORE_INFO") {
    add("STATUS", "Marked as Need More Information", lead.telecallerId, { note: "Waiting for site details from the customer." });
    return list;
  }
  if (lead.stage === "NOT_GENUINE") {
    add("REJECTED", `Marked as Not Genuine - ${lead.reason}`, lead.telecallerId);
    return list;
  }
  add("QUALIFIED", "Marked as Genuine Lead", lead.telecallerId);
  if (!meeting) return list;

  add("MEETING", `Meeting scheduled with ${name(lead.salesId)}`, lead.telecallerId);
  if (lead.stage === "MEETING_SCHEDULED") return list;
  add("VISIT", `Site visit completed by ${name(lead.salesId)}`, lead.salesId, { note: meeting.notes });
  if (lead.stage === "VISIT_COMPLETED") return list;
  if (lead.stage === "LOST") {
    add("LOST", `Marked as Lost - ${lead.reason}`, lead.salesId);
    return list;
  }
  add("QUOTATION", `Quotation provided (${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(lead.quote)})`, lead.salesId);
  if (lead.stage === "QUOTATION_SENT") return list;
  add("WON", "Lead converted to customer", lead.salesId);
  return list;
}

/** A fresh copy of the sample data set. */
export function buildSampleData() {
  const leads = SEED.map(buildLead);
  const meetings = leads.map(buildMeeting).filter(Boolean);
  const activities = leads.flatMap((lead) => buildActivities(lead, meetings.find((m) => m.leadId === lead.id)));
  return { leads, meetings, activities, providers: PROVIDERS.map((p) => ({ ...p })) };
}

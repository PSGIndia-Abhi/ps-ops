import { useState, useEffect, useMemo, useRef } from "react";
import { apiFetch } from "../api";
import CreateContactModal from "./CreateContactModal";
import AssignWorkOrderModal from "./AssignWorkOrderModal";
import StatusAlertModal from "./StatusAlertModal";
// Shared two-panel booking form styles (bgm-* / bg-*), also used by the Brigade booking form.
import "../pages/brigade/brigade.css";



export default function CreateBookingModal({
  isOpen,
  onClose,
  onCreate,
  supervisors,
  technicians,
  clientContact,
}) {
  if (!isOpen) return null;
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const [assignedSupervisorId, setAssignedSupervisorId] = useState(null);
  const [assignedTechnicianIds, setAssignedTechnicianIds] = useState([]);

  const [assignedSupervisorName, setAssignedSupervisorName] = useState("");
  const [assignedTechnicianName, setAssignedTechnicianName] = useState("");
  const role = localStorage.getItem("role");
  const loggedInUserId = Number(localStorage.getItem("userId"));
  const loggedInContactId = localStorage.getItem("contactId");
  const [showContactResults, setShowContactResults] = useState(false);

  const [form, setForm] = useState({
    contactId: "",
    serviceType: "BOTH",
    subServices: [],
    location: "",
    notes: "",
    recurrenceEnabled: false,
    recurrenceType: "WEEKLY",
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: [],
    recurrenceMonthMode: "day_of_month",
    recurrenceDayOfMonth: "",
    recurrenceWeeksOfMonth: [],
    recurrenceMonthWeekdays: [],
    recurrenceEndDate: "",
  });
  const defaultSchedule = { scheduleType: "single", start_date: "", end_date: "" };
  const [serviceSchedules, setServiceSchedules] = useState({});

  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [useCompanyAddress, setUseCompanyAddress] = useState(false);

  // In-app replacement for window.alert() — null | { type: "success" | "error", message }.
  // Success closes this modal once dismissed; errors just stay open so the
  // admin can fix the input and resubmit.
  const [status, setStatus] = useState(null);

  useEffect(() => {
    async function loadContacts() {
      if (role === "client") {
        if (clientContact?.id) {
          setContacts([clientContact]);
        }
        setLoadingContacts(false);
        return;
      }
      try {
        const res = await apiFetch(`/api/contacts`);
        if (!res?.ok) throw new Error("Failed to load contacts");
        const data = await res.json();
        setContacts(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load contacts", err);
      } finally {
        setLoadingContacts(false);
      }
    }

    async function loadCompanies() {
      try {
        const res = await apiFetch(`/api/sites`);
        if (!res?.ok) throw new Error("Failed to load sites");
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load companies", err);
      }
    }

    loadContacts();
    loadCompanies();
  }, [role, clientContact]);

  useEffect(() => {
    if (role === "client" && loggedInContactId) {
      setForm(prev => ({ ...prev, contactId: loggedInContactId }));
    }
  }, [role, loggedInContactId]);

  const selectedContact = useMemo(
    () => contacts.find(c => String(c.id) === String(form.contactId)),
    [contacts, form.contactId]
  );

  const selectedCompany = useMemo(() => {
    if (!selectedContact?.company_id) return null;
    return companies.find(c => String(c.id) === String(selectedContact.company_id)) || null;
  }, [companies, selectedContact]);

  const companyAddress = useMemo(() => {
    if (!selectedCompany) return "";
    const parts = [selectedCompany.address, selectedCompany.city, selectedCompany.state]
      .map(part => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);
    return parts.join(", ");
  }, [selectedCompany]);

  useEffect(() => {
    if (!selectedContact?.company_id) {
      if (useCompanyAddress) {
        setUseCompanyAddress(false);
      }
      return;
    }

    if (useCompanyAddress && companyAddress) {
      setForm(prev => ({ ...prev, location: companyAddress }));
    }
  }, [selectedContact?.company_id, companyAddress, useCompanyAddress]);

  useEffect(() => {
    if (role !== "client") return;
    if (!selectedContact?.company_id) return;
    if (!companyAddress) return;
    setUseCompanyAddress(true);
    setForm(prev => ({
      ...prev,
      location: prev.location?.trim() ? prev.location : companyAddress,
    }));
  }, [role, selectedContact?.company_id, companyAddress]);

  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || c.contact_phone || "").toLowerCase();
      const email = (c.email || c.contact_email || "").toLowerCase();
      const company = (c.company_name || c.company_site || c.company_code || "").toLowerCase();
      return (
        name.includes(query) ||
        phone.includes(query) ||
        email.includes(query) ||
        company.includes(query)
      );
    });
  }, [contacts, contactSearch]);

  async function reloadContacts() {
    if (role === "client") return;
    try {
      const res = await apiFetch(`/api/contacts`);
      if (!res?.ok) throw new Error("Failed to load contacts");
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load contacts", err);
    }
  }




  const pestServices = [
  "General Pest Control (GPC)",
  "General Pest Control + Rodent Control (GPC + RC)",
  "Mosquito Treatment",
  "Mosquito Fogging",
  "Mosquito IRS (Indoor Residual Spray)",
  "Mosquito Larval Treatment",
  "Cockroach Treatment",
  "Cockroach Gel Treatment",
  "Ant Treatment",
  "Fly Treatment",
  "Bed Bug Treatment",
  "Snake Control",
  "Honey Bee Treatment",
  "Rodent Control",
  "Drainage Treatment",
  "Termite Pre-Construction Treatment",
  "Termite Post-Construction Treatment",
  "Lizard Control",
  "Deep Fumigation"
];

const deepCleaningServices = [
  "Floor Protection",
  "Electrical Shifting",
  "Electrical New Point Installation",
  "Plumbing Work",
  "Painting Work",
  "Regular Cleaning",
  "Deep Cleaning",
  "Deep Cleaning with Scrubbing",
  "Deep Cleaning with Sticker Removal",
  "Debris Removal"
];

const salesServices = [
  "Invoice Submission"
];

const operationServices = [
  "CRM"
];

  const visibleSubServices =
    form.serviceType === "PEST"
      ? pestServices
      : form.serviceType === "DEEP"
        ? deepCleaningServices
        : form.serviceType === "SALES"
          ? salesServices
          : form.serviceType === "OPERATION"
            ? operationServices
            : [...pestServices, ...deepCleaningServices];

  function update(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleSubService(service) {
    setForm(prev => {
      const isSelected = prev.subServices.includes(service);
      const nextSubServices = isSelected
        ? prev.subServices.filter(s => s !== service)
        : [...prev.subServices, service];
      return { ...prev, subServices: nextSubServices };
    });

    setServiceSchedules(prev => {
      const next = { ...prev };
      if (next[service]) {
        delete next[service];
      } else {
        next[service] = { ...defaultSchedule };
      }
      return next;
    });
  }

  function updateServiceSchedule(service, patch) {
    setServiceSchedules(prev => {
      const current = prev[service] || defaultSchedule;
      const next = { ...current, ...patch };
      next.scheduleType = "single";
      next.end_date = "";
      return { ...prev, [service]: next };
    });
  }

  function toggleRecurrenceDay(day) {
    setForm(prev => {
      const existing = new Set(prev.recurrenceDaysOfWeek || []);
      if (existing.has(day)) {
        existing.delete(day);
      } else {
        existing.add(day);
      }
      const nextDays = Array.from(existing).sort((a, b) => a - b);
      return { ...prev, recurrenceDaysOfWeek: nextDays };
    });
  }

  function toggleMonthWeek(weekValue) {
    setForm(prev => {
      const existing = new Set(prev.recurrenceWeeksOfMonth || []);
      if (existing.has(weekValue)) {
        existing.delete(weekValue);
      } else {
        existing.add(weekValue);
      }
      const nextWeeks = Array.from(existing).sort((a, b) => a - b);
      return { ...prev, recurrenceWeeksOfMonth: nextWeeks };
    });
  }

  function toggleMonthWeekday(day) {
    setForm(prev => {
      const existing = new Set(prev.recurrenceMonthWeekdays || []);
      if (existing.has(day)) {
        existing.delete(day);
      } else {
        existing.add(day);
      }
      const nextDays = Array.from(existing).sort((a, b) => a - b);
      return { ...prev, recurrenceMonthWeekdays: nextDays };
    });
  }

  async function handleSubmit() {
    if (!form.contactId) {
      setStatus({
        type: "error",
        message: role === "client"
          ? "Your contact profile is missing. Please contact support."
          : "Please select who is requesting this booking",
      });
      return;
    }

    if (!form.subServices.length) {
      setStatus({ type: "error", message: "Please select at least one service" });
      return;
    }

    // Clients don't assign a team; a supervisor's bookings are assigned to themselves by the backend.
    if (role !== "client") {
      if (role !== "supervisor" && !assignedSupervisorId) {
        setStatus({ type: "error", message: "Please assign a supervisor (use Assign Team)" });
        return;
      }
      if (!assignedTechnicianIds?.length) {
        setStatus({ type: "error", message: "Please assign at least one technician (use Assign Team)" });
        return;
      }
    }
    const schedulePayload = {};
    let earliestStart = null;
    let latestEnd = null;

    for (const service of form.subServices) {
      const schedule = serviceSchedules[service] || defaultSchedule;
      const scheduleType = schedule.scheduleType || "single";
      const startDateValue = schedule.start_date;
      const endDateValue = scheduleType === "single" ? "" : schedule.end_date;

      if (!startDateValue) {
        setStatus({ type: "error", message: `Date of service is required for ${service}` });
        return;
      }

      if (scheduleType === "range") {
        if (!endDateValue) {
          setStatus({ type: "error", message: `End date is required for ${service}` });
          return;
        }
        const start = new Date(`${startDateValue}T00:00:00`);
        const end = new Date(`${endDateValue}T00:00:00`);
        if (end < start) {
          setStatus({ type: "error", message: `End date cannot be before start date for ${service}` });
          return;
        }
      }

      const startObj = new Date(`${startDateValue}T00:00:00`);
      const endObj = new Date(`${(endDateValue || startDateValue)}T00:00:00`);

      if (!earliestStart || startObj < earliestStart.date) {
        earliestStart = { date: startObj, value: startDateValue };
      }
      if (!latestEnd || endObj > latestEnd.date) {
        latestEnd = { date: endObj, value: endDateValue || startDateValue };
      }

      schedulePayload[service] = {
        scheduleType,
        start_date: startDateValue,
        end_date: endDateValue || null,
        time: schedule.time || null
      };
    }

    const startDateValue = earliestStart?.value || "";
    const endDateValue = latestEnd?.value || "";

    let recurrence = null;
    if (recurrenceActive) {
      if (!startDateValue) {
        setStatus({ type: "error", message: "Start date is required for recurring bookings" });
        return;
      }
      if (!form.recurrenceEndDate) {
        setStatus({ type: "error", message: "End date is required for recurring bookings" });
        return;
      }
      const recurrenceEndDate = form.recurrenceEndDate;
      const recurrenceEndObj = new Date(`${recurrenceEndDate}T00:00:00`);
      const recurrenceStartObj = new Date(`${startDateValue}T00:00:00`);
      if (recurrenceEndObj < recurrenceStartObj) {
        setStatus({ type: "error", message: "Recurring end date cannot be before start date" });
        return;
      }

      let frequency = "WEEKLY";
      let intervalValue = 1;
      let daysOfWeek = [];
      let dayOfMonth = null;
      let weekOfMonth = null;
      let dayOfWeek = null;
      const startDateObj = startDateValue
        ? new Date(`${startDateValue}T00:00:00`)
        : null;
      const fallbackDayOfMonth = startDateObj ? startDateObj.getDate() : 1;
      const fallbackDayOfWeek = startDateObj ? startDateObj.getDay() : 1;
      const fallbackWeekOfMonth = startDateObj
        ? Math.floor((startDateObj.getDate() - 1) / 7) + 1
        : 1;

      switch (form.recurrenceType) {
        case "DAILY":
          frequency = "CUSTOM_DAYS";
          intervalValue = 1;
          break;
        case "WEEKLY":
          frequency = "WEEKLY";
          intervalValue = 1;
          daysOfWeek = form.recurrenceDaysOfWeek || [];
          break;
        case "CUSTOM_DAYS":
          frequency = "CUSTOM_DAYS";
          intervalValue = Number(form.recurrenceInterval) || 1;
          break;
        case "CUSTOM_WEEKS":
          frequency = "WEEKLY";
          intervalValue = Number(form.recurrenceInterval) || 1;
          daysOfWeek = form.recurrenceDaysOfWeek || [];
          break;
        case "CUSTOM_MONTHS":
          frequency = "MONTHLY";
          intervalValue = Number(form.recurrenceInterval) || 1;
          if (form.recurrenceMonthMode === "week_day") {
            const weekSelections = (form.recurrenceWeeksOfMonth || [])
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && (value === -1 || (value >= 1 && value <= 5)));
            const daySelections = (form.recurrenceMonthWeekdays || [])
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

            weekOfMonth = weekSelections.length ? weekSelections : [fallbackWeekOfMonth];
            daysOfWeek = daySelections.length ? daySelections : [fallbackDayOfWeek];
          } else {
            dayOfMonth = Number(form.recurrenceDayOfMonth);
            if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
              dayOfMonth = fallbackDayOfMonth;
            }
          }
          break;
        default:
          frequency = "WEEKLY";
          intervalValue = 1;
          daysOfWeek = form.recurrenceDaysOfWeek || [];
      }

      if ((form.recurrenceType === "WEEKLY" || form.recurrenceType === "CUSTOM_WEEKS") && daysOfWeek.length === 0) {
        const startDay = new Date(`${startDateValue}T00:00:00`).getDay();
        daysOfWeek = [startDay];
      }

      recurrence = {
        frequency,
        interval_value: intervalValue,
        days_of_week: daysOfWeek.length ? daysOfWeek : null,
        day_of_month: dayOfMonth,
        day_of_week: dayOfWeek,
        week_of_month: weekOfMonth,
        start_date: startDateValue,
        end_date: recurrenceEndDate,
      };
    }

    const locationValue = typeof form.location === "string" ? form.location.trim() : "";

    try {
      await onCreate({
        contact_id: form.contactId,
        serviceType: form.serviceType,
        subServices: form.subServices,
        start_date: startDateValue,
        end_date: endDateValue || null,
        serviceSchedules: schedulePayload,
        location: locationValue,
        notes: form.notes,
        recurrence,
        supervisor_id: assignedSupervisorId,
        technician_ids: assignedTechnicianIds
      });
      // Modal closes once the admin dismisses this (see the StatusAlertModal
      // onClose handler below) instead of immediately like window.alert() did.
      setStatus({ type: "success", message: "Booking created successfully" });

    } catch (err) {
      console.error("Create booking failed", err);
      setStatus({ type: "error", message: err?.message || "Failed to create booking" });
    }
  }

  const daysOfWeek = [
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
  ];

  const monthWeeks = [
    { value: 1, label: "1st" },
    { value: 2, label: "2nd" },
    { value: 3, label: "3rd" },
    { value: 4, label: "4th" },
    { value: 5, label: "5th" },
    { value: -1, label: "Last" },
  ];

  const monthDays = Array.from({ length: 31 }, (_, i) => i + 1);

  const recurrenceActive = form.recurrenceEnabled;
  const recurrenceUsesWeekdays = form.recurrenceType === "WEEKLY" || form.recurrenceType === "CUSTOM_WEEKS";
  const recurrenceNeedsInterval = form.recurrenceType === "CUSTOM_DAYS"
    || form.recurrenceType === "CUSTOM_WEEKS"
    || form.recurrenceType === "CUSTOM_MONTHS";
  const recurrenceIsMonthly = form.recurrenceType === "CUSTOM_MONTHS";

  const contactDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        contactDropdownRef.current &&
        !contactDropdownRef.current.contains(e.target)
      ) {
        setShowContactResults(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  /* ---------- RENDER ---------- */

  const isClient = role === "client";
  const needsSupervisor = !isClient && role !== "supervisor";

  const serviceTypes = [
    { key: "PEST", label: "Pest Control" },
    { key: "DEEP", label: "Deep Cleaning" },
    { key: "BOTH", label: "Both" },
    { key: "SALES", label: "Sales" },
    { key: "OPERATION", label: "Operation" },
  ];
  const serviceTypeLabel = serviceTypes.find(s => s.key === form.serviceType)?.label || "—";

  const recurrenceTypes = [
    { value: "DAILY", label: "Daily" },
    { value: "WEEKLY", label: "Weekly" },
    { value: "CUSTOM_DAYS", label: "Every X days" },
    { value: "CUSTOM_WEEKS", label: "Every X weeks" },
    { value: "CUSTOM_MONTHS", label: "Every X months" },
  ];
  const recurrenceSummary = recurrenceActive
    ? `${recurrenceTypes.find(r => r.value === form.recurrenceType)?.label || ""}${
        recurrenceNeedsInterval ? ` (×${form.recurrenceInterval || 1})` : ""
      }${form.recurrenceEndDate ? ` until ${formatShortDate(form.recurrenceEndDate)}` : ""}`
    : "One time";

  const contactCompany = selectedContact
    ? [selectedContact.company_name, selectedContact.company_site].filter(Boolean).join(" – ")
    : "";

  // Mirrors handleSubmit's checks so the summary can say what is still missing.
  const missing = [];
  if (!form.contactId) missing.push(isClient ? "Your contact profile is missing" : "Choose who is requesting");
  if (!form.subServices.length) missing.push("Pick at least one service");
  const undated = form.subServices.filter(s => !serviceSchedules[s]?.start_date);
  if (undated.length) missing.push(`Set the visit date for ${undated.length === 1 ? undated[0] : `${undated.length} services`}`);
  if (recurrenceActive && !form.recurrenceEndDate) missing.push("Set the recurrence end date");
  if (needsSupervisor && !assignedSupervisorId) missing.push("Assign a supervisor");
  if (!isClient && !assignedTechnicianIds?.length) missing.push("Assign at least one technician");

  const stepDone = {
    contact: Boolean(form.contactId),
    address: Boolean(form.location?.trim()),
    services: form.subServices.length > 0,
    schedule: form.subServices.length > 0 && undated.length === 0,
    team: (!needsSupervisor || Boolean(assignedSupervisorId)) && assignedTechnicianIds?.length > 0,
  };

  // Same date/time for every picked service.
  function applyFirstScheduleToAll() {
    const first = serviceSchedules[form.subServices[0]];
    if (!first) return;
    setServiceSchedules(prev => {
      const next = { ...prev };
      for (const s of form.subServices) next[s] = { ...first };
      return next;
    });
  }

  let step = 0;
  const nextStep = () => ++step;

  return (
    <div className="bgm-overlay">
      <div className="bgm-modal" role="dialog" aria-modal="true" aria-labelledby="cbm-title">
        <div className="bgm-header">
          <div>
            <h3 id="cbm-title">Create Booking</h3>
            <p>{isClient ? "Request a service visit" : "Requester, services, schedule and team"}</p>
          </div>
          <button type="button" className="bgm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="bgm-content">
          <div className="bgm-main">
            {/* REQUESTED BY */}
            {!isClient && (
              <section className="bgm-section">
                <SectionHead step={nextStep()} title="Requested by" done={stepDone.contact} />
                <div ref={contactDropdownRef} className="bgm-search">
                  <div className="bg-field">
                    <input
                      type="text"
                      value={contactSearch}
                      onFocus={() => setShowContactResults(true)}
                      onChange={(e) => {
                        setContactSearch(e.target.value);
                        setShowContactResults(true);
                      }}
                      placeholder="Search contacts by name, phone, email, or company"
                      aria-label="Search contacts"
                    />
                  </div>
                  {showContactResults && (
                    <div className="bgm-search-results" role="listbox">
                      {loadingContacts ? (
                        <div className="bgm-search-empty">Loading contacts…</div>
                      ) : filteredContacts.length === 0 ? (
                        <div className="bgm-search-empty">No contacts found</div>
                      ) : (
                        filteredContacts.map(c => {
                          const companyLabel = [c.company_name, c.company_site].filter(Boolean).join(" – ");
                          const phoneLabel = c.phone || c.contact_phone || "";
                          return (
                            <button
                              type="button"
                              role="option"
                              aria-selected={String(form.contactId) === String(c.id)}
                              key={c.id}
                              className="bgm-search-item"
                              onClick={() => {
                                setForm(prev => ({ ...prev, contactId: c.id }));
                                setContactSearch(`${c.name} - ${phoneLabel}`);
                                setShowContactResults(false);
                              }}
                            >
                              <span className="bgm-contact-name">{c.name}</span>
                              <span className="bgm-contact-sub">
                                {[phoneLabel, companyLabel, c.company_code ? `(${c.company_code})` : ""].filter(Boolean).join(" · ")}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {selectedContact && (
                  <div className="bgm-flat-strip">
                    <strong>{selectedContact.name}</strong>
                    {(selectedContact.phone || selectedContact.contact_phone) && (
                      <span>{selectedContact.phone || selectedContact.contact_phone}</span>
                    )}
                    {contactCompany && <span className="bg-chip accent">{contactCompany}</span>}
                  </div>
                )}

                <button
                  type="button"
                  className="bg-link-btn"
                  style={{ marginTop: 8, paddingLeft: 0 }}
                  onClick={() => setIsContactModalOpen(true)}
                >
                  + Create contact
                </button>

                {isContactModalOpen && (
                  <CreateContactModal
                    onClose={() => setIsContactModalOpen(false)}
                    onCreated={(newContact) => {
                      if (newContact?.id) {
                        setContacts(prev => {
                          const exists = prev.some(c => c.id === newContact.id);
                          if (exists) return prev;
                          return [newContact, ...prev];
                        });
                        setForm(prev => ({ ...prev, contactId: newContact.id }));
                        const phoneLabel = newContact.phone || newContact.contact_phone || "";
                        setContactSearch(`${newContact.name || "Contact"}${phoneLabel ? ` - ${phoneLabel}` : ""}`);
                        setShowContactResults(false);
                      } else {
                        reloadContacts();
                      }
                      setIsContactModalOpen(false);
                    }}
                    companies={companies}
                  />
                )}
              </section>
            )}

            {/* ADDRESS */}
            <section className="bgm-section">
              <SectionHead step={nextStep()} title="Service address" done={stepDone.address} hint="Optional" />
              <div className="bg-field">
                <input
                  type="text"
                  value={form.location}
                  onChange={e => update("location", e.target.value)}
                  placeholder="Enter service address or location"
                  aria-label="Service address"
                />
              </div>
              {selectedContact?.company_id && (
                <label className="bgm-check">
                  <input
                    type="checkbox"
                    checked={useCompanyAddress}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseCompanyAddress(checked);
                      if (checked && companyAddress) {
                        setForm(prev => ({ ...prev, location: companyAddress }));
                      }
                    }}
                    disabled={!companyAddress}
                  />
                  Use company address{companyAddress ? ` (${companyAddress})` : ""}
                </label>
              )}
            </section>

            {/* SERVICES */}
            <section className="bgm-section">
              <SectionHead
                step={nextStep()}
                title="Services"
                done={stepDone.services}
                hint={form.subServices.length ? `${form.subServices.length} selected` : null}
              />
              <div className="bg-filter-chips" role="radiogroup" aria-label="Service type" style={{ marginBottom: 12 }}>
                {serviceTypes.map(s => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.serviceType === s.key}
                    key={s.key}
                    className={`bg-filter-chip ${form.serviceType === s.key ? "active" : ""}`}
                    onClick={() => update("serviceType", s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="bgm-svc-grid">
                {visibleSubServices.map(service => {
                  const checked = form.subServices.includes(service);
                  return (
                    <label key={service} className={`bgm-svc-tile ${checked ? "active" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSubService(service)} />
                      <span>{service}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* SCHEDULE */}
            <section className="bgm-section">
              <SectionHead
                step={nextStep()}
                title="Schedule"
                done={stepDone.schedule}
                hint={
                  form.subServices.length > 1 && serviceSchedules[form.subServices[0]]?.start_date ? (
                    <button type="button" className="bg-link-btn" onClick={applyFirstScheduleToAll}>
                      Use first date for all
                    </button>
                  ) : null
                }
              />
              {form.subServices.length === 0 ? (
                <div className="bg-field-hint">Pick services to set their first visit date.</div>
              ) : (
                <div>
                  {form.subServices.map(service => {
                    const schedule = serviceSchedules[service] || defaultSchedule;
                    return (
                      <div key={service} className="bgm-schedule-row">
                        <div className="bgm-schedule-name">{service}</div>
                        <div className="bg-field">
                          <input
                            type="date"
                            value={schedule.start_date || ""}
                            min={new Date().toISOString().split("T")[0]}
                            onChange={e => updateServiceSchedule(service, { start_date: e.target.value })}
                            aria-label={`First visit date for ${service}`}
                          />
                        </div>
                        <div className="bg-field">
                          <input
                            type="time"
                            value={schedule.time || ""}
                            onChange={e => updateServiceSchedule(service, { time: e.target.value })}
                            aria-label={`Visit time for ${service}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* RECURRENCE */}
              <div className="bgm-subsection">
                <label className="bgm-check" style={{ marginTop: 0 }}>
                  <input
                    type="checkbox"
                    checked={form.recurrenceEnabled}
                    onChange={e => update("recurrenceEnabled", e.target.checked)}
                  />
                  <strong>Repeat this booking</strong>
                </label>

                {recurrenceActive && (
                  <div className="bgm-recur">
                    <div className="bg-field">
                      <span className="bg-label">Frequency</span>
                      <div className="bg-filter-chips" role="radiogroup" aria-label="Frequency">
                        {recurrenceTypes.map(option => (
                          <button
                            type="button"
                            role="radio"
                            aria-checked={form.recurrenceType === option.value}
                            key={option.value}
                            className={`bg-filter-chip ${form.recurrenceType === option.value ? "active" : ""}`}
                            onClick={() => update("recurrenceType", option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-grid-2">
                      {recurrenceNeedsInterval && (
                        <div className="bg-field">
                          <label htmlFor="cbm-interval">
                            Every how many {form.recurrenceType === "CUSTOM_DAYS" ? "days" : form.recurrenceType === "CUSTOM_WEEKS" ? "weeks" : "months"}
                          </label>
                          <input
                            id="cbm-interval"
                            type="number"
                            min="1"
                            value={form.recurrenceInterval}
                            onChange={e => update("recurrenceInterval", e.target.value)}
                          />
                        </div>
                      )}
                      <div className="bg-field">
                        <label htmlFor="cbm-recur-end">Repeat until</label>
                        <input
                          id="cbm-recur-end"
                          type="date"
                          value={form.recurrenceEndDate}
                          onChange={(e) => update("recurrenceEndDate", e.target.value)}
                        />
                      </div>
                    </div>

                    {recurrenceIsMonthly && (
                      <div className="bg-field">
                        <span className="bg-label">Monthly pattern</span>
                        <div className="bg-filter-chips" role="radiogroup" aria-label="Monthly pattern">
                          {[
                            { key: "day_of_month", label: "Day of month" },
                            { key: "week_day", label: "Week & day" },
                          ].map(option => (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={form.recurrenceMonthMode === option.key}
                              key={option.key}
                              className={`bg-filter-chip ${form.recurrenceMonthMode === option.key ? "active" : ""}`}
                              onClick={() => update("recurrenceMonthMode", option.key)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {recurrenceIsMonthly && form.recurrenceMonthMode === "day_of_month" && (
                      <div className="bg-field" style={{ maxWidth: 260 }}>
                        <label htmlFor="cbm-dom">Day of month</label>
                        <select
                          id="cbm-dom"
                          value={form.recurrenceDayOfMonth}
                          onChange={e => update("recurrenceDayOfMonth", e.target.value)}
                        >
                          <option value="">Use start date</option>
                          {monthDays.map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {recurrenceIsMonthly && form.recurrenceMonthMode === "week_day" && (
                      <>
                        <div className="bg-field">
                          <span className="bg-label">Weeks of month</span>
                          <div className="bg-filter-chips">
                            {monthWeeks.map(week => (
                              <button
                                type="button"
                                key={week.value}
                                aria-pressed={form.recurrenceWeeksOfMonth.includes(week.value)}
                                className={`bg-filter-chip ${form.recurrenceWeeksOfMonth.includes(week.value) ? "active" : ""}`}
                                onClick={() => toggleMonthWeek(week.value)}
                              >
                                {week.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="bg-field">
                          <span className="bg-label">Days of week</span>
                          <div className="bg-filter-chips">
                            {daysOfWeek.map(day => (
                              <button
                                type="button"
                                key={day.value}
                                aria-pressed={form.recurrenceMonthWeekdays.includes(day.value)}
                                className={`bg-filter-chip ${form.recurrenceMonthWeekdays.includes(day.value) ? "active" : ""}`}
                                onClick={() => toggleMonthWeekday(day.value)}
                              >
                                {day.label.slice(0, 3)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {recurrenceUsesWeekdays && (
                      <div className="bg-field">
                        <span className="bg-label">Days of week</span>
                        <div className="bg-filter-chips">
                          {daysOfWeek.map(day => (
                            <button
                              type="button"
                              key={day.value}
                              aria-pressed={form.recurrenceDaysOfWeek.includes(day.value)}
                              className={`bg-filter-chip ${form.recurrenceDaysOfWeek.includes(day.value) ? "active" : ""}`}
                              onClick={() => toggleRecurrenceDay(day.value)}
                            >
                              {day.label.slice(0, 3)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* TEAM */}
            {!isClient && (
              <section className="bgm-section">
                <SectionHead step={nextStep()} title="Team" done={stepDone.team} />
                <div className="bgm-team">
                  <button type="button" className="secondary" onClick={() => setShowAssignModal(true)}>
                    {assignedSupervisorId || assignedTechnicianIds?.length ? "Change team" : "Assign team"}
                  </button>
                  {assignedSupervisorId || assignedTechnicianIds?.length ? (
                    <div className="bgm-team-chips">
                      {assignedSupervisorName && <span className="bg-chip accent">Supervisor: {assignedSupervisorName}</span>}
                      {assignedTechnicianName && <span className="bg-chip muted">{assignedTechnicianName}</span>}
                    </div>
                  ) : (
                    <span className="bg-field-hint">
                      {needsSupervisor ? "A supervisor and at least one technician." : "At least one technician from your team."}
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* NOTES */}
            <section className="bgm-section">
              <SectionHead step={nextStep()} title="Notes" hint="Optional" />
              <div className="bg-field">
                <textarea
                  rows={3}
                  value={form.notes}
                  placeholder="Anything the team should know"
                  onChange={e => update("notes", e.target.value)}
                  aria-label="Notes"
                />
              </div>
            </section>
          </div>

          {/* SUMMARY RAIL */}
          <aside className="bgm-summary" aria-label="Booking summary">
            <div className="bgm-summary-body">
              <h4>Booking summary</h4>

              <div className="bgm-sum-rows">
                {!isClient && (
                  <div className="bgm-sum-row"><span>Requested by</span><span>{selectedContact?.name || "—"}</span></div>
                )}
                {contactCompany && (
                  <div className="bgm-sum-row"><span>Company</span><span>{contactCompany}</span></div>
                )}
                <div className="bgm-sum-row"><span>Service type</span><span>{serviceTypeLabel}</span></div>
                <div className="bgm-sum-row"><span>Repeats</span><span>{recurrenceSummary}</span></div>
                {form.location?.trim() && (
                  <div className="bgm-sum-row"><span>Address</span><span>{form.location}</span></div>
                )}
              </div>

              <div>
                <h4 style={{ marginBottom: 10 }}>Services · {form.subServices.length}</h4>
                {form.subServices.length === 0 ? (
                  <div className="bg-field-hint">No services picked yet.</div>
                ) : (
                  <div className="bgm-sum-lines">
                    {form.subServices.map(s => {
                      const sch = serviceSchedules[s];
                      return (
                        <div key={s} className="bgm-sum-line">
                          <span>{s}</span>
                          <span className={sch?.start_date ? "" : "bg-field-hint"}>
                            {sch?.start_date ? `${formatShortDate(sch.start_date)}${sch.time ? ` · ${sch.time}` : ""}` : "No date"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {!isClient && (
                <div className="bgm-sum-rows">
                  <h4 style={{ marginBottom: 4 }}>Team</h4>
                  {needsSupervisor && (
                    <div className="bgm-sum-row"><span>Supervisor</span><span>{assignedSupervisorName || "—"}</span></div>
                  )}
                  <div className="bgm-sum-row"><span>Technicians</span><span>{assignedTechnicianName || "—"}</span></div>
                </div>
              )}

              {missing.length ? (
                <div>
                  <h4 style={{ marginBottom: 8 }}>Still needed</h4>
                  <ul className="bgm-todo">
                    {missing.map(m => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bgm-ready">Everything is filled in — ready to create.</div>
              )}
            </div>

            <div className="bgm-summary-foot">
              <button type="button" className="primary" onClick={handleSubmit}>
                Create booking
              </button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </aside>
        </div>
      </div>

      <AssignWorkOrderModal
        isOpen={showAssignModal}
        jobCount={1}
        hideScope
        role={role}
        onClose={() => setShowAssignModal(false)}
        hideSupervisor={role === "supervisor"}
        onAssign={({ supervisorId, technicianIds }) => {

          setAssignedSupervisorId(supervisorId);
          setAssignedTechnicianIds(technicianIds || []);

          const sup = supervisors?.find(u => String(u.id) === String(supervisorId));

          const selectedTechs = (technicianIds || [])
            .map(id => technicians?.find(u => String(u.id) === String(id)))
            .filter(Boolean);

          const techNames = selectedTechs.map(t => t.name).join(", ");

          setAssignedSupervisorName(sup?.name || (supervisorId ? `Supervisor #${supervisorId}` : ""));
          setAssignedTechnicianName(techNames || "No technician");

          setShowAssignModal(false);
        }}

      />

      <StatusAlertModal
        status={status}
        onClose={() => {
          const wasSuccess = status?.type === "success";
          setStatus(null);
          if (wasSuccess) onClose();
        }}
      />
    </div>

  );
}

function SectionHead({ step, title, done, hint }) {
  return (
    <div className="bgm-section-head">
      <span className={`bgm-step ${done ? "done" : ""}`} aria-hidden="true">{done ? "✓" : step}</span>
      <h4>{title}</h4>
      {hint && <span className="bg-field-hint">{hint}</span>}
    </div>
  );
}

function formatShortDate(value) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

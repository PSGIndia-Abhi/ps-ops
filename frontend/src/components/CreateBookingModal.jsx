import { useState, useEffect, useMemo, useRef } from "react";
import { apiFetch } from "../api";
import CreateContactModal from "./CreateContactModal";
import AssignWorkOrderModal from "./AssignWorkOrderModal";



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

  const visibleSubServices =
    form.serviceType === "PEST"
      ? pestServices
      : form.serviceType === "DEEP"
        ? deepCleaningServices
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
      alert(role === "client"
        ? "Your contact profile is missing. Please contact support."
        : "Please select who is requesting this booking");
      return;
    }

    if (!form.subServices.length) {
      alert("Please select at least one service");
      return;
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
        alert(`Date of service is required for ${service}`);
        return;
      }

      if (scheduleType === "range") {
        if (!endDateValue) {
          alert(`End date is required for ${service}`);
          return;
        }
        const start = new Date(`${startDateValue}T00:00:00`);
        const end = new Date(`${endDateValue}T00:00:00`);
        if (end < start) {
          alert(`End date cannot be before start date for ${service}`);
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
        alert("Start date is required for recurring bookings");
        return;
      }
      if (!form.recurrenceEndDate) {
        alert("End date is required for recurring bookings");
        return;
      }
      const recurrenceEndDate = form.recurrenceEndDate;
      const recurrenceEndObj = new Date(`${recurrenceEndDate}T00:00:00`);
      const recurrenceStartObj = new Date(`${startDateValue}T00:00:00`);
      if (recurrenceEndObj < recurrenceStartObj) {
        alert("Recurring end date cannot be before start date");
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
      alert("Booking created successfully");

      onClose(); // 👈 close modal if you have it

    } catch (err) {
      console.error("Create booking failed", err);
      alert("Failed to create booking");
    }
  }

  /* ---------- STYLES ---------- */

  const overlay = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1200,
  };

  const modal = {
    width: "600px",
    maxWidth: "90vw",
    maxHeight: "90vh",
    background: "#ffffff",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  };

  const body = {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
  };

  const section = { marginBottom: "28px" };

  const input = {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    width: "100%",
  };

  const pillRow = {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  };

  const pill = active => ({
    padding: "8px 14px",
    borderRadius: "999px",
    border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
    background: active ? "#eff6ff" : "#ffffff",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
  });

  const dayPill = active => ({
    ...pill(active),
    padding: "6px 10px",
    fontSize: "12px",
  });

  const subGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px",
    maxHeight: "160px",
    overflowY: "auto",
  };

  const subItem = active => ({
    padding: "10px",
    borderRadius: "8px",
    border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
    background: active ? "#eff6ff" : "#ffffff",
    fontSize: "13px",
    cursor: "pointer",
    textAlign: "center",
  });

  const serviceScheduleCard = {
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "12px",
    background: "#f9fafb",
  };

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


  function getShortName(name) {
  // Pest control
    if (name.includes("Pre-Construction")) return "Termite Pre";
  if (name.includes("Post-Construction")) return "Termite Post";
  if (name.includes("Indoor Residual Spray")) return "Mosquito IRS";
  if (name.includes("Larval")) return "Mosquito Larval";
  if (name.includes("General Pest Control + Rodent Control")) return "GPC + Rodent Control";
  // Deep cleaning
  if (name === "Electrical New Point Installation") return "Electrical Point";
  if (name === "Plumbing Work") return "Plumbing";
  if (name === "Painting Work") return "Painting";
  if (name === "Deep Cleaning with Scrubbing") return "Deep Clean + Scrub";
  if (name === "Deep Cleaning with Sticker Removal") return "Deep Clean + Sticker";


  return name;
}

  /* ---------- RENDER ---------- */

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* HEADER */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb" }}>
          <h3>Create Booking</h3>
        </div>

        {/* BODY */}
        <div style={body}>
          {role !== "client" && (
            <>
              {/* REQUESTED BY */}
              <div style={section}>
                <h4>Requested By</h4>

                <div ref={contactDropdownRef} style={{ position: "relative" }}>

                  <input
                    type="text"
                    value={contactSearch}
                    onFocus={() => setShowContactResults(true)}
                    onChange={(e) => {
                      setContactSearch(e.target.value);
                      setShowContactResults(true);
                    }}
                    placeholder="Search contacts by name, phone, email, or company"
                    style={input}
                  />
                  {showContactResults && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "#fff",
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        maxHeight: "220px",
                        overflowY: "auto",
                        marginTop: "4px",
                        zIndex: 50
                      }}
                    >
                      {loadingContacts ? (
                        <div style={{ padding: "10px", fontSize: "13px", color: "#6b7280" }}>
                          Loading contacts…
                        </div>
                      ) : filteredContacts.length === 0 ? (
                        <div style={{ padding: "10px", fontSize: "13px", color: "#6b7280" }}>
                          No contacts found
                        </div>
                      ) : (
                        filteredContacts.map(c => {
                          const companyLabel = [c.company_name, c.company_site].filter(Boolean).join(" - ");
                          const phoneLabel = c.phone || c.contact_phone || "";

                          return (
                            <div
                              key={c.id}
                              style={{
                                padding: "10px",
                                cursor: "pointer",
                                borderBottom: "1px solid #f3f4f6",
                                fontSize: "13px"
                              }}
                              onClick={() => {
                                setForm(prev => ({ ...prev, contactId: c.id }));
                                setContactSearch(`${c.name} - ${c.phone || c.contact_phone || ""}`);
                                setShowContactResults(false);
                              }}

                            >
                              <strong>{c.name}</strong>
                              {phoneLabel ? ` • ${phoneLabel}` : ""}
                              {companyLabel ? ` • ${companyLabel}` : ""}
                              {c.company_code ? ` (${c.company_code})` : ""}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                </div>

                <button
                  style={{ marginTop: "10px" }}
                  onClick={() => setIsContactModalOpen(true)}
                >
                  + Create Contact
                </button>
              </div>

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
            </>
          )}


          {/* ADDRESS / LOCATION */}
          <div style={section}>
            <h4>Service Address / Location</h4>
            <input
              type="text"
              value={form.location}
              onChange={e => update("location", e.target.value)}
              placeholder="Enter service address or location"
              style={input}
            />
            {selectedContact?.company_id && (
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "13px" }}>
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
                Use company address
              </label>
            )}
          </div>

          {/* SERVICE TYPE */}
          <div style={section}>
            <h4>Service Type</h4>
            <div style={pillRow}>
              {[
                { key: "PEST", label: "Pest Control" },
                { key: "DEEP", label: "Deep Cleaning" },
                { key: "BOTH", label: "Both" },
              ].map(s => (
                <div
                  key={s.key}
                  style={pill(form.serviceType === s.key)}
                  onClick={() => update("serviceType", s.key)}
                >
                  {s.label}
                </div>
              ))}
            </div>
          </div>

          {/* SUB SERVICES */}
          <div style={section}>
            <h4>Sub Services</h4>
            <div style={subGrid}>
              {visibleSubServices.map(service => (
                <div
                  key={service}
                  style={subItem(form.subServices.includes(service))}
                  onClick={() => toggleSubService(service)}
                >
                  {getShortName(service)}
                </div>
              ))}
            </div>
          </div>

          {/* SERVICE SCHEDULES */}
          <div style={section}>
            <h4>Service Schedules</h4>
            {form.subServices.length === 0 ? (
              <div style={{ fontSize: "13px", color: "#6b7280" }}>
                Select services to set dates.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {form.subServices.map(service => {
                  const schedule = serviceSchedules[service] || defaultSchedule;
                  return (
                    <div key={service} style={serviceScheduleCard}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{service}</div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                          First Service Visit Date
                        </div>
                        <input
                          type="date"
                          value={schedule.start_date || ""}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={e => updateServiceSchedule(service, { start_date: e.target.value })}
                          style={input}
                        />

                        <input
                          type="time"
                          value={schedule.time || ""}
                          onChange={e => updateServiceSchedule(service, { time: e.target.value })}
                          style={{ ...input, marginTop: "8px" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RECURRENCE */}
          <div style={section}>
            <h4>Recurring</h4>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={form.recurrenceEnabled}
                onChange={e => update("recurrenceEnabled", e.target.checked)}
              />
              Repeat this booking
            </label>

            {recurrenceActive && (
              <div style={{ marginTop: "12px" }}>
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                    Recurrence End Date
                  </div>
                  <input
                    type="date"
                    value={form.recurrenceEndDate}
                    onChange={(e) => update("recurrenceEndDate", e.target.value)}
                    style={input}
                  />
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                  Frequency
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    { value: "DAILY", label: "Daily" },
                    { value: "WEEKLY", label: "Weekly" },
                    { value: "CUSTOM_DAYS", label: "Every X Days" },
                    { value: "CUSTOM_WEEKS", label: "Every X Weeks" },
                    { value: "CUSTOM_MONTHS", label: "Every X Months" },
                  ].map(option => (
                    <label
                      key={option.value}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 10px",
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      <input
                        type="radio"
                        name="recurrenceType"
                        value={option.value}
                        checked={form.recurrenceType === option.value}
                        onChange={() => update("recurrenceType", option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>

                {recurrenceNeedsInterval && (
                  <div style={{ marginTop: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                      Interval
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="number"
                        min="1"
                        value={form.recurrenceInterval}
                        onChange={e => update("recurrenceInterval", e.target.value)}
                        style={{ ...input, width: "120px" }}
                      />
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>
                        {form.recurrenceType === "CUSTOM_DAYS"
                          ? "days"
                          : form.recurrenceType === "CUSTOM_WEEKS"
                            ? "weeks"
                            : "months"}
                      </div>
                    </div>
                  </div>
                )}

                {recurrenceIsMonthly && (
                  <div style={{ marginTop: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                      Monthly Pattern
                    </div>
                    <div style={pillRow}>
                      {[
                        { key: "day_of_month", label: "Day of Month" },
                        { key: "week_day", label: "Week & Day" },
                      ].map(option => (
                        <div
                          key={option.key}
                          style={pill(form.recurrenceMonthMode === option.key)}
                          onClick={() => update("recurrenceMonthMode", option.key)}
                        >
                          {option.label}
                        </div>
                      ))}
                    </div>

                    {form.recurrenceMonthMode === "day_of_month" ? (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                          Day of Month
                        </div>
                        <select
                          value={form.recurrenceDayOfMonth}
                          onChange={e => update("recurrenceDayOfMonth", e.target.value)}
                          style={input}
                        >
                          <option value="">Use start date</option>
                          {monthDays.map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div style={{ marginTop: "12px", display: "grid", gap: "12px" }}>
                        <div>
                          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                            Weeks of Month
                          </div>
                          <div style={pillRow}>
                            {monthWeeks.map(week => (
                              <div
                                key={week.value}
                                style={pill(form.recurrenceWeeksOfMonth.includes(week.value))}
                                onClick={() => toggleMonthWeek(week.value)}
                              >
                                {week.label}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                            Days of Week
                          </div>
                          <div style={pillRow}>
                            {daysOfWeek.map(day => (
                              <div
                                key={day.value}
                                style={dayPill(form.recurrenceMonthWeekdays.includes(day.value))}
                                onClick={() => toggleMonthWeekday(day.value)}
                              >
                                {day.label}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {recurrenceUsesWeekdays && (
                  <div style={{ marginTop: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                      Days of Week
                    </div>
                    <div style={pillRow}>
                      {daysOfWeek.map(day => (
                        <div
                          key={day.value}
                          style={dayPill(form.recurrenceDaysOfWeek.includes(day.value))}
                          onClick={() => toggleRecurrenceDay(day.value)}
                        >
                          {day.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assignment */}
          {role !== "client" && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAssignModal(true)}
              >
                Assign Team
              </button>

              {(assignedSupervisorId || assignedTechnicianIds) && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "#eef2ff",
                    border: "1px solid #c7d2fe",
                    fontSize: 13,
                    color: "#1e3a8a",
                  }}
                >
                  <strong>Assigned:</strong>{" "}
                  {assignedSupervisorName || "No supervisor"}
                  {"  •  "}
                  {assignedTechnicianName || "No technician"}
                </div>
              )}
            </div>
          )}


          {/* NOTES */}
          <div style={section}>
            <h4>Notes</h4>
            <textarea
              style={{ ...input, minHeight: "80px" }}
              placeholder="Optional notes"
              onChange={e => update("notes", e.target.value)}
            />
          </div>
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSubmit}>
            Create Booking
          </button>
        </div>
      </div>
      <AssignWorkOrderModal
        isOpen={showAssignModal}
        jobCount={1}
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

          setAssignedSupervisorName(sup?.name || `Supervisor #${supervisorId}`);
          setAssignedTechnicianName(techNames || "No technician");

          setShowAssignModal(false);
        }}

      />
    </div>

  );
}

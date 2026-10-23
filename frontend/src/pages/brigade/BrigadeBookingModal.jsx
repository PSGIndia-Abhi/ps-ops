import { useEffect, useMemo, useState } from "react";
import CreateContactModal from "../../components/CreateContactModal";
import AssignWorkOrderModal from "../../components/AssignWorkOrderModal";
import StatusAlertModal from "../../components/StatusAlertModal";
import {
  brigadeRequest,
  flatNumberError,
  formatDate,
  formatInr,
  isValidFlatNumber,
  statusLabel,
} from "./brigadeShared";
import "./brigade.css";

// Brigade booking form. Left: Property, flat number (typed) + BHK (master) →
// Deep Cleaning services (price + what was already done for that flat) →
// Requested by → Schedule → Team → Client PO → Notes.
// Right: live summary with the total and what is still missing.
// Saved through POST /api/brigade/bookings, which re-checks the flat, BHK,
// prices and refuses a service that is already booked for the flat.
export default function BrigadeBookingModal({ isOpen, onClose, onCreated }) {
  const [properties, setProperties] = useState([]);
  const [subServicesAll, setSubServicesAll] = useState([]);
  const [bhkTypes, setBhkTypes] = useState([]); // names from the BHK types master
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [setupError, setSetupError] = useState("");

  const [propertyKey, setPropertyKey] = useState(""); // `${companyId}|${siteId}`
  const [flatInput, setFlatInput] = useState(""); // typed flat number
  const [bhk, setBhk] = useState("");
  const [bhkFromHistory, setBhkFromHistory] = useState(false);
  const [history, setHistory] = useState(null); // GET /api/brigade/flat-history
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [flat, setFlat] = useState(null); // { flat_number, bhk } once priced
  const [flatLookupError, setFlatLookupError] = useState("");
  const [lookingUpFlat, setLookingUpFlat] = useState(false);
  const [prices, setPrices] = useState({}); // sub_service -> price | null
  const [showUnpriced, setShowUnpriced] = useState(false);

  const [selectedServices, setSelectedServices] = useState([]);
  const [schedules, setSchedules] = useState({}); // sub_service -> { start_date, time }

  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactId, setContactId] = useState("");
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [address, setAddress] = useState("");

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [team, setTeam] = useState({ supervisorId: null, technicianIds: [] });
  const [people, setPeople] = useState({ supervisors: [], technicians: [] });

  const [po, setPo] = useState({ number: "", source: "", date: "", amount: "" });
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const today = new Date().toISOString().split("T")[0];

  /* ---------- setup: services + properties + people for names ---------- */
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    async function load() {
      setLoadingSetup(true);
      setSetupError("");
      try {
        const [meta, props] = await Promise.all([
          brigadeRequest("/api/brigade/meta"),
          brigadeRequest("/api/brigade/properties"),
        ]);
        if (cancelled) return;
        setSubServicesAll(meta?.sub_services || []);
        setBhkTypes(meta?.bhk_types || []);
        setProperties(Array.isArray(props) ? props : []);
      } catch (err) {
        if (!cancelled) setSetupError(err.message || "Failed to load Brigade properties");
      } finally {
        if (!cancelled) setLoadingSetup(false);
      }
      // Names for the summary; the team picker loads its own lists.
      try {
        const [sups, techs] = await Promise.all([
          brigadeRequest("/api/users?role=supervisor"),
          brigadeRequest("/api/users?role=technician"),
        ]);
        if (!cancelled) {
          setPeople({
            supervisors: Array.isArray(sups) ? sups : [],
            technicians: Array.isArray(techs) ? techs : [],
          });
        }
      } catch {
        /* names fall back to "#id" */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const propertyOptions = useMemo(() => {
    const options = [];
    for (const p of properties) {
      if (!p.sites.length) {
        options.push({ key: `${p.id}|`, label: `${p.name} (no site — add one in Companies)`, disabled: true });
        continue;
      }
      for (const s of p.sites) {
        options.push({
          key: `${p.id}|${s.id}`,
          label: p.sites.length > 1 ? `${p.name} – ${s.name}` : p.name,
          property: p,
          site: s,
        });
      }
    }
    return options;
  }, [properties]);

  const selectedOption = propertyOptions.find((o) => o.key === propertyKey) || null;
  const companyId = selectedOption?.property?.id || "";
  const site = selectedOption?.site || null;

  /* ---------- property change: reset flat, load contacts, address ---------- */
  useEffect(() => {
    setFlatInput("");
    setBhk("");
    setBhkFromHistory(false);
    setHistory(null);
    setFlat(null);
    setFlatLookupError("");
    setPrices({});
    setSelectedServices([]);
    setSchedules({});
    setContactId("");
    setContacts([]);
    if (!site) {
      setAddress("");
      return;
    }
    setAddress([site.address, site.city, site.state].filter(Boolean).join(", "));

    let cancelled = false;
    setLoadingContacts(true);
    brigadeRequest(`/api/contacts?site_id=${encodeURIComponent(site.id)}`)
      .then((rows) => {
        if (!cancelled) setContacts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingContacts(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyKey]);

  /* ---------- flat typed: its history (last BHK + what was done) ---------- */
  const flatNumber = flatInput.trim().toUpperCase();
  const flatValid = isValidFlatNumber(flatNumber);
  const flatError = flatInput ? flatNumberError(flatNumber) : "";

  useEffect(() => {
    setHistory(null);
    if (!companyId || !flatValid) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoadingHistory(true);
      const params = new URLSearchParams({ company_id: companyId, flat_number: flatNumber });
      brigadeRequest(`/api/brigade/flat-history?${params}`)
        .then((data) => {
          if (cancelled) return;
          setHistory(data);
          // Same flat booked before: start from its last BHK (she can change it).
          if (data.last_bhk) {
            setBhk((current) => {
              if (current) return current;
              setBhkFromHistory(true);
              return data.last_bhk;
            });
          }
        })
        .catch(() => {
          if (!cancelled) setHistory(null);
        })
        .finally(() => {
          if (!cancelled) setLoadingHistory(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [companyId, flatNumber, flatValid]);

  // service -> { state: "none" | "completed" | "booked", job, last_completed }
  const serviceHistory = useMemo(
    () => Object.fromEntries((history?.services || []).map((s) => [s.sub_service, s])),
    [history]
  );
  const isBlocked = (s) => serviceHistory[s]?.state === "booked";

  // Already-booked services can never stay picked; completed ones start unticked.
  useEffect(() => {
    if (!history) return;
    const done = new Set(
      history.services.filter((s) => s.state !== "none").map((s) => s.sub_service)
    );
    setSelectedServices((prev) => prev.filter((s) => !done.has(s)));
    setSchedules((prev) => Object.fromEntries(Object.entries(prev).filter(([s]) => !done.has(s))));
  }, [history]);

  /* ---------- flat + BHK: every service's price ---------- */
  useEffect(() => {
    setFlat(null);
    setFlatLookupError("");
    setPrices({});
    if (!companyId || !flatValid || !bhk || !subServicesAll.length) return;

    let cancelled = false;
    setLookingUpFlat(true);
    const params = new URLSearchParams({
      company_id: companyId,
      flat_number: flatNumber,
      bhk,
      sub_services: subServicesAll.join(","),
    });
    brigadeRequest(`/api/brigade/quote?${params}`)
      .then((data) => {
        if (cancelled) return;
        setFlat(data.flat);
        setPrices(Object.fromEntries(data.lines.map((l) => [l.sub_service, l.price])));
        // Drop any picked service that has no price for this flat.
        setSelectedServices((prev) => prev.filter((s) => data.lines.some((l) => l.sub_service === s && l.price !== null)));
      })
      .catch((err) => {
        if (!cancelled) setFlatLookupError(err.message || "Could not load prices for this flat");
      })
      .finally(() => {
        if (!cancelled) setLookingUpFlat(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, flatNumber, flatValid, bhk, subServicesAll]);

  const hasPrice = (s) => prices[s] !== null && prices[s] !== undefined;
  const pricedServices = subServicesAll.filter(hasPrice);
  const unpricedServices = subServicesAll.filter((s) => !hasPrice(s));
  const total = selectedServices.reduce((sum, s) => sum + (prices[s] || 0), 0);

  function toggleService(service) {
    if (!hasPrice(service) || isBlocked(service)) return;
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
    setSchedules((prev) => {
      const next = { ...prev };
      if (next[service]) delete next[service];
      else next[service] = { start_date: "", time: "" };
      return next;
    });
  }

  function updateSchedule(service, patch) {
    setSchedules((prev) => ({ ...prev, [service]: { ...(prev[service] || {}), ...patch } }));
  }

  // Same date/time for every picked service.
  function applyFirstScheduleToAll() {
    const first = schedules[selectedServices[0]];
    if (!first) return;
    setSchedules((prev) => {
      const next = { ...prev };
      for (const s of selectedServices) next[s] = { ...first };
      return next;
    });
  }

  const supervisorName = team.supervisorId
    ? people.supervisors.find((u) => String(u.id) === String(team.supervisorId))?.name || `Supervisor #${team.supervisorId}`
    : "";
  const technicianNames = team.technicianIds.map(
    (id) => people.technicians.find((u) => String(u.id) === String(id))?.name || `#${id}`
  );
  const contact = contacts.find((c) => c.id === contactId) || null;

  /* ---------- what is still missing (drives the summary + submit) ---------- */
  const missing = [];
  if (!site) missing.push("Choose the property");
  else if (!flatValid) missing.push("Enter the flat number");
  else if (!bhk) missing.push("Choose the BHK");
  if (flat && !selectedServices.length) missing.push("Pick at least one service");
  if (!contactId) missing.push("Choose who is requesting");
  const undated = selectedServices.filter((s) => !schedules[s]?.start_date);
  if (undated.length) missing.push(`Set the visit date for ${undated.length === 1 ? undated[0] : `${undated.length} services`}`);
  if (!team.supervisorId) missing.push("Assign a supervisor");
  if (!team.technicianIds.length) missing.push("Assign at least one technician");
  const poAmountInvalid = po.amount !== "" && (!Number.isFinite(Number(po.amount)) || Number(po.amount) < 0);
  if (poAmountInvalid) missing.push("Fix the PO amount");

  const stepDone = {
    property: Boolean(flat),
    services: selectedServices.length > 0,
    contact: Boolean(contactId),
    schedule: selectedServices.length > 0 && undated.length === 0,
    team: Boolean(team.supervisorId && team.technicianIds.length),
  };

  async function handleSubmit() {
    if (missing.length) {
      setStatus({ type: "error", message: `${missing[0]}.` });
      return;
    }
    if (!flat) {
      setStatus({ type: "error", message: flatLookupError || "Prices for this flat are still loading" });
      return;
    }

    const serviceSchedules = {};
    let earliest = "";
    for (const s of selectedServices) {
      const { start_date, time } = schedules[s];
      serviceSchedules[s] = { scheduleType: "single", start_date, end_date: null, time: time || null };
      if (!earliest || start_date < earliest) earliest = start_date;
    }

    setSaving(true);
    try {
      const data = await brigadeRequest("/api/brigade/bookings", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          site_id: site.id,
          flat_number: flat.flat_number,
          bhk: flat.bhk,
          subServices: selectedServices,
          contact_id: contactId,
          address: address.trim(),
          start_date: earliest,
          serviceSchedules,
          supervisor_id: team.supervisorId,
          technician_ids: team.technicianIds,
          client_po: {
            number: po.number.trim(),
            source: po.source.trim(),
            date: po.date,
            amount: po.amount === "" ? null : Number(po.amount),
          },
          notes: notes.trim(),
        }),
      });
      onCreated?.(data);
      setStatus({ type: "success", message: "Booking created successfully" });
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Failed to create booking" });
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const historyCounts = history
    ? {
        completed: history.services.filter((s) => s.state === "completed").length,
        booked: history.services.filter((s) => s.state === "booked").length,
      }
    : null;

  /* ---------- render ---------- */
  return (
    <div className="bgm-overlay">
      <div className="bgm-modal" role="dialog" aria-modal="true" aria-labelledby="bgm-title">
        <div className="bgm-header">
          <div>
            <h3 id="bgm-title">New Brigade Booking</h3>
            <p>Deep Cleaning · prices from the Brigade price master, excluding GST</p>
          </div>
          <button type="button" className="bgm-close" onClick={onClose} aria-label="Close" disabled={saving}>
            ×
          </button>
        </div>

        <div className="bgm-content">
          <div className="bgm-main">
            {setupError && <div className="bg-error">{setupError}</div>}

            {/* 1. PROPERTY & FLAT */}
            <section className="bgm-section">
              <SectionHead step={1} title="Property & flat" done={stepDone.property} />
              <div>
                <div className="bg-field">
                  <label htmlFor="bg-property">Property</label>
                  <select
                    id="bg-property"
                    value={propertyKey}
                    onChange={(e) => setPropertyKey(e.target.value)}
                    disabled={loadingSetup}
                  >
                    <option value="">{loadingSetup ? "Loading properties…" : "Select property"}</option>
                    {propertyOptions.map((o) => (
                      <option key={o.key} value={o.key} disabled={o.disabled}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {!loadingSetup && !propertyOptions.length && (
                    <span className="bg-field-hint">No properties yet. Add a company under Brigade Group first.</span>
                  )}
                </div>
              </div>
              <div className="bg-grid-2" style={{ marginTop: 12 }}>
                <div className="bg-field">
                  <label htmlFor="bg-flat-number">Flat number</label>
                  <input
                    id="bg-flat-number"
                    value={flatInput}
                    maxLength={6}
                    placeholder={site ? "e.g. L-0123" : "Choose the property first"}
                    disabled={!site}
                    autoComplete="off"
                    className={flatError ? "invalid" : undefined}
                    onChange={(e) => {
                      setFlatInput(e.target.value.toUpperCase());
                      if (bhkFromHistory) {
                        setBhk("");
                        setBhkFromHistory(false);
                      }
                    }}
                  />
                  {flatError ? (
                    <span className="bg-field-error">{flatError}</span>
                  ) : (
                    <span className="bg-field-hint">One capital letter, hyphen, 4 digits</span>
                  )}
                </div>
                <div className="bg-field">
                  <label htmlFor="bg-bhk">BHK</label>
                  <select
                    id="bg-bhk"
                    value={bhk}
                    disabled={!site}
                    onChange={(e) => {
                      setBhk(e.target.value);
                      setBhkFromHistory(false);
                    }}
                  >
                    <option value="">{bhkTypes.length ? "Select BHK" : "No BHK types — add them in the master"}</option>
                    {bhkTypes.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  {flatLookupError ? (
                    <span className="bg-field-error">{flatLookupError}</span>
                  ) : bhkFromHistory ? (
                    <span className="bg-field-hint">From this flat&apos;s last booking — change if needed</span>
                  ) : null}
                </div>
              </div>

              {flatValid && site && (
                <div className="bgm-flat-strip">
                  <strong>{flatNumber}</strong>
                  {bhk && <span className="bg-chip accent">{bhk}</span>}
                  <span>{selectedOption.label}</span>
                  {loadingHistory ? (
                    <span className="bg-field-hint">· checking this flat…</span>
                  ) : historyCounts ? (
                    <span className="bgm-flat-history">
                      {historyCounts.completed || historyCounts.booked
                        ? `· ${historyCounts.completed} service${historyCounts.completed === 1 ? "" : "s"} completed, ${historyCounts.booked} booked`
                        : "· First booking for this flat"}
                    </span>
                  ) : null}
                  {lookingUpFlat && <span className="bg-field-hint">· loading prices…</span>}
                </div>
              )}
            </section>

            {/* 2. SERVICES */}
            <section className="bgm-section">
              <SectionHead
                step={2}
                title="Services — Deep Cleaning"
                done={stepDone.services}
                hint={flat ? `${pricedServices.length} of ${subServicesAll.length} priced for ${flat.bhk}` : null}
              />
              {!flat ? (
                <div className="bg-field-hint">Enter the flat number and BHK to see the services, prices and what was already done.</div>
              ) : (
                <>
                  {pricedServices.length === 0 ? (
                    <div className="bg-empty-state">
                      <strong>No prices set for {flat.bhk}</strong>
                      Add {flat.bhk} prices for this property in Prices &amp; BHK.
                    </div>
                  ) : (
                    <div className="bgm-svc-list">
                      {pricedServices.map((s) => {
                        const h = serviceHistory[s];
                        const blocked = isBlocked(s);
                        const picked = selectedServices.includes(s);
                        return (
                          <label
                            key={s}
                            className={`bgm-svc ${picked ? "active" : ""} ${blocked ? "blocked" : ""}`}
                            title={blocked ? "Already booked for this flat" : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={picked}
                              disabled={blocked}
                              onChange={() => toggleService(s)}
                            />
                            <span className="bgm-svc-name">
                              {s}
                              <ServiceHistoryNote history={h} picked={picked} />
                            </span>
                            <span className="bgm-svc-price">{formatInr(prices[s])}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {unpricedServices.length > 0 && (
                    <div className="bgm-more">
                      <button type="button" className="bg-link-btn" onClick={() => setShowUnpriced((v) => !v)}>
                        {showUnpriced ? "Hide" : "Show"} {unpricedServices.length} service{unpricedServices.length === 1 ? "" : "s"} without a price
                      </button>
                      {showUnpriced && (
                        <div className="bgm-svc-list" style={{ marginTop: 6 }}>
                          {unpricedServices.map((s) => (
                            <div key={s} className="bgm-svc disabled">
                              <input type="checkbox" disabled aria-label={s} />
                              <span className="bgm-svc-name">{s}</span>
                              <span className="bgm-svc-price">No price set</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* 3. REQUESTED BY + ADDRESS */}
            <section className="bgm-section">
              <SectionHead step={3} title="Requested by" done={stepDone.contact} />
              {!site ? (
                <div className="bg-field-hint">Choose the property first.</div>
              ) : loadingContacts ? (
                <div className="bg-field-hint">Loading contacts…</div>
              ) : contacts.length === 0 ? (
                <div className="bg-field-hint">No contacts for this property yet — create one below.</div>
              ) : (
                <div className="bgm-contacts" role="radiogroup" aria-label="Requested by">
                  {contacts.map((c) => (
                    <label key={c.id} className={`bgm-contact ${contactId === c.id ? "active" : ""}`}>
                      <input
                        type="radio"
                        name="bg-contact"
                        checked={contactId === c.id}
                        onChange={() => setContactId(c.id)}
                      />
                      <span>
                        <div className="bgm-contact-name">{c.name}</div>
                        <div className="bgm-contact-sub">{[c.phone, c.email].filter(Boolean).join(" · ") || "—"}</div>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {site && (
                <button type="button" className="bg-link-btn" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setIsContactModalOpen(true)}>
                  + Create contact
                </button>
              )}

              <div className="bg-field" style={{ marginTop: 14 }}>
                <label htmlFor="bg-address">Service address</label>
                <input
                  id="bg-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Filled from the property site"
                  disabled={!site}
                />
                <span className="bg-field-hint">The technician&apos;s location check uses the property site on the map.</span>
              </div>
            </section>

            {/* 4. SCHEDULE */}
            <section className="bgm-section">
              <SectionHead
                step={4}
                title="Schedule"
                done={stepDone.schedule}
                hint={
                  selectedServices.length > 1 && schedules[selectedServices[0]]?.start_date ? (
                    <button type="button" className="bg-link-btn" onClick={applyFirstScheduleToAll}>
                      Use first date for all
                    </button>
                  ) : null
                }
              />
              {selectedServices.length === 0 ? (
                <div className="bg-field-hint">Pick services to set their visit dates.</div>
              ) : (
                <div>
                  {selectedServices.map((s) => (
                    <div key={s} className="bgm-schedule-row">
                      <div className="bgm-schedule-name">{s}</div>
                      <div className="bg-field">
                        <input
                          type="date"
                          min={today}
                          value={schedules[s]?.start_date || ""}
                          onChange={(e) => updateSchedule(s, { start_date: e.target.value })}
                          aria-label={`Visit date for ${s}`}
                        />
                      </div>
                      <div className="bg-field">
                        <input
                          type="time"
                          value={schedules[s]?.time || ""}
                          onChange={(e) => updateSchedule(s, { time: e.target.value })}
                          aria-label={`Visit time for ${s}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 5. TEAM */}
            <section className="bgm-section">
              <SectionHead step={5} title="Team" done={stepDone.team} />
              <div className="bgm-team">
                <button type="button" className="secondary" onClick={() => setShowAssignModal(true)}>
                  {team.supervisorId ? "Change team" : "Assign team"}
                </button>
                {team.supervisorId ? (
                  <div className="bgm-team-chips">
                    <span className="bg-chip accent">Supervisor: {supervisorName}</span>
                    {technicianNames.map((n) => (
                      <span key={n} className="bg-chip muted">{n}</span>
                    ))}
                  </div>
                ) : (
                  <span className="bg-field-hint">A supervisor and at least one technician from your branch.</span>
                )}
              </div>
            </section>

            {/* 6. CLIENT PO */}
            <section className="bgm-section">
              <SectionHead step={6} title="Client PO" hint="Optional" />
              <div className="bg-grid-2">
                <div className="bg-field">
                  <label htmlFor="bg-po-number">Client PO number</label>
                  <input
                    id="bg-po-number"
                    value={po.number}
                    maxLength={100}
                    onChange={(e) => setPo((p) => ({ ...p, number: e.target.value }))}
                  />
                </div>
                <div className="bg-field">
                  <label htmlFor="bg-po-source">Where it comes from</label>
                  <input
                    id="bg-po-source"
                    value={po.source}
                    maxLength={255}
                    placeholder="e.g. Email from facility manager"
                    onChange={(e) => setPo((p) => ({ ...p, source: e.target.value }))}
                  />
                </div>
                <div className="bg-field">
                  <label htmlFor="bg-po-date">PO date</label>
                  <input
                    id="bg-po-date"
                    type="date"
                    value={po.date}
                    onChange={(e) => setPo((p) => ({ ...p, date: e.target.value }))}
                  />
                </div>
                <div className="bg-field">
                  <label htmlFor="bg-po-amount">PO amount (₹)</label>
                  <input
                    id="bg-po-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className={poAmountInvalid ? "invalid" : ""}
                    value={po.amount}
                    onChange={(e) => setPo((p) => ({ ...p, amount: e.target.value }))}
                  />
                  {poAmountInvalid && <span className="bg-field-error">Enter a number of 0 or more</span>}
                </div>
              </div>
            </section>

            {/* 7. NOTES */}
            <section className="bgm-section">
              <SectionHead step={7} title="Notes" hint="Optional" />
              <div className="bg-field">
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the team should know"
                  aria-label="Notes"
                />
              </div>
            </section>
          </div>

          {/* SUMMARY RAIL */}
          <aside className="bgm-summary" aria-label="Booking summary">
            <div className="bgm-summary-body">
              <div>
                <h4>Booking summary</h4>
              </div>

              <div className="bgm-sum-rows">
                <div className="bgm-sum-row"><span>Property</span><span>{selectedOption?.label || "—"}</span></div>
                <div className="bgm-sum-row"><span>Flat</span><span>{flat ? `${flat.flat_number} · ${flat.bhk}` : flatValid ? flatNumber : "—"}</span></div>
                <div className="bgm-sum-row"><span>Requested by</span><span>{contact?.name || "—"}</span></div>
                {po.number && <div className="bgm-sum-row"><span>Client PO</span><span>{po.number}</span></div>}
              </div>

              <div>
                <h4 style={{ marginBottom: 10 }}>Services</h4>
                {selectedServices.length === 0 ? (
                  <div className="bg-field-hint">No services picked yet.</div>
                ) : (
                  <div className="bgm-sum-lines">
                    {selectedServices.map((s) => (
                      <div key={s} className="bgm-sum-line">
                        <span>
                          {s}
                          {schedules[s]?.start_date && (
                            <div className="bg-field-hint">
                              {formatDate(schedules[s].start_date)}{schedules[s].time ? ` · ${schedules[s].time}` : ""}
                            </div>
                          )}
                        </span>
                        <span>{formatInr(prices[s])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bgm-total">
                <span>
                  <strong>Total</strong>
                  <div className="bg-field-hint">excl. GST</div>
                </span>
                <span className="bgm-total-value">{formatInr(total)}</span>
              </div>

              {missing.length ? (
                <div>
                  <h4 style={{ marginBottom: 8 }}>Still needed</h4>
                  <ul className="bgm-todo">
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bgm-ready">Everything is filled in — ready to create.</div>
              )}
            </div>

            <div className="bgm-summary-foot">
              <button type="button" className="primary" onClick={handleSubmit} disabled={saving}>
                {saving ? "Creating…" : "Create booking"}
              </button>
              <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
            </div>
          </aside>
        </div>
      </div>

      {isContactModalOpen && site && (
        <CreateContactModal
          companies={[{ ...site, company_name: selectedOption.property.name }]}
          onClose={() => setIsContactModalOpen(false)}
          onCreated={(newContact) => {
            if (newContact?.id && String(newContact.company_id) === String(site.id)) {
              setContacts((prev) => [newContact, ...prev.filter((c) => c.id !== newContact.id)]);
              setContactId(newContact.id);
            }
            setIsContactModalOpen(false);
          }}
        />
      )}

      <AssignWorkOrderModal
        isOpen={showAssignModal}
        jobCount={1}
        hideScope
        onClose={() => setShowAssignModal(false)}
        onAssign={({ supervisorId, technicianIds }) => {
          setTeam({ supervisorId, technicianIds: technicianIds || [] });
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

// What already happened to this service for the flat.
function ServiceHistoryNote({ history, picked }) {
  if (!history || history.state === "none") {
    return <span className="bgm-svc-note">Not done yet for this flat</span>;
  }
  if (history.state === "booked") {
    return (
      <span className="bgm-svc-note booked">
        Already booked · {statusLabel(history.job.status)} · {history.job.code}
        {history.job.date ? ` · ${formatDate(history.job.date)}` : ""}
      </span>
    );
  }
  return (
    <span className="bgm-svc-note done">
      ✓ Completed {history.job.date ? formatDate(history.job.date) : ""} · {history.job.code}
      {picked ? " — booking a repeat clean" : ""}
    </span>
  );
}

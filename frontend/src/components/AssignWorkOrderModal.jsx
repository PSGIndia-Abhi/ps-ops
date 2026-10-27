import { useState, useEffect } from "react";
import { apiFetch } from "../api";
// Shared modal / form styles (bgm-* / bg-*).
import "../pages/brigade/brigade.css";

function getLoggedInUser() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
} 

const loggedUser = getLoggedInUser();


export default function AssignWorkOrderModal({
  isOpen,
  jobCount,
  onClose,
  onAssign,
  hideSupervisor = false,
  // Booking forms pass this: there are no existing jobs yet, so no "apply to" choice.
  hideScope = false,
}) {
  if (!isOpen) return null;

  // Selection state (IDs only)
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState([]);
  const [assignScope, setAssignScope] = useState("current");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const role = localStorage.getItem("role");
  const loggedUser = getLoggedInUser();
  const isSupervisor = role === "supervisor";

  // Loaded users
  const [supervisors, setSupervisors] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [techSearch, setTechSearch] = useState("");
  const [error, setError] = useState("");

  // Fetch supervisors & technicians when modal opens
useEffect(() => {
  if (!isOpen) return;

  async function loadUsers() {
    try {
      setLoadingUsers(true);
      // ADMIN
      // (Brigade Executive picks from the same lists, scoped to her branch by the backend.)
      if (role === "admin" || role === "branch_admin" || role === "brigade_executive") {
        const [supRes, techRes] = await Promise.all([
          apiFetch("/api/users?role=supervisor"),
          apiFetch("/api/users?role=technician"),
        ]);
        const [sups, techs] = await Promise.all([
          supRes.json(),
          techRes.json(),
        ]);
        setSupervisors(Array.isArray(sups) ? sups : []);
        setTechnicians(Array.isArray(techs) ? techs : []);
      }

      // SUPERVISOR
      if (role === "supervisor") {
        const teamRes = await apiFetch("/api/teams/my/team");
        const team = await teamRes.json();
        setTechnicians(Array.isArray(team) ? team : []);
      }

    } catch (err) {
      console.error("Failed loading users", err);
      setSupervisors([]);
      setTechnicians([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  loadUsers();
}, [isOpen, role]);

  useEffect(() => {
    if (!isOpen) return;
    setAssignScope("current");
    setRangeStart("");
    setRangeEnd("");
  }, [isOpen]);

  function toggleTechnician(id) {
    setSelectedTechnicianIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  }

function handleAssign() {

  let supervisorToSend = selectedSupervisorId;

  // supervisor assigning → automatically himself
  if (role === "supervisor") {
    const token = JSON.parse(atob(localStorage.getItem("token").split(".")[1]));
    supervisorToSend = token.id;
  }

  if (!supervisorToSend) {
    setError("Please select a supervisor");
    return;
  }

  if (assignScope === "range") {
    if (!rangeStart || !rangeEnd) {
      setError("Please select a start and end date");
      return;
    }
    if (new Date(rangeEnd) < new Date(rangeStart)) {
      setError("End date cannot be before start date");
      return;
    }
  }

  setError("");

  const scopePayload =
    jobCount === 1
      ? {
          scope: assignScope,
          rangeStart: assignScope === "range" ? rangeStart : undefined,
          rangeEnd: assignScope === "range" ? rangeEnd : undefined,
        }
      : {};

  onAssign({
    supervisorId: Number(supervisorToSend),
    technicianIds: selectedTechnicianIds,
    ...scopePayload,
  });
}
  const techLabel = (tech) => (tech.branch_name ? `${tech.name} - ${tech.branch_name}` : tech.name);
  const query = techSearch.trim().toLowerCase();
  const visibleTechnicians = query
    ? technicians.filter((t) => techLabel(t).toLowerCase().includes(query))
    : technicians;
  const allVisibleSelected =
    visibleTechnicians.length > 0 && visibleTechnicians.every((t) => selectedTechnicianIds.includes(t.id));

  function toggleAllVisible() {
    const ids = visibleTechnicians.map((t) => t.id);
    setSelectedTechnicianIds((prev) =>
      allVisibleSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    );
  }

  const showScope = jobCount === 1 && !hideScope;

  const selectedTechs = selectedTechnicianIds
    .map((id) => technicians.find((t) => t.id === id))
    .filter(Boolean);

  return (
    <div className="bgm-overlay" style={{ zIndex: 1300 }}>
      <div className="awo-modal" role="dialog" aria-modal="true" aria-labelledby="awo-title">
        <div className="bgm-header">
          <div>
            <h3 id="awo-title">{jobCount === 1 ? "Assign team" : `Assign ${jobCount} jobs`}</h3>
            <p>{hideSupervisor ? "Choose technicians from your team" : "Choose a supervisor and technicians"}</p>
          </div>
          <button type="button" className="bgm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="awo-body">
          {/* Scope selection (single job only) */}
          {showScope && (
            <div className="bg-field">
              <span className="bg-label">Apply to</span>
              <div className="bg-filter-chips" role="radiogroup" aria-label="Apply to">
                {[
                  { key: "current", label: "This job only" },
                  { key: "range", label: "Date range" },
                  { key: "future", label: "All following jobs" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={assignScope === option.key}
                    onClick={() => setAssignScope(option.key)}
                    className={`bg-filter-chip ${assignScope === option.key ? "active" : ""}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showScope && assignScope === "range" && (
            <div className="bg-grid-2">
              <div className="bg-field">
                <label htmlFor="awo-from">From</label>
                <input id="awo-from" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
              </div>
              <div className="bg-field">
                <label htmlFor="awo-to">To</label>
                <input id="awo-to" type="date" value={rangeEnd} min={rangeStart || undefined} onChange={(e) => setRangeEnd(e.target.value)} />
              </div>
            </div>
          )}

          {/* Supervisor select (Admin only) */}
          {!hideSupervisor && (
            <div className="bg-field">
              <label htmlFor="awo-supervisor">Supervisor</label>
              <select
                id="awo-supervisor"
                value={selectedSupervisorId}
                onChange={(e) => {
                  setSelectedSupervisorId(e.target.value);
                  setError("");
                }}
                disabled={loadingUsers}
              >
                <option value="">{loadingUsers ? "Loading…" : "Select supervisor"}</option>
                {(Array.isArray(supervisors) ? supervisors : []).map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.branch_name ? `${sup.name} - ${sup.branch_name}` : sup.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Technicians */}
          <div className="bg-field">
            <div className="awo-tech-head">
              <span className="bg-label">Technicians</span>
              <span className="bg-field-hint">
                {selectedTechnicianIds.length
                  ? `${selectedTechnicianIds.length} selected`
                  : `${technicians.length} available`}
              </span>
            </div>
            <input
              type="search"
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
              placeholder="Search technician or branch"
              aria-label="Search technicians"
            />

            {selectedTechs.length > 0 && (
              <div className="awo-selected">
                {selectedTechs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="awo-selected-chip"
                    onClick={() => toggleTechnician(t.id)}
                    aria-label={`Remove ${t.name}`}
                  >
                    {t.name} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}

            <div className="awo-tech-list">
              {loadingUsers ? (
                <div className="bgm-search-empty">Loading technicians…</div>
              ) : visibleTechnicians.length === 0 ? (
                <div className="bgm-search-empty">
                  {technicians.length ? `No technician matches "${techSearch}"` : "No technicians available"}
                </div>
              ) : (
                <>
                  <label className="awo-tech-row awo-tech-all">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                    <span>{query ? `Select all ${visibleTechnicians.length} shown` : "Select all"}</span>
                  </label>
                  {visibleTechnicians.map((tech) => {
                    const checked = selectedTechnicianIds.includes(tech.id);
                    return (
                      <label key={tech.id} className={`awo-tech-row ${checked ? "active" : ""}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleTechnician(tech.id)} />
                        <span className="awo-tech-name">{tech.name}</span>
                        {tech.branch_name && <span className="bg-chip muted">{tech.branch_name}</span>}
                      </label>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {error && <div className="bg-error" role="alert">{error}</div>}
        </div>

        <div className="awo-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleAssign}>
            Assign{selectedTechnicianIds.length ? ` (${selectedTechnicianIds.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { apiFetch } from "../api";

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

  // Fetch supervisors & technicians when modal opens
useEffect(() => {
  async function loadUsers() {
    try {
      // ADMIN
      if (role === "admin" || role === "branch_admin") {

        // 1️⃣ load supervisors
        const supRes = await apiFetch("/api/users?role=supervisor");
        const sups = await supRes.json();
        setSupervisors(Array.isArray(sups) ? sups : []);

        // 2️⃣ load technicians
        const techRes = await apiFetch("/api/users?role=technician");
        const techs = await techRes.json();
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
    }
  }

  loadUsers();
}, [role]);

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
    alert("Please select a supervisor");
    return;
  }

  if (assignScope === "range") {
    if (!rangeStart || !rangeEnd) {
      alert("Please select a start and end date");
      return;
    }
    if (new Date(rangeEnd) < new Date(rangeStart)) {
      alert("End date cannot be before start date");
      return;
    }
  }

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
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ marginBottom: "8px" }}>
          Assign Work Order ({jobCount} jobs)
        </h2>

        {/* Scope selection (single job only) */}
        {jobCount === 1 && (
          <>
            <label style={labelStyle}>Apply To</label>
            <div style={pillRowStyle}>
              {[
                { key: "current", label: "Current job only" },
                { key: "range", label: "Date range" },
                { key: "future", label: "All following jobs" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setAssignScope(option.key)}
                  style={scopePill(assignScope === option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>
        )}

        {jobCount === 1 && assignScope === "range" && (
          <div style={{ marginTop: "12px" }}>
            <label style={labelStyle}>Date Range</label>
            <div style={dateGridStyle}>
              <label style={dateFieldStyle}>
                <span>From</span>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={dateFieldStyle}>
                <span>To</span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        )}

        {/* Supervisor select (Admin only) */}
        {!hideSupervisor && (
          <>
            <label style={labelStyle}>Supervisor</label>
            <select
              value={selectedSupervisorId}
              onChange={(e) => setSelectedSupervisorId(e.target.value)}
              disabled={loadingUsers}
              style={inputStyle}
            >
              <option value="">Select supervisor</option>
              {(Array.isArray(supervisors) ? supervisors : []).map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name}
                </option>
              ))}
            </select>
          </>
        )}


        {/* Technicians */}
        <label style={labelStyle}>Technicians</label>
        <div style={{ maxHeight: "160px", overflowY: "auto" }}>
          {technicians.map((tech) => (
            <label key={tech.id} style={checkboxRow}>
              <input
                type="checkbox"
                checked={selectedTechnicianIds.includes(tech.id)}
                onChange={() => toggleTechnician(tech.id)}
              />
              <span style={{ marginLeft: "8px" }}>{tech.name}</span>
            </label>
          ))}
        </div>

        {/* Actions */}
        <div style={actionsStyle}>
          <button onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
          <button onClick={handleAssign} style={primaryBtn}>
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1200,
};

const modalStyle = {
  background: "#fff",
  padding: "24px",
  borderRadius: "12px",
  width: "420px",
};

const labelStyle = {
  display: "block",
  marginTop: "16px",
  marginBottom: "6px",
  fontWeight: 600,
};

const inputStyle = {
  width: "100%",
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  fontSize: "14px",
};

const checkboxRow = {
  display: "flex",
  alignItems: "center",
  marginBottom: "6px",
};

const actionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "12px",
  marginTop: "24px",
};

const primaryBtn = {
  padding: "10px 16px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
};

const secondaryBtn = {
  padding: "10px 16px",
  background: "#e5e7eb",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
};

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "6px",
};

const scopePill = (active) => ({
  padding: "8px 12px",
  borderRadius: "999px",
  border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
  background: active ? "#eff6ff" : "#ffffff",
  color: "#111827",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
});

const dateGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
};

const dateFieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  fontSize: "12px",
  color: "#6b7280",
};


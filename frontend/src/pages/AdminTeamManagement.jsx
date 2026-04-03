import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import "./AdminTeamManagement.css";

const branchEndpoints = ["/api/branches", "/branches"];

async function safeJson(res) {
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchJsonWithFallback(endpoints) {
  let lastError = "Request failed";
  for (const endpoint of endpoints) {
    const res = await apiFetch(endpoint);
    if (res?.ok) {
      return await safeJson(res);
    }
    const data = await safeJson(res);
    lastError = data?.error || lastError;
    if (res?.status === 404 || res?.status === 405) {
      continue;
    }
    break;
  }
  throw new Error(lastError);
}

function normalizeBranches(data) {
  if (!Array.isArray(data)) return [];
  if (data.length === 0) return [];
  if (data[0]?.admins) {
    return data.map((branch) => ({
      id: branch.id,
      name: branch.name,
    }));
  }

  const map = new Map();
  data.forEach((row) => {
    if (!row?.id) return;
    if (!map.has(row.id)) {
      map.set(row.id, { id: row.id, name: row.name });
    }
  });
  return Array.from(map.values());
}

export default function AdminTeamManagement() {
  const [supervisors, setSupervisors] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSupervisorId, setSavingSupervisorId] = useState(null);
  const [activeSupervisorId, setActiveSupervisorId] = useState(null);
  const [selectedTechs, setSelectedTechs] = useState([]);
  const [error, setError] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [promoteUserId, setPromoteUserId] = useState("");
  const [promoteRole, setPromoteRole] = useState("supervisor");
  const [promoteBranchId, setPromoteBranchId] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [assignTechId, setAssignTechId] = useState("");
  const [assignBranchId, setAssignBranchId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const loadOverview = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/teams/overview");
      if (!res?.ok) throw new Error("Failed to load team overview");
      const data = await res.json();
      setSupervisors(Array.isArray(data.supervisors) ? data.supervisors : []);
      setUnassigned(Array.isArray(data.unassignedTechnicians) ? data.unassignedTechnicians : []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load team overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    async function loadBranches() {
      try {
        setLoadingBranches(true);
        const data = await fetchJsonWithFallback(branchEndpoints);
        setBranches(normalizeBranches(data));
      } catch (err) {
        console.error(err);
        setBranches([]);
        setError(err.message || "Failed to load branches");
      } finally {
        setLoadingBranches(false);
      }
    }

    loadBranches();
  }, []);

  const technicianIndex = useMemo(() => {
    const map = new Map();
    supervisors.forEach((sup) => {
      (sup.technicians || []).forEach((tech) => {
        map.set(Number(tech.id), Number(sup.id));
      });
    });
    return map;
  }, [supervisors]);

  const allTechnicians = useMemo(() => {
    const fromSup = supervisors.flatMap(s => s.technicians || []);
    const map = new Map(fromSup.map(t => [Number(t.id), t]));
    unassigned.forEach(t => {
      if (!map.has(Number(t.id))) map.set(Number(t.id), t);
    });
    return Array.from(map.values());
  }, [supervisors, unassigned]);

  const promotableUsers = useMemo(() => {
    const map = new Map();
    supervisors.forEach((sup) => {
      if (!sup?.id) return;
      map.set(Number(sup.id), { id: sup.id, name: sup.name, role: "supervisor" });
    });
    allTechnicians.forEach((tech) => {
      if (!tech?.id) return;
      if (!map.has(Number(tech.id))) {
        map.set(Number(tech.id), { id: tech.id, name: tech.name, role: "technician" });
      }
    });
    return Array.from(map.values());
  }, [supervisors, allTechnicians]);

  const activeSupervisor = supervisors.find(s => Number(s.id) === Number(activeSupervisorId));

  function openSupervisor(supervisorId) {
    setActiveSupervisorId(supervisorId);
    const sup = supervisors.find(s => Number(s.id) === Number(supervisorId));
    const selected = (sup?.technicians || []).map(t => Number(t.id));
    setSelectedTechs(selected);
  }

  function toggleTech(techId) {
    setSelectedTechs(prev => {
      if (prev.includes(techId)) {
        return prev.filter(id => id !== techId);
      }
      return [...prev, techId];
    });
  }

  async function saveTeam() {
    if (!activeSupervisor) return;
    try {
      setSavingSupervisorId(activeSupervisor.id);
      const res = await apiFetch("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          supervisorId: activeSupervisor.id,
          technicianIds: selectedTechs
        }),
      });
      if (!res?.ok) throw new Error("Failed to save team");
      await loadOverview();
      setActiveSupervisorId(null);
      setSelectedTechs([]);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save team");
    } finally {
      setSavingSupervisorId(null);
    }
  }

  async function handlePromoteUser() {
    if (!promoteUserId) {
      setError("Select a user to promote.");
      return;
    }
    if (promoteRole === "branch_admin" && !promoteBranchId) {
      setError("Select a branch for branch admin.");
      return;
    }

    try {
      setPromoting(true);
      const res = await apiFetch(`/api/users/${promoteUserId}/role`, {
        method: "POST",
        body: JSON.stringify({
          role: promoteRole,
          branch_id: promoteBranchId || undefined,
        }),
      });
      if (!res?.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to update role");
      }
      setPromoteUserId("");
      setPromoteRole("supervisor");
      setPromoteBranchId("");
      setError(null);
      await loadOverview();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to update role");
    } finally {
      setPromoting(false);
    }

    const confirmed = window.confirm(
  `Are you sure you want to change this user's role to ${promoteRole}?`
);

if (!confirmed) return;
  }

  async function handleAssignTechBranch() {
    if (!assignTechId) {
      setError("Select a technician.");
      return;
    }
    if (!assignBranchId) {
      setError("Select a branch.");
      return;
    }

    try {
      setAssigning(true);
      const res = await apiFetch(`/api/users/${assignTechId}/branch`, {
        method: "POST",
        body: JSON.stringify({ branch_id: assignBranchId }),
      });
      if (!res?.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to assign branch");
      }
      setAssignTechId("");
      setAssignBranchId("");
      setError(null);
      await loadOverview();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to assign branch");
    } finally {
      setAssigning(false);
    }
  }

  if (loading) {
    return <div className="team-page">Loading team overview...</div>;
  }

  return (
    <div className="team-page">
      <div className="team-page-header">
        <div>
          <h2>Team Management</h2>
          <p>Select a supervisor and add technicians under them.</p>
        </div>
      </div>

      {error && <div className="team-error">Error: {error}</div>}

      <div className="team-card">
        <div className="team-card-header">
          <div>
            <div className="team-card-title">Promote User</div>
            <div className="team-card-subtitle">
              Upgrade technicians to supervisor or branch admin.
            </div>
          </div>
        </div>

        <div className="team-form">
          <label className="team-field">
            <span>User *</span>
            <select
              value={promoteUserId}
              onChange={(e) => setPromoteUserId(e.target.value)}
            >
              <option value="">Select user</option>
              {promotableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.id} ({user.role})
                </option>
              ))}
            </select>
          </label>

          <label className="team-field">
            <span>New Role *</span>
            <select
              value={promoteRole}
              onChange={(e) => setPromoteRole(e.target.value)}
            >
              <option value="supervisor">Supervisor</option>
              <option value="technician">Technician</option>
              <option value="branch_admin">Branch Admin</option>
            </select>
          </label>

          <label className="team-field">
            <span>Branch {promoteRole === "branch_admin" ? "*" : "(optional)"}</span>
            <select
              value={promoteBranchId}
              onChange={(e) => setPromoteBranchId(e.target.value)}
              disabled={loadingBranches}
            >
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name || branch.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="team-form-actions">
          <button onClick={handlePromoteUser} disabled={promoting}>
            {promoting ? "Updating..." : "Update Role"}
          </button>
        </div>
      </div>

      <div className="team-card">
        <div className="team-card-header">
          <div>
            <div className="team-card-title">Assign Technician to Branch</div>
            <div className="team-card-subtitle">
              Set the branch for a technician.
            </div>
          </div>
        </div>

        <div className="team-form">
          <label className="team-field">
            <span>Technician *</span>
            <select
              value={assignTechId}
              onChange={(e) => setAssignTechId(e.target.value)}
            >
              <option value="">Select technician</option>
              {allTechnicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name || tech.id}
                </option>
              ))}
            </select>
          </label>

          <label className="team-field">
            <span>Branch *</span>
            <select
              value={assignBranchId}
              onChange={(e) => setAssignBranchId(e.target.value)}
              disabled={loadingBranches}
            >
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name || branch.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="team-form-actions">
          <button onClick={handleAssignTechBranch} disabled={assigning}>
            {assigning ? "Assigning..." : "Assign Branch"}
          </button>
        </div>
      </div>

      <div className="team-supervisor-grid">
        {supervisors.map((supervisor) => (
          <div key={supervisor.id} className="team-card">
            <div className="team-card-header">
              <div>
                <div className="team-card-title">{supervisor.name || "Supervisor"}</div>
                <div className="team-card-subtitle">{supervisor.email || `ID ${supervisor.id}`}</div>
              </div>
              <div className="team-card-count">{supervisor.technicians?.length || 0}</div>
            </div>

            <div className="team-card-body">
              {(supervisor.technicians || []).length === 0 && (
                <div className="team-empty">No technicians assigned yet.</div>
              )}
              {(supervisor.technicians || []).map((tech) => (
                <div key={tech.id} className="team-tech-row compact">
                  <div className="team-tech-info">
                    <div className="team-tech-name">{tech.name || "Unnamed technician"}</div>
                    <div className="team-tech-email">{tech.email || `ID ${tech.id}`}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="team-manage-btn"
              onClick={() => openSupervisor(supervisor.id)}
            >
              Manage Technicians
            </button>
          </div>
        ))}
      </div>

      {activeSupervisor && (
        <div className="team-card team-edit-card">
          <div className="team-card-header">
            <div>
              <div className="team-card-title">
                Edit Team · {activeSupervisor.name || "Supervisor"}
              </div>
              <div className="team-card-subtitle">
                Select technicians to assign under this supervisor.
              </div>
            </div>
          </div>

          <div className="team-card-body">
            {allTechnicians.map((tech) => {
              const assignedSupervisorId = technicianIndex.get(Number(tech.id));
              const assignedSupervisor = supervisors.find(
                s => Number(s.id) === Number(assignedSupervisorId)
              );
              const isSelected = selectedTechs.includes(Number(tech.id));
              return (
                <label key={tech.id} className="team-tech-select">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleTech(Number(tech.id))}
                  />
                  <div>
                    <div className="team-tech-name">{tech.name || "Unnamed technician"}</div>
                    <div className="team-tech-email">{tech.email || `ID ${tech.id}`}</div>
                    {assignedSupervisor && assignedSupervisorId !== Number(activeSupervisor.id) && (
                      <div className="team-tech-assigned">
                        Currently under {assignedSupervisor.name || `Supervisor ${assignedSupervisor.id}`}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="team-edit-actions">
            <button
              className="team-cancel-btn"
              onClick={() => {
                setActiveSupervisorId(null);
                setSelectedTechs([]);
              }}
            >
              Cancel
            </button>
            <button
              className="team-save-btn"
              onClick={saveTeam}
              disabled={savingSupervisorId === activeSupervisor.id}
            >
              {savingSupervisorId === activeSupervisor.id ? "Saving..." : "Save Team"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

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

export default function TeamView() {

  const [supervisors, setSupervisors] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState(null);
  const [selectedTechs, setSelectedTechs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);

  const [promoteUserId, setPromoteUserId] = useState("");
  const [promoteRole, setPromoteRole] = useState("supervisor");
  const [promoteBranchId, setPromoteBranchId] = useState("");
  const [promoting, setPromoting] = useState(false);

  const [assignTechId, setAssignTechId] = useState("");
  const [assignBranchId, setAssignBranchId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const promotableUsers = useMemo(() => {
    const map = new Map();
    [...technicians, ...supervisors].forEach((user) => {
      if (!user?.id || map.has(user.id)) return;
      map.set(user.id, user);
    });
    return Array.from(map.values());
  }, [technicians, supervisors]);

  async function loadUsers() {
    try {
      setLoadingUsers(true);
      const [sData, tData] = await Promise.all([
        fetchJsonWithFallback(["/api/users?role=supervisor", "/users?role=supervisor"]),
        fetchJsonWithFallback(["/api/users?role=technician", "/users?role=technician"]),
      ]);
      setSupervisors(Array.isArray(sData) ? sData : []);
      setTechnicians(Array.isArray(tData) ? tData : []);
    } catch (err) {
      console.error(err);
      setSupervisors([]);
      setTechnicians([]);
      setError(err.message || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }

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

  // load supervisors + technicians + branches
  useEffect(() => {
    loadUsers();
    loadBranches();
  }, []);

  // load selected supervisor team
  useEffect(() => {
    if (!selectedSupervisor) return;

    async function loadTeam() {
      const res = await apiFetch(`/teams/${selectedSupervisor.id}`);
      const team = await res.json();
      setSelectedTechs(team.map(t => t.id));
    }

    loadTeam();
  }, [selectedSupervisor]);

  const toggleTech = (id) => {
    setSelectedTechs(prev =>
      prev.includes(id)
        ? prev.filter(t => t !== id)
        : [...prev, id]
    );
  };

  const saveTeam = async () => {
    await apiFetch("/teams", {
      method: "POST",
      body: JSON.stringify({
        supervisorId: selectedSupervisor.id,
        technicianIds: selectedTechs
      })
    });

    alert("Team saved");
  };

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
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to update role");
    } finally {
      setPromoting(false);
    }
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
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to assign branch");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div style={{ padding: 20, display: "grid", gap: 20 }}>
      <h2 style={{ margin: 0 }}>Team Management</h2>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Promote User</h3>
        <p style={{ marginTop: 0, color: "#6b7280", fontSize: 13 }}>
          Upgrade technicians to supervisor or branch admin.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>User *</span>
            <select
              value={promoteUserId}
              onChange={(e) => setPromoteUserId(e.target.value)}
              disabled={loadingUsers || promotableUsers.length === 0}
            >
              <option value="">
                {loadingUsers ? "Loading users..." : "Select user"}
              </option>
              {promotableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.id}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>New Role *</span>
            <select
              value={promoteRole}
              onChange={(e) => setPromoteRole(e.target.value)}
            >
              <option value="supervisor">Supervisor</option>
              <option value="branch_admin">Branch Admin</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Branch {promoteRole === "branch_admin" ? "*" : "(optional)"}</span>
            <select
              value={promoteBranchId}
              onChange={(e) => setPromoteBranchId(e.target.value)}
              disabled={loadingBranches}
            >
              <option value="">
                {loadingBranches ? "Loading branches..." : "Select branch"}
              </option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name || branch.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={handlePromoteUser} disabled={promoting}>
            {promoting ? "Updating..." : "Update Role"}
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Assign Technician to Branch</h3>
        <p style={{ marginTop: 0, color: "#6b7280", fontSize: 13 }}>
          Set the branch for a technician.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Technician *</span>
            <select
              value={assignTechId}
              onChange={(e) => setAssignTechId(e.target.value)}
              disabled={loadingUsers || technicians.length === 0}
            >
              <option value="">
                {loadingUsers ? "Loading technicians..." : "Select technician"}
              </option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name || tech.id}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Branch *</span>
            <select
              value={assignBranchId}
              onChange={(e) => setAssignBranchId(e.target.value)}
              disabled={loadingBranches}
            >
              <option value="">
                {loadingBranches ? "Loading branches..." : "Select branch"}
              </option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name || branch.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={handleAssignTechBranch} disabled={assigning}>
            {assigning ? "Assigning..." : "Assign Branch"}
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Supervisor Teams</h3>
        <p style={{ marginTop: 0, color: "#6b7280", fontSize: 13 }}>
          Choose a supervisor and assign technicians.
        </p>

        {supervisors.map((s) => (
          <div key={s.id} style={{ marginBottom: 8 }}>
            <button onClick={() => setSelectedSupervisor(s)}>
              {s.name}
            </button>
          </div>
        ))}

        {selectedSupervisor && (
          <>
            <h4 style={{ marginTop: 16 }}>
              Technicians under {selectedSupervisor.name}
            </h4>

            {technicians.map((t) => (
              <label key={t.id} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={selectedTechs.includes(t.id)}
                  onChange={() => toggleTech(t.id)}
                />
                {t.name}
              </label>
            ))}

            <button onClick={saveTeam} style={{ marginTop: 10 }}>
              Save Team
            </button>
          </>
        )}
      </div>
    </div>
  );
}

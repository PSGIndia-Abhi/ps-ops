import { useMemo, useState } from "react";
import { apiFetch, safeJson } from "../../api";

export default function UsersTab({
  supervisors,
  unassigned,
  loadOverview,
  setError,
  branches,
  loadingBranches,
  role
}) {

  const [promoteUserId, setPromoteUserId] = useState("");
  const [promoteRole, setPromoteRole] = useState("supervisor");
  const [promoteBranchId, setPromoteBranchId] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [assignTechIds, setAssignTechIds] = useState([]);

  


  //find all the techs
  const allTechnicians = useMemo(() => {

    const fromSup = supervisors.flatMap(
      s => s.technicians || []
    );

    const map = new Map(
      fromSup.map(t => [Number(t.id), t])
    );

    unassigned.forEach(t => {

      if (!map.has(Number(t.id))) {
        map.set(Number(t.id), t);
      }

    });

    return Array.from(map.values());

  }, [supervisors, unassigned]);

const selectedAssignTechnicians = allTechnicians.filter((tech) =>
    assignTechIds.includes(Number(tech.id))
  );

  //mix tech and supervisors for promotion options
  const promotableUsers = useMemo(() => {

    const map = new Map();

    // supervisors
    supervisors.forEach((sup) => {

      if (!sup?.id) return;

      map.set(Number(sup.id), {
        id: sup.id,
        name: sup.name,
        role: "supervisor"
      });

    });

    // technicians
    allTechnicians.forEach((tech) => {

      if (!tech?.id) return;

      if (!map.has(Number(tech.id))) {

        map.set(Number(tech.id), {
          id: tech.id,
          name: tech.name,
          role: "technician"
        });

      }

    });

    return Array.from(map.values());

  }, [supervisors, allTechnicians]);

    const assignTechTriggerLabel =
    selectedAssignTechnicians.length === 0
      ? "Select technicians"
      : selectedAssignTechnicians.length === 1
        ? selectedAssignTechnicians[0].name || `ID ${selectedAssignTechnicians[0].id}`
        : `${selectedAssignTechnicians.length} technicians selected`;

  //magic thing!
  async function handlePromoteUser() {

    if (!promoteUserId) {
      setError("Select a user to promote.");
      return;
    }

    if (
      promoteRole === "branch_admin" &&
      !promoteBranchId
    ) {
      setError("Select a branch for branch admin.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to change this user's role to ${promoteRole}?`
    );

    if (!confirmed) return;

    try {

      setPromoting(true);

      const res = await apiFetch(
        `/api/users/${promoteUserId}/role`,
        {
          method: "POST",
          body: JSON.stringify({
            role: promoteRole,
            branch_id: promoteBranchId || undefined,
          }),
        }
      );

      if (!res?.ok) {

        const data = await safeJson(res);

        throw new Error(
          data?.error || "Failed to update role"
        );

      }

      setPromoteUserId("");
      setPromoteRole("supervisor");
      setPromoteBranchId("");

      setError(null);

      await loadOverview();

    } catch (err) {

      console.error(err);

      setError(
        err.message || "Failed to update role"
      );

    } finally {

      setPromoting(false);

    }
  }

  return (
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

          {role==="admin"&& <label className="team-field">
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
          </label>}
        </div>

        <div className="team-form-actions">
          <button onClick={handlePromoteUser} disabled={promoting}>
            {promoting ? "Updating..." : "Update Role"}
          </button>
        </div>
      </div>

    
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, safeJson } from "../../api";

export default function UsersTab({
  supervisors,
  unassigned,
  users = [],
  loadOverview,
  setError,
  branches,
  loadingBranches,
  role,
  roles = [],
}) {

  const [promoteUserId, setPromoteUserId] = useState("");
  const assignableRoles = useMemo(
    () =>
      roles.filter((item) => !["admin", "super_admin", "system"].includes(String(item.name || "").toLowerCase())),
    [roles]
  );
  const [promoteRoleId, setPromoteRoleId] = useState("");
  const [promoteBranchId, setPromoteBranchId] = useState("");
  const [promoting, setPromoting] = useState(false);

//assign branch to technicians
    const [assignTechIds, setAssignTechIds] = useState([]);
    const [assignTechMenuOpen, setAssignTechMenuOpen] = useState(false);
    const [assignBranchId, setAssignBranchId] = useState("");
    const [assigning, setAssigning] = useState(false);

      const assignTechMenuRef = useRef(null);

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

  //get selected techs for branch assignment
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

    // Label for assign technicians button
  const assignTechTriggerLabel =
    selectedAssignTechnicians.length === 0
      ? "Select technicians"
      : selectedAssignTechnicians.length === 1
        ? selectedAssignTechnicians[0].name || `ID ${selectedAssignTechnicians[0].id}`
      : `${selectedAssignTechnicians.length} technicians selected`;

  const selectedPromoteRole = useMemo(
    () => assignableRoles.find((item) => String(item.id) === String(promoteRoleId)) || null,
    [assignableRoles, promoteRoleId]
  );

  useEffect(() => {
    if (!assignableRoles.length) return;
    if (!promoteRoleId || !assignableRoles.some((item) => String(item.id) === String(promoteRoleId))) {
      const supervisorRole = assignableRoles.find((item) => item.name === "supervisor");
      setPromoteRoleId(String((supervisorRole || assignableRoles[0]).id));
    }
  }, [assignableRoles, promoteRoleId]);



  //change the role!
  async function handlePromoteUser() {

    if (!promoteUserId) {
      setError("Select a user to promote.");
      return;
    }

    if (!promoteRoleId) {
      setError("Select a role.");
      return;
    }

    if (
      selectedPromoteRole?.name === "branch_admin" &&
      !promoteBranchId
    ) {
      setError("Select a branch for branch admin.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to change this user's role to ${selectedPromoteRole?.name || "this role"}?`
    );

    if (!confirmed) return;

    try {

      setPromoting(true);

      const res = await apiFetch(
        `/api/users/${promoteUserId}/role`,
        {
          method: "POST",
          body: JSON.stringify({
            role_id: promoteRoleId,
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
      const supervisorRole = assignableRoles.find((item) => item.name === "supervisor");
      setPromoteRoleId(String((supervisorRole || assignableRoles[0] || {}).id || ""));
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

    function toggleAssignTech(id) {
    setAssignTechIds(prev =>
      prev.includes(id)
        ? prev.filter((techId) => techId !== id)
        : [...prev, id]
    );
  }

  //Move tec to branches
  async function handleAssignTechBranch() {
    if (assignTechIds.length === 0) {
      setError("Select at least one technician");
      return;
    }
    if (!assignBranchId) {
      setError("Select a branch.");
      return;
    }

    try {
      setAssigning(true);
      for (const techId of assignTechIds) {
        const res = await apiFetch(`/api/users/${techId}/branch`, {
          method: "POST",
          body: JSON.stringify({ branch_id: assignBranchId }),
        });
        if (!res?.ok) {
          const data = await safeJson(res);
          throw new Error(data?.error || "Failed to assign branch");
        }
      }
      setAssignTechIds([]);
      setAssignTechMenuOpen(false);
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

  // Branch name lookup for technicians
    const branchNameById = useMemo(() => {
    const map = new Map();
    branches.forEach((branch) => {
      if (!branch?.id) return;
      map.set(String(branch.id), branch.name || `Branch ${branch.id}`);
    });
    return map;
  }, [branches]);

    function getTechnicianBranchLabel(tech) {
    const branchName =
      tech?.branch_name ||
      (tech?.branch?.name ? tech.branch.name : null) ||
      (tech?.branch_id ? branchNameById.get(String(tech.branch_id)) : null);
    return branchName ? `Branch: ${branchName}` : "Branch: Unassigned";
  }

  return (
    <div className="team-page">
      
       <div className="team-card">
        <div className="team-card-header">
          <div>
            <div className="team-card-title">Change User Roles</div>
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
              value={promoteRoleId}
              onChange={(e) => setPromoteRoleId(e.target.value)}
            >
              <option value="">Select role</option>
              {assignableRoles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {role==="admin"&& <label className="team-field">
            <span>Branch {selectedPromoteRole?.name === "branch_admin" ? "*" : "(optional)"}</span>
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

                    {role==="admin"&&<div className="team-card">
        <div className="team-card-header">
          <div>
            <div className="team-card-title">Assign to Branch</div>
            <div className="team-card-subtitle">
              Set the branch for one or more Users.
            </div>
          </div>
        </div>

        <div className="team-form">
          <div className="team-field">
            <span>Technicians *</span>
            <div className="team-multi-select" ref={assignTechMenuRef}>
              <button
                type="button"
                className="team-multi-select-trigger"
                onClick={() => setAssignTechMenuOpen((prev) => !prev)}
                aria-expanded={assignTechMenuOpen}
              >
                <span>{assignTechTriggerLabel}</span>
                <span className="team-multi-select-caret">
                  {assignTechMenuOpen ? "^" : "v"}
                </span>
              </button>

              {assignTechMenuOpen && (
                <div className="team-multi-select-menu">
                  <div className="team-multi-select-list">
                    {allTechnicians.map((tech) => (
                      <label key={tech.id} className="team-tech-select">
                        <input
                          type="checkbox"
                          checked={assignTechIds.includes(Number(tech.id))}
                          onChange={() => toggleAssignTech(Number(tech.id))}
                        />
                        <div>
                          <div className="team-tech-name">{tech.name || "Unnamed technician"}</div>
                          <div className="team-tech-email">{getTechnicianBranchLabel(tech)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

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
      </div>}

      <div className="team-card">
        <div className="team-card-header">
          <div>
            <div className="team-card-title">Visible Users</div>
            <div className="team-card-subtitle">
              Users available within your current scope.
            </div>
          </div>
          <div className="team-card-count">{users.length}</div>
        </div>

        <div className="team-list">
          {users.length === 0 && (
            <div className="team-empty">No users found in your scope.</div>
          )}

          {users.map((user) => (
            <div key={user.id} className="team-tech-row">
              <div className="team-tech-info">
                <div className="team-tech-name">{user.name || `User ${user.id}`}</div>
                <div className="team-tech-email">{user.email || `ID ${user.id}`}</div>
              </div>
              <div className="team-list-meta">
                <span className="team-role-badge">{user.role || "unassigned"}</span>
                <span>{user.branch_name || "No branch"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
        
      </div>

    
  );
}

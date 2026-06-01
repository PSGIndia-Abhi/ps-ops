import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, safeJson } from "../../api";

export default function UsersTab({
  supervisors,
  unassigned,
  users = [],
  loadOverview,
  setError,
  branches,
  companies = [],
  sites = [],
  loadingScopeData = false,
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
  const [scopeUserId, setScopeUserId] = useState("");
  const [scopeRows, setScopeRows] = useState([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);

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
  const scopeTargetOptions = useMemo(
    () => ({
      branch: branches.map((item) => ({ id: item.id, label: item.name || item.id })),
      company: companies.map((item) => ({ id: item.id, label: item.name || item.id })),
      site: sites.map((item) => ({
        id: item.id,
        label: item.company_name ? `${item.company_name} - ${item.name || item.id}` : (item.name || item.id),
      })),
    }),
    [branches, companies, sites]
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

  async function handleLoadUserScopes() {
    if (!scopeUserId) {
      setError("Select a user for scope management.");
      return;
    }
    try {
      setScopeLoading(true);
      const res = await apiFetch(`/api/users/${scopeUserId}/scopes`);
      if (!res?.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to load user scopes");
      }
      const data = await res.json();
      const rows = Array.isArray(data?.scopes)
        ? data.scopes.map((item) => ({
            scope_type: item.scope_type,
            scope_id: item.scope_id || "",
          }))
        : [];
      setScopeRows(rows);
      setError(null);
    } catch (err) {
      console.error(err);
      setScopeRows([]);
      setError(err.message || "Failed to load user scopes");
    } finally {
      setScopeLoading(false);
    }
  }

  function addScopeRow() {
    setScopeRows((prev) => [...prev, { scope_type: "branch", scope_id: "" }]);
  }

  function removeScopeRow(index) {
    setScopeRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateScopeRow(index, key, value) {
    setScopeRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (key === "scope_type") {
          return {
            scope_type: value,
            scope_id: value === "global" ? "" : row.scope_id,
          };
        }
        return { ...row, [key]: value };
      })
    );
  }

  async function handleSaveUserScopes() {
    if (!scopeUserId) {
      setError("Select a user for scope management.");
      return;
    }

    const invalid = scopeRows.find(
      (row) => row.scope_type !== "global" && !String(row.scope_id || "").trim()
    );
    if (invalid) {
      setError(`Select ${invalid.scope_type} for every non-global scope row.`);
      return;
    }

    const payload = scopeRows.map((row) => ({
      scope_type: row.scope_type,
      scope_id: row.scope_type === "global" ? null : row.scope_id,
    }));

    try {
      setScopeSaving(true);
      const res = await apiFetch(`/api/users/${scopeUserId}/scopes`, {
        method: "POST",
        body: JSON.stringify({ scopes: payload }),
      });

      if (!res?.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to save user scopes");
      }

      setError(null);
      await loadOverview();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save user scopes");
    } finally {
      setScopeSaving(false);
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

      {role === "admin" && (
        <div className="team-card">
          <div className="team-card-header">
            <div>
              <div className="team-card-title">User Scope Management</div>
              <div className="team-card-subtitle">
                Decide access scope by user: global, branch, company, or site.
              </div>
            </div>
          </div>

          <div className="team-form">
            <label className="team-field">
              <span>User *</span>
              <select value={scopeUserId} onChange={(e) => setScopeUserId(e.target.value)}>
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.id} ({user.role || "unassigned"})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="team-form-actions">
            <button type="button" onClick={handleLoadUserScopes} disabled={!scopeUserId || scopeLoading}>
              {scopeLoading ? "Loading..." : "Load Scopes"}
            </button>
            <button type="button" onClick={addScopeRow} disabled={loadingScopeData}>
              Add Scope
            </button>
          </div>

          {scopeRows.map((row, index) => (
            <div className="team-form" key={`${row.scope_type}-${index}`}>
              <label className="team-field">
                <span>Scope Type</span>
                <select
                  value={row.scope_type}
                  onChange={(e) => updateScopeRow(index, "scope_type", e.target.value)}
                >
                  <option value="global">Global</option>
                  <option value="branch">Branch</option>
                  <option value="company">Company</option>
                  <option value="site">Site</option>
                </select>
              </label>

              {row.scope_type !== "global" && (
                <label className="team-field">
                  <span>Scope Target</span>
                  <select
                    value={row.scope_id}
                    onChange={(e) => updateScopeRow(index, "scope_id", e.target.value)}
                  >
                    <option value="">Select {row.scope_type}</option>
                    {(scopeTargetOptions[row.scope_type] || []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="team-form-actions">
                <button type="button" onClick={() => removeScopeRow(index)}>
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="team-form-actions">
            <button type="button" onClick={handleSaveUserScopes} disabled={!scopeUserId || scopeSaving}>
              {scopeSaving ? "Saving..." : "Save Scopes"}
            </button>
          </div>
        </div>
      )}
        
      </div>

    
  );
}

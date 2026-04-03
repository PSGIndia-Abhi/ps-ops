import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { formatDateTime } from "../utils/date";
import "./AdminBranches.css";

const ROLE_OPTIONS = [
  "admin",
  "branch_admin",
  "supervisor",
  "technician"
];

const fallbackBranchEndpoints = ["/api/branches", "/branches"];

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

async function postJsonWithFallback(endpoints, options) {
  let lastError = "Request failed";
  for (const endpoint of endpoints) {
    const res = await apiFetch(endpoint, options);
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
      ...branch,
      admins: Array.isArray(branch.admins) ? branch.admins : [],
    }));
  }

  const map = new Map();
  data.forEach((row) => {
    if (!row?.id) return;
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        admins: [],
      });
    }
    if (row.user_id) {
      map.get(row.id).admins.push({
        id: row.user_id,
        name: row.user_name,
      });
    }
  });

  return Array.from(map.values());
}

function formatDate(value) {
  if (!value) return "-";
  return formatDateTime(value);
}

export default function AdminBranches() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState({});
  const [removing, setRemoving] = useState({});
  const [newBranchName, setNewBranchName] = useState("");
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [selectedAdmins, setSelectedAdmins] = useState({});

  const sortedBranches = useMemo(() => {
    return [...branches].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [branches]);

  const userOptions = useMemo(() => {
    return assignableUsers
      .map((user) => ({
        value: user.id,
        label: `${user.name || user.id}${user.role ? ` (${user.role})` : ""}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [assignableUsers]);

  async function loadBranches() {
    try {
      setLoading(true);
      const data = await fetchJsonWithFallback(fallbackBranchEndpoints);
      setBranches(normalizeBranches(data));
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsersByRole(role) {
    const endpoints = [`/api/users?role=${role}`, `/users?role=${role}`];
    try {
      const data = await fetchJsonWithFallback(endpoints);
      if (!Array.isArray(data)) return [];
      return data.map((user) => ({ ...user, role }));
    } catch (err) {
      return [];
    }
  }

  async function loadUsers() {
    try {
      setLoadingUsers(true);
      const results = await Promise.all(ROLE_OPTIONS.map(fetchUsersByRole));
      const map = new Map();
      results.flat().forEach((user) => {
        if (!user?.id || map.has(user.id)) return;
        map.set(user.id, user);
      });
      setAssignableUsers(Array.from(map.values()));
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadBranches();
    loadUsers();
  }, []);

  async function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) {
      setError("Branch name is required.");
      return;
    }

    try {
      setCreating(true);
      await postJsonWithFallback(fallbackBranchEndpoints, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewBranchName("");
      await loadBranches();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create branch");
    } finally {
      setCreating(false);
    }
  }

  async function handleAssignAdmin(branchId) {
    const userId = selectedAdmins[branchId];
    if (!userId) {
      setError("Select a user to assign as branch admin.");
      return;
    }

    try {
      setAssigning((prev) => ({ ...prev, [branchId]: true }));
      await postJsonWithFallback(
        [
          `/api/branches/${branchId}/assign-admin`,
          `/branches/${branchId}/assign-admin`,
        ],
        {
          method: "POST",
          body: JSON.stringify({ userId, user_id: userId }),
        }
      );
      setSelectedAdmins((prev) => ({ ...prev, [branchId]: "" }));
      await loadBranches();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to assign branch admin");
    } finally {
      setAssigning((prev) => ({ ...prev, [branchId]: false }));
    }
  }

  async function handleRemoveAdmin(userId) {
    if (!userId) return;
    try {
      setRemoving((prev) => ({ ...prev, [userId]: true }));
      await postJsonWithFallback(
        [`/api/users/${userId}/remove-admin`, `/users/${userId}/remove-admin`],
        { method: "POST" }
      );
      await loadBranches();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to remove branch admin");
    } finally {
      setRemoving((prev) => ({ ...prev, [userId]: false }));
    }
  }


  return (
    <div className="branches-page">
      <div className="branches-header">
        <div>
          <h2>Branch Management</h2>
          <p>Add branches and manage branch admins.</p>
        </div>
      </div>

      <div className="branches-card">
        <div className="branches-card-header">
          <div>
            <h3>Add Branch</h3>
            <p>Branch names should be unique and easy to recognize.</p>
          </div>
          
        </div>

        {error && <div className="branches-error">{error}</div>}

        <div className="branches-form">
          <div className="branches-field">
            <label>Branch Name *</label>
            <input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="e.g. North Zone"
            />
          </div>
          <button
            className="primary"
            onClick={handleCreateBranch}
            disabled={creating}
          >
            {creating ? "Saving..." : "Add Branch"}
          </button>
        </div>
      </div>

      <div className="branches-card">
        <div className="branches-card-header">
          <div>
            <h3>Branches</h3>
            <p>{sortedBranches.length} total</p>
          </div>
          <button
            className="secondary"
            onClick={loadBranches}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div className="branches-loading">Loading branches...</div>
        ) : (
          <div className="branches-table">
            <div className="branches-row branches-row-header">
              <div>Branch</div>
              <div>Created</div>
              <div>Branch Admins</div>
              <div>Assign Admin</div>
            </div>

            {sortedBranches.length === 0 && (
              <div className="branches-empty">No branches created yet.</div>
            )}

            {sortedBranches.map((branch) => (
              <div key={branch.id} className="branches-row">
                <div className="branch-main">
                  <div className="branch-name">{branch.name || "Unnamed branch"}</div>
                  <div className="branch-id">{branch.id}</div>
                </div>

                <div className="branch-created">{formatDate(branch.created_at)}</div>

                <div className="branch-admins">
                  {branch.admins.length === 0 ? (
                    <span className="branch-empty">No admins assigned</span>
                  ) : (
                    branch.admins.map((admin) => (
                      <div key={admin.id} className="branch-admin-chip">
                        <span>{admin.name || admin.id}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAdmin(admin.id)}
                          disabled={removing[admin.id]}
                        >
                          {removing[admin.id] ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="branch-assign">
                  <select
                    value={selectedAdmins[branch.id] || ""}
                    onChange={(e) =>
                      setSelectedAdmins((prev) => ({
                        ...prev,
                        [branch.id]: e.target.value,
                      }))
                    }
                    disabled={loadingUsers || userOptions.length === 0}
                  >
                    <option value="">
                      {loadingUsers ? "Loading users..." : "Select user"}
                    </option>
                    {userOptions.map((user) => (
                      <option key={user.value} value={user.value}>
                        {user.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleAssignAdmin(branch.id)}
                    disabled={
                      assigning[branch.id] ||
                      !selectedAdmins[branch.id] ||
                      loadingUsers
                    }
                  >
                    {assigning[branch.id] ? "Assigning..." : "Assign"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

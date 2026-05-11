import { useEffect, useMemo, useState } from "react";
import { apiFetch, safeJson } from "../../api";

function buildPermissionSet(values = []) {
  return new Set(values.map((value) => String(value)));
}

export default function RolesTab({
  roles = [],
  permissions = [],
  loading = false,
  loadRolesData,
  setError,
}) {
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPermissions, setCreatePermissions] = useState([]);
  const [editName, setEditName] = useState("");
  const [editPermissions, setEditPermissions] = useState([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((role) => String(role.id) === String(selectedRoleId)) || null,
    [roles, selectedRoleId]
  );

  useEffect(() => {
    if (!roles.length) {
      setSelectedRoleId("");
      return;
    }

    if (!selectedRoleId || !roles.some((role) => String(role.id) === String(selectedRoleId))) {
      setSelectedRoleId(String(roles[0].id));
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (!selectedRole) {
      setEditName("");
      setEditPermissions([]);
      return;
    }

    setEditName(selectedRole.name || "");
    setEditPermissions(
      Array.isArray(selectedRole.permissions)
        ? selectedRole.permissions.map((permission) =>
            typeof permission === "string" ? permission : permission.name
          )
        : []
    );
  }, [selectedRole]);

  const createPermissionSet = useMemo(
    () => buildPermissionSet(createPermissions),
    [createPermissions]
  );
  const editPermissionSet = useMemo(
    () => buildPermissionSet(editPermissions),
    [editPermissions]
  );

  function togglePermission(permissionName, setSelectedValues) {
    setSelectedValues((current) => {
      const next = new Set(current);
      if (next.has(permissionName)) {
        next.delete(permissionName);
      } else {
        next.add(permissionName);
      }
      return Array.from(next).sort();
    });
  }

  async function handleCreateRole() {
    if (!createName.trim()) {
      setError("Role name is required");
      return;
    }

    try {
      setCreating(true);
      const res = await apiFetch("/api/roles", {
        method: "POST",
        body: JSON.stringify({
          name: createName.trim(),
          permissions: createPermissions,
        }),
      });

      if (!res?.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to create role");
      }

      setCreateName("");
      setCreatePermissions([]);
      setError(null);
      await loadRolesData();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create role");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveRole() {
    if (!selectedRole) {
      setError("Select a role to edit");
      return;
    }

    if (!editName.trim()) {
      setError("Role name is required");
      return;
    }

    try {
      setSaving(true);
      const res = await apiFetch(`/api/roles/${selectedRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          permissions: editPermissions,
        }),
      });

      if (!res?.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to update role");
      }

      setError(null);
      await loadRolesData();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to update role");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!selectedRole) {
      setError("Select a role to delete");
      return;
    }

    const confirmed = window.confirm(
      `Delete role "${selectedRole.name}"? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);
      const res = await apiFetch(`/api/roles/${selectedRole.id}`, {
        method: "DELETE",
      });

      if (!res?.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to delete role");
      }

      setError(null);
      await loadRolesData();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to delete role");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="team-page">Loading roles...</div>;
  }

  return (
    <div className="team-page">
      <div className="team-roles-grid">
        <div className="team-card">
          <div className="team-card-header">
            <div>
              <div className="team-card-title">Create Role</div>
              <div className="team-card-subtitle">
                Add a role and choose its permission set.
              </div>
            </div>
          </div>

          <div className="team-form">
            <label className="team-field">
              <span>Role Name *</span>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Enter role name"
              />
            </label>
          </div>

          <div className="team-permission-group">
            {permissions.map((permission) => (
              <label key={permission.id} className="team-permission-item">
                <input
                  type="checkbox"
                  checked={createPermissionSet.has(permission.name)}
                  onChange={() => togglePermission(permission.name, setCreatePermissions)}
                />
                <span>{permission.name}</span>
              </label>
            ))}
          </div>

          <div className="team-form-actions">
            <button onClick={handleCreateRole} disabled={creating}>
              {creating ? "Creating..." : "Create Role"}
            </button>
          </div>
        </div>

        <div className="team-card">
          <div className="team-card-header">
            <div>
              <div className="team-card-title">Edit Role</div>
              <div className="team-card-subtitle">
                Rename a role and update its permissions.
              </div>
            </div>
          </div>

          <div className="team-form">
            <label className="team-field">
              <span>Role *</span>
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} ({role.users_count || 0} users)
                  </option>
                ))}
              </select>
            </label>

            <label className="team-field">
              <span>Role Name *</span>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Update role name"
                disabled={!selectedRole}
              />
            </label>
          </div>

          <div className="team-permission-group">
            {permissions.map((permission) => (
              <label key={permission.id} className="team-permission-item">
                <input
                  type="checkbox"
                  checked={editPermissionSet.has(permission.name)}
                  onChange={() => togglePermission(permission.name, setEditPermissions)}
                  disabled={!selectedRole}
                />
                <span>{permission.name}</span>
              </label>
            ))}
          </div>

          <div className="team-role-meta">
            {selectedRole ? `${selectedRole.users_count || 0} users assigned` : "Select a role to edit"}
          </div>

          <div className="team-edit-actions">
            <button
              className="team-cancel-btn"
              onClick={handleDeleteRole}
              disabled={!selectedRole || deleting}
            >
              {deleting ? "Deleting..." : "Delete Role"}
            </button>
            <button
              className="team-save-btn"
              onClick={handleSaveRole}
              disabled={!selectedRole || saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      <div className="team-card">
        <div className="team-card-header">
          <div>
            <div className="team-card-title">Existing Roles</div>
            <div className="team-card-subtitle">
              Current roles and scoped user assignment counts.
            </div>
          </div>
          <div className="team-card-count">{roles.length}</div>
        </div>

        <div className="team-list">
          {roles.length === 0 && (
            <div className="team-empty">No roles available.</div>
          )}

          {roles.map((role) => (
            <div key={role.id} className="team-tech-row">
              <div className="team-tech-info">
                <div className="team-tech-name">{role.name}</div>
                <div className="team-tech-email">
                  {(role.permissions || []).slice(0, 4).join(", ") || "No permissions assigned"}
                </div>
              </div>
              <div className="team-list-meta">
                <span className="team-role-badge">{role.users_count || 0} users</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

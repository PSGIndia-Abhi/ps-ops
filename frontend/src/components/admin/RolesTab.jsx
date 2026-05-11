import { useEffect, useMemo, useState } from "react";
import { apiFetch, safeJson } from "../../api";

function buildPermissionSet(values = []) {
  return new Set(values.map((value) => String(value)));
}

// Permission categories with descriptions
const PERMISSION_CATEGORIES = {
  jobs: {
    label: "Jobs",
    icon: "📋",
    permissions: [
      { name: "VIEW_JOB", desc: "View job details and listings" },
      { name: "CREATE_JOB", desc: "Create new jobs" },
      { name: "UPDATE_JOB", desc: "Modify job information" },
      { name: "UPDATE_JOB_STATUS", desc: "Change job status" },
      { name: "ADD_JOB_COMMENT", desc: "Add comments to jobs" },
      { name: "REASSIGN_JOB", desc: "Reassign jobs to staff" },
      { name: "ASSIGN_RECURRING_JOB", desc: "Create recurring job assignments" },
      { name: "WHITELIST_CLIENT_COMMENT", desc: "Approve client comments" },
    ],
  },
  visits: {
    label: "Visits",
    icon: "🏢",
    permissions: [
      { name: "CREATE_VISIT", desc: "Create new visits" },
      { name: "VIEW_VISIT", desc: "View visit details" },
      { name: "UPDATE_VISIT", desc: "Update visit information" },
      { name: "START_VISIT", desc: "Start/begin visits" },
      { name: "SUBMIT_VISIT", desc: "Submit visit reports" },
      { name: "APPROVE_VISIT", desc: "Approve submitted visits" },
    ],
  },
  contacts: {
    label: "Contacts",
    icon: "👥",
    permissions: [
      { name: "VIEW_CONTACT", desc: "View contact information" },
      { name: "CREATE_CONTACT", desc: "Create new contacts" },
      { name: "UPDATE_CONTACT", desc: "Edit contact details" },
      { name: "DELETE_CONTACT", desc: "Remove contacts" },
    ],
  },
  booking: {
    label: "Booking",
    icon: "📅",
    permissions: [
      { name: "CREATE_BOOKING", desc: "Create new bookings" },
      { name: "VIEW_BOOKING", desc: "View booking details" },
      { name: "UPDATE_BOOKING", desc: "Modify booking information" },
      { name: "CANCEL_BOOKING", desc: "Cancel bookings" },
      { name: "ARCHIVE_BOOKING", desc: "Archive completed bookings" },
    ],
  },
  system: {
    label: "System & Admin",
    icon: "⚙️",
    permissions: [
      { name: "VIEW_USER", desc: "View user accounts" },
      { name: "CREATE_USER", desc: "Create new users" },
      { name: "UPDATE_USER", desc: "Modify user details" },
      { name: "DELETE_USER", desc: "Remove users" },
      { name: "CREATE_ROLE", desc: "Create new roles" },
      { name: "VIEW_ROLE", desc: "View role configurations" },
      { name: "UPDATE_ROLE", desc: "Edit role permissions" },
      { name: "DELETE_ROLE", desc: "Delete roles" },
      { name: "VIEW_BRANCH", desc: "View branch information" },
      { name: "CREATE_BRANCH", desc: "Create new branches" },
      { name: "UPDATE_BRANCH", desc: "Edit branch details" },
      { name: "DELETE_BRANCH", desc: "Delete branches" },
      { name: "ASSIGN_BRANCH_ADMIN", desc: "Assign branch administrators" },
      { name: "UPDATE_BRANCH_ADMIN", desc: "Modify admin assignments" },
      { name: "DELETE_BRANCH_ADMIN", desc: "Remove branch admins" },
    ],
  },
  analytics: {
    label: "Analytics",
    icon: "📊",
    permissions: [
      { name: "VIEW_ANALYTICS", desc: "View analytics dashboards" },
      { name: "VIEW_BRANCH_ANALYTICS", desc: "View branch-level analytics" },
      { name: "VIEW_GLOBAL_ANALYTICS", desc: "View system-wide analytics" },
    ],
  },
};

function PermissionGroup({ category, categoryKey, permissionSet, onToggle, disabled }) {
  const [expanded, setExpanded] = useState(false);
  const selectedCount = category.permissions.filter((p) =>
    permissionSet.has(p.name)
  ).length;

  return (
    <div className="permission-group">
      <button
        className="permission-group-header"
        onClick={() => setExpanded(!expanded)}
        disabled={disabled}
      >
        <span className="permission-group-icon">{category.icon}</span>
        <span className="permission-group-title">{category.label}</span>
        <span className="permission-group-badge">
          {selectedCount}/{category.permissions.length}
        </span>
        <span className={`permission-group-toggle ${expanded ? "expanded" : ""}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="permission-group-content">
          {category.permissions.map((permission) => (
            <label key={permission.name} className="permission-item">
              <input
                type="checkbox"
                checked={permissionSet.has(permission.name)}
                onChange={() => onToggle(permission.name)}
                disabled={disabled}
              />
              <div className="permission-item-content">
                <span className="permission-item-name">{permission.name}</span>
                <span className="permission-item-desc">{permission.desc}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
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

          <div className="permissions-container">
            {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => (
              <PermissionGroup
                key={key}
                category={category}
                categoryKey={key}
                permissionSet={createPermissionSet}
                onToggle={(permName) =>
                  togglePermission(permName, setCreatePermissions)
                }
                disabled={false}
              />
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

          <div className="permissions-container">
            {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => (
              <PermissionGroup
                key={key}
                category={category}
                categoryKey={key}
                permissionSet={editPermissionSet}
                onToggle={(permName) =>
                  togglePermission(permName, setEditPermissions)
                }
                disabled={!selectedRole}
              />
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
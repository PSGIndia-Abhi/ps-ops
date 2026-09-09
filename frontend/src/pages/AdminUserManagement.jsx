import { useEffect, useMemo, useState } from "react";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import StatusAlertModal from "../components/StatusAlertModal";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import { paginate } from "../utils/pagination";
import "./AdminUserManagement.css";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role_id: "",
  branch_id: "",
};

// /api/branches can return either a flat branch list or branch rows joined
// with their admins (one row per admin). Dedupe by id either way.
function normalizeBranches(data) {
  if (!Array.isArray(data)) return [];
  const map = new Map();
  data.forEach((row) => {
    if (!row?.id || map.has(row.id)) return;
    map.set(row.id, { id: row.id, name: row.name });
  });
  return Array.from(map.values());
}

export default function AdminUserManagement() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("latest");
  const [page, setPage] = useState(1);

  const [modalMode, setModalMode] = useState(null); // null | "add" | "edit"
  const [form, setForm] = useState(emptyForm);
  const [editingUserId, setEditingUserId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [status, setStatus] = useState(null); // null | { type: "success" | "error", message }

  // In-app replacement for window.confirm() on delete/deactivate.
  const [confirmState, setConfirmState] = useState(null); // null | { message, onConfirm }

  function requestConfirm(message, onConfirm) {
    setConfirmState({ message, onConfirm });
  }

  function closeConfirm() {
    setConfirmState(null);
  }

  const assignableRoles = useMemo(
    () => roles.filter((r) => !["admin", "super_admin", "system"].includes(String(r.name || "").toLowerCase())),
    [roles]
  );

  // Filter options always include Supervisor/Technician (as required), plus
  // whichever other roles are actually present among the loaded users.
  const roleFilterOptions = useMemo(() => {
    const present = new Set(users.map((u) => String(u.role || "").toLowerCase()).filter(Boolean));
    ["supervisor", "technician"].forEach((r) => present.add(r));
    return Array.from(present).sort();
  }, [users]);

  async function loadUsers() {
    try {
      setLoading(true);
      const res = await apiFetch("/api/users");
      if (!res?.ok) throw new Error((await safeJson(res))?.error || "Failed to load users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const res = await apiFetch("/api/roles");
      if (!res?.ok) return;
      const data = await res.json();
      setRoles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadBranches() {
    try {
      const res = await apiFetch("/api/branches");
      if (!res?.ok) return;
      const data = await res.json();
      setBranches(normalizeBranches(data));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadUsers();
    loadRoles();
    loadBranches();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = users.filter((user) => {
      if (roleFilter !== "all" && String(user.role || "").toLowerCase() !== roleFilter) {
        return false;
      }
      if (!query) return true;
      const haystack = `${user.name || ""} ${user.email || ""}`.toLowerCase();
      return haystack.includes(query);
    });

    const sorted = [...matches];
    if (sortOrder === "az") {
      sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } else {
      sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
    return sorted;
  }, [users, search, roleFilter, sortOrder]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, sortOrder]);

  const pagedUsers = useMemo(() => paginate(filteredUsers, page), [filteredUsers, page]);

  function openAddModal() {
    setForm(emptyForm);
    setEditingUserId(null);
    setFormError(null);
    setModalMode("add");
  }

  function openEditModal(user) {
    setForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      role_id: user.role_id ? String(user.role_id) : "",
      branch_id: user.branch_id || "",
    });
    setEditingUserId(user.id);
    setFormError(null);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setEditingUserId(null);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!form.email.trim()) {
      setFormError("Email is required.");
      return;
    }
    if (modalMode === "add" && form.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (!form.role_id) {
      setFormError("Role is required.");
      return;
    }
    if (!form.branch_id) {
      setFormError("Branch is required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      role_id: form.role_id,
      branch_id: form.branch_id,
    };

    if (modalMode === "add") {
      payload.password = form.password;
    }

    try {
      setSaving(true);

      const res =
        modalMode === "edit"
          ? await apiFetch(`/api/users/${editingUserId}`, {
              method: "PUT",
              body: JSON.stringify(payload),
            })
          : await apiFetch("/api/users", {
              method: "POST",
              body: JSON.stringify(payload),
            });

      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to save user");
      }

      closeModal();
      await loadUsers();
      setStatus({
        type: "success",
        message:
          modalMode === "edit"
            ? `User "${payload.name}" updated successfully.`
            : `User "${payload.name}" added successfully.`,
      });
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Failed to save user");
      setStatus({ type: "error", message: err.message || "Failed to save user." });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(user) {
    requestConfirm(
      `Deactivate ${user.name || "this user"}? They will lose access immediately.`,
      () => performDelete(user)
    );
  }

  async function performDelete(user) {
    closeConfirm();
    try {
      setDeletingId(user.id);
      const res = await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to delete user");
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setError(null);
      setStatus({ type: "success", message: `User "${user.name || user.id}" deleted successfully.` });
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to delete user");
      setStatus({ type: "error", message: err.message || "Failed to delete user." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="user-mgmt-page">
      <div className="user-mgmt-header">
        <div>
          <h2>User Management</h2>
          <p>View, search, and manage every user in the system.</p>
        </div>
        <button className="primary" onClick={openAddModal}>
          + Add User
        </button>
      </div>

      {error && (
        <div className="user-mgmt-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="user-mgmt-toolbar">
        <input
          className="user-mgmt-search"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select className="role-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {roleFilterOptions.map((role) => (
            <option key={role} value={role}>
              {role.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
          <option value="latest">Latest</option>
          <option value="az">A-Z</option>
        </select>
      </div>

      <div className="user-mgmt-card">
        <div className="user-mgmt-row user-mgmt-row-header">
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Branch</div>
          <div>Actions</div>
        </div>

        {loading ? (
          <div className="user-mgmt-loading">Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="user-mgmt-empty">No users match your search.</div>
        ) : (
          pagedUsers.map((user) => (
            <div key={user.id} className="user-mgmt-row">
              <div className="user-mgmt-cell" data-label="Name">
                {user.name || `User ${user.id}`}
              </div>
              <div className="user-mgmt-cell" data-label="Email">
                {user.email || "-"}
              </div>
              <div className="user-mgmt-cell" data-label="Role">
                <span className="user-mgmt-role-badge">{user.role || "unassigned"}</span>
              </div>
              <div className="user-mgmt-cell" data-label="Branch">
                {user.branch_name || "No branch"}
              </div>
              <div className="user-mgmt-cell user-mgmt-actions" data-label="Actions">
                <button type="button" className="edit" title="Edit" aria-label="Edit" onClick={() => openEditModal(user)}>
                  <FiEdit2 />
                </button>
                <button
                  type="button"
                  className="danger"
                  title="Delete"
                  aria-label="Delete"
                  onClick={() => handleDelete(user)}
                  disabled={deletingId === user.id}
                >
                  <FiTrash2 />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination page={page} totalItems={filteredUsers.length} onChange={setPage} />

      {modalMode && (
        <div className="user-mgmt-modal-overlay" onClick={closeModal}>
          <div className="user-mgmt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modalMode === "edit" ? "Edit User" : "Add User"}</h3>

            {formError && <div className="user-mgmt-error">{formError}</div>}

            <div className="user-mgmt-form">
              <label>
                <span>Name *</span>
                <input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="Full name"
                />
              </label>

              <label>
                <span>Email *</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="name@example.com"
                />
              </label>

              <label>
                <span>Phone</span>
                <input
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="Optional"
                />
              </label>

              {modalMode === "add" && (
                <label>
                  <span>Password *</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                  />
                </label>
              )}

              <label>
                <span>Role *</span>
                <select value={form.role_id} onChange={(e) => updateField("role_id", e.target.value)}>
                  <option value="">Select role</option>
                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Branch *</span>
                <select value={form.branch_id} onChange={(e) => updateField("branch_id", e.target.value)}>
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="user-mgmt-modal-actions">
              <button type="button" className="secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSubmit} disabled={saving}>
                {saving ? "Saving..." : modalMode === "edit" ? "Save Changes" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      <StatusAlertModal status={status} onClose={() => setStatus(null)} />

      <ConfirmDialog
        open={Boolean(confirmState)}
        message={confirmState?.message}
        onConfirm={() => confirmState?.onConfirm?.()}
        onCancel={closeConfirm}
      />
    </div>
  );
}

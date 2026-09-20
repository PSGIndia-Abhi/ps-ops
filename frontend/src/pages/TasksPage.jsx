import { useEffect, useMemo, useState } from "react";
import { apiFetch, safeJson } from "../api";
import "./TasksPage.css";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
}

const PRIORITIES = ["LOW", "NORMAL", "HIGH"];
const STATUSES = ["OPEN", "COMPLETED", "CANCELLED"];

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("OPEN");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    reference_id: "",
    task_type: "",
    title: "",
    notes: "",
    priority: "NORMAL",
    assigned_to: "",
    due_date: "",
    due_time: "",
  });

  const [selectedTask, setSelectedTask] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function loadTasks() {
    try {
      setLoading(true);
      const res = await apiFetch("/api/tasks");
      if (!res?.ok) throw new Error((await safeJson(res))?.error || "Failed to load tasks");
      const list = await res.json();
      setTasks(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Tasks load failed", err);
      setError(err.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    (async () => {
      const [invoicesRes, usersRes] = await Promise.all([
        apiFetch("/api/invoices"),
        apiFetch("/api/users"),
      ]);
      if (invoicesRes?.ok) setInvoices((await safeJson(invoicesRes)) || []);
      if (usersRes?.ok) setUsers((await safeJson(usersRes)) || []);
    })();
  }, []);

  const filteredTasks = useMemo(() => {
    if (!statusFilter) return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  function resetForm() {
    setForm({
      reference_id: "",
      task_type: "",
      title: "",
      notes: "",
      priority: "NORMAL",
      assigned_to: "",
      due_date: "",
      due_time: "",
    });
    setFormError("");
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!form.reference_id || !form.task_type || !form.title) {
      setFormError("Related invoice, task type and title are required.");
      return;
    }

    try {
      setSaving(true);
      setFormError("");
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          reference_type: "INVOICE",
          reference_id: form.reference_id,
          task_type: form.task_type,
          title: form.title,
          notes: form.notes || null,
          priority: form.priority,
          assigned_to: form.assigned_to || null,
          due_date: form.due_date || null,
          due_time: form.due_time || null,
        }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to create task");

      setIsFormOpen(false);
      resetForm();
      await loadTasks();
    } catch (err) {
      setFormError(err.message || "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  async function openTaskDetail(taskId) {
    setSelectedTask({ id: taskId });
    setDetailError("");
    try {
      const res = await apiFetch(`/api/tasks/${taskId}`);
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to load task");
      setSelectedTask(data);
    } catch (err) {
      setDetailError(err.message || "Failed to load task");
    }
  }

  async function handleUpdateStatus(taskId, status) {
    try {
      setUpdating(true);
      const res = await apiFetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to update task");
      setSelectedTask(null);
      await loadTasks();
    } catch (err) {
      setDetailError(err.message || "Failed to update task");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <div className="tasks-page">Loading tasks...</div>;
  if (error) return <div className="tasks-page">Error: {error}</div>;

  return (
    <div className="tasks-page">
      <div className="tasks-header">
        <div>
          <h2>Tasks</h2>
          <div className="tasks-subtitle">{filteredTasks.length} total</div>
        </div>
        <button type="button" className="tasks-primary-btn" onClick={() => setIsFormOpen(true)}>
          New Task
        </button>
      </div>

      <div className="tasks-filters">
        <label>Status</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="tasks-list">
        {filteredTasks.length === 0 && <div className="tasks-empty">No tasks found.</div>}
        {filteredTasks.map((t) => (
          <div key={t.id} className="task-row" onClick={() => openTaskDetail(t.id)}>
            <div className="task-main">
              <div className="task-title">{t.title}</div>
              <div className="task-type">{t.task_type}</div>
            </div>
            <div className="task-assignee">{t.assigned_to_name || "Unassigned"}</div>
            <div className="task-due">Due {formatDate(t.due_date)}</div>
            <div className={`task-priority priority-${t.priority}`}>{t.priority}</div>
            <div className={`task-status status-${t.status}`}>{t.status}</div>
          </div>
        ))}
      </div>

      {isFormOpen && (
        <div className="tasks-modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="tasks-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>New Task</h3>
            <form onSubmit={handleCreateTask} className="tasks-form">
              <label>
                Related Invoice
                <select
                  value={form.reference_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, reference_id: e.target.value }))}
                  required
                >
                  <option value="">Select invoice</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} · {inv.customer_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Task Type
                <input
                  type="text"
                  placeholder="e.g. FOLLOW_UP, COLLECTION_CALL"
                  value={form.task_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, task_type: e.target.value }))}
                  required
                />
              </label>

              <label>
                Title
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </label>

              <label>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </label>

              <div className="tasks-form-row">
                <label>
                  Priority
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Assign To
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setForm((prev) => ({ ...prev, assigned_to: e.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="tasks-form-row">
                <label>
                  Due Date
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
                  />
                </label>
                <label>
                  Due Time
                  <input
                    type="time"
                    value={form.due_time}
                    onChange={(e) => setForm((prev) => ({ ...prev, due_time: e.target.value }))}
                  />
                </label>
              </div>

              {formError && <div className="tasks-form-error">{formError}</div>}

              <div className="tasks-form-actions">
                <button type="button" onClick={() => { setIsFormOpen(false); resetForm(); }} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tasks-primary-btn" disabled={saving}>
                  {saving ? "Saving..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="tasks-modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="tasks-modal-card" onClick={(e) => e.stopPropagation()}>
            {detailError ? (
              <div className="tasks-form-error">{detailError}</div>
            ) : !selectedTask.title ? (
              <div>Loading...</div>
            ) : (
              <>
                <h3>{selectedTask.title}</h3>
                <div className="task-detail-grid">
                  <div>
                    <div className="task-detail-label">Type</div>
                    <div>{selectedTask.task_type}</div>
                  </div>
                  <div>
                    <div className="task-detail-label">Priority</div>
                    <div>{selectedTask.priority}</div>
                  </div>
                  <div>
                    <div className="task-detail-label">Assigned To</div>
                    <div>{selectedTask.assigned_to_name || "Unassigned"}</div>
                  </div>
                  <div>
                    <div className="task-detail-label">Due</div>
                    <div>{formatDate(selectedTask.due_date)}</div>
                  </div>
                </div>
                {selectedTask.notes && (
                  <>
                    <div className="task-detail-label" style={{ marginTop: 12 }}>
                      Notes
                    </div>
                    <div>{selectedTask.notes}</div>
                  </>
                )}

                <div className="tasks-form-actions">
                  <button type="button" onClick={() => setSelectedTask(null)}>
                    Close
                  </button>
                  {selectedTask.status !== "COMPLETED" && (
                    <button
                      type="button"
                      className="tasks-primary-btn"
                      disabled={updating}
                      onClick={() => handleUpdateStatus(selectedTask.id, "COMPLETED")}
                    >
                      Mark Completed
                    </button>
                  )}
                  {selectedTask.status !== "CANCELLED" && (
                    <button
                      type="button"
                      className="tasks-danger-btn"
                      disabled={updating}
                      onClick={() => handleUpdateStatus(selectedTask.id, "CANCELLED")}
                    >
                      Cancel Task
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

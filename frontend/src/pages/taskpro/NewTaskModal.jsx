import { useState } from "react";
import { FiPlus } from "react-icons/fi";
import { PRIORITY, TASK_TYPES } from "./data";
import { assignableUsers } from "./hierarchy";
import { toInputValue } from "./format";
import { createTask } from "./tasksApi";
import { useToast } from "./toastContext";
import { Modal } from "./ui";
import { useViewer } from "./viewerContext";

const inOneDay = () => toInputValue(Date.now() + 24 * 3600 * 1000);

export default function NewTaskModal({ onClose, onCreated }) {
  const toast = useToast();
  const viewer = useViewer();
  const people = assignableUsers(viewer.id);
  const isTop = viewer.level === "top";
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: TASK_TYPES[0],
    priority: "MEDIUM",
    assignedTo: (people.find((u) => u.id !== viewer.id) || people[0])?.id,
    managerCanEdit: false,
    due: inOneDay(),
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e, close) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Give the task a title.");
      return;
    }
    setSaving(true);
    const task = await createTask({
      title: form.title.trim(),
      description: form.description.trim(),
      type: form.type,
      tags: [form.type],
      priority: form.priority,
      assignedTo: form.assignedTo,
      managerCanEdit: isTop && form.managerCanEdit,
      dueAt: new Date(form.due).getTime(),
    });
    toast.push({ type: "success", title: "Task created", text: task.no });
    close();
    onCreated?.(task);
  }

  return (
    <Modal title="New task" onClose={onClose} size="lg">
      {(close) => (
        <form className="tp-form" onSubmit={(e) => submit(e, close)} noValidate>
          <label className="tp-field">
            <span>Title *</span>
            <input
              className={`tp-input ${error ? "invalid" : ""}`}
              value={form.title}
              onChange={(e) => {
                setError("");
                change("title")(e);
              }}
              placeholder="e.g. Call ABC Hotels about the pending payment"
              autoFocus
            />
            {error && <em className="tp-error">{error}</em>}
          </label>

          <label className="tp-field">
            <span>Description</span>
            <textarea className="tp-input" rows={3} value={form.description} onChange={change("description")} placeholder="What needs to be done?" />
          </label>

          <div className="tp-form-grid">
            <label className="tp-field">
              <span>Type</span>
              <select className="tp-input" value={form.type} onChange={change("type")}>
                {TASK_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="tp-field">
              <span>Priority</span>
              <select className="tp-input" value={form.priority} onChange={change("priority")}>
                {Object.entries(PRIORITY).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tp-field">
              <span>Assign to</span>
              <select className="tp-input" value={form.assignedTo} onChange={change("assignedTo")} disabled={people.length < 2}>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="tp-field">
              <span>Due date &amp; time</span>
              <input className="tp-input" type="datetime-local" value={form.due} onChange={change("due")} />
            </label>
          </div>

          {isTop && (
            <label className="tp-switch">
              <input
                type="checkbox"
                checked={form.managerCanEdit}
                onChange={(e) => setForm((f) => ({ ...f, managerCanEdit: e.target.checked }))}
              />
              <span className="tp-switch-track" />
              <span className="tp-switch-text">
                <strong>Allow manager to edit this task</strong>
                <small>Off: the person's head can view and comment only. On: the head can also edit it.</small>
              </span>
            </label>
          )}

          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="tp-btn primary" disabled={saving}>
              <FiPlus /> {saving ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

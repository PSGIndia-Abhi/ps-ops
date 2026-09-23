import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheckCircle, FiChevronDown, FiPlus } from "react-icons/fi";
import SetReminderModal from "../../components/accountant/SetReminderModal";
import { Badge, DataError, EmptyRow, Pager } from "./ui";
import { completeTask, createReminder, showDate, useAccountantData, usePaged } from "./data";

const TABS = [
  { key: "ALL", label: "All Tasks" },
  { key: "TODAY", label: "Today" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "OVERDUE", label: "Overdue" },
  { key: "COMPLETED", label: "Completed" },
];

const TASK_TYPES = ["Payment Follow-up", "Call Customer", "Send Invoice", "Send Reminder", "Other"];
const EMPTY_FILTERS = { priority: "", taskType: "", customer: "", assignedTo: "", from: "", to: "" };
const uniq = (list, key) => [...new Set(list.map((i) => i[key]).filter(Boolean))].sort();

export default function TaskManagement() {
  const { invoices, tasks, loading, error, reload } = useAccountantData();
  const [actionError, setActionError] = useState("");
  const [completing, setCompleting] = useState("");
  const [tab, setTab] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const filterRef = useRef(null);

  // Close the dropdown when the user clicks outside it or presses Escape.
  useEffect(() => {
    if (!showFilters) return undefined;
    const onDown = (e) => { if (!filterRef.current?.contains(e.target)) setShowFilters(false); };
    const onKey = (e) => { if (e.key === "Escape") setShowFilters(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showFilters]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const customerOptions = useMemo(() => uniq(tasks, "customer_name"), [tasks]);
  const assigneeOptions = useMemo(() => uniq(tasks, "assigned_to_name"), [tasks]);

  const rows = tasks.filter((t) => {
    if (tab !== "ALL" && t.display_status !== tab) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.taskType && t.task_type !== filters.taskType) return false;
    if (filters.customer && t.customer_name !== filters.customer) return false;
    if (filters.assignedTo && t.assigned_to_name !== filters.assignedTo) return false;
    if (filters.from && (!t.due_date || t.due_date < filters.from)) return false;
    if (filters.to && (!t.due_date || t.due_date > filters.to)) return false;
    return true;
  });
  const { pageRows, page, setPage, pageSize } = usePaged(rows);

  async function markDone(id) {
    setCompleting(id);
    setActionError("");
    try {
      await completeTask(id);
      await reload();
    } catch (err) {
      setActionError(err.message || "The task could not be updated. Please try again.");
    } finally {
      setCompleting("");
    }
  }

  async function saveTask(form) {
    const invoice = invoices.find((i) => i.id === form.invoice_id);
    if (!invoice) throw new Error("Please select an invoice");
    await createReminder(form, invoice);
    await reload();
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <h2 className="ac-title">Tasks &amp; Reminders</h2>
        <div className="ac-actions">
          <button type="button" className="ac-btn ac-btn-primary" onClick={() => setCreateOpen(true)}><FiPlus /> Create Task</button>

          <div className="ac-dropdown-wrap" ref={filterRef}>
            <button
              type="button"
              className={`ac-btn ${showFilters ? "ac-btn-primary" : ""}`}
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              aria-haspopup="true"
            >
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""} <FiChevronDown />
            </button>

            {showFilters && (
              <div className="ac-dropdown" role="dialog" aria-label="Filters">
                <div className="ac-field">
                  <label>Priority</label>
                  <select className="ac-select" value={filters.priority} onChange={setFilter("priority")}>
                    <option value="">All priorities</option>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div className="ac-field">
                  <label>Task type</label>
                  <select className="ac-select" value={filters.taskType} onChange={setFilter("taskType")}>
                    <option value="">All task types</option>
                    {TASK_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="ac-field">
                  <label>Customer</label>
                  <select className="ac-select" value={filters.customer} onChange={setFilter("customer")}>
                    <option value="">All customers</option>
                    {customerOptions.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="ac-field">
                  <label>Assigned to</label>
                  <select className="ac-select" value={filters.assignedTo} onChange={setFilter("assignedTo")}>
                    <option value="">Everyone</option>
                    {assigneeOptions.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="ac-field">
                  <label>Due date</label>
                  <div className="ac-grid-2" style={{ gap: 8 }}>
                    <input className="ac-input" type="date" value={filters.from} onChange={setFilter("from")} aria-label="Due from" />
                    <input className="ac-input" type="date" value={filters.to} onChange={setFilter("to")} aria-label="Due to" />
                  </div>
                </div>
                <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="ac-btn" disabled={!activeFilters} onClick={() => setFilters(EMPTY_FILTERS)}>Reset</button>
                  <button type="button" className="ac-btn ac-btn-primary" onClick={() => setShowFilters(false)}>Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DataError error={error || actionError} onRetry={error ? reload : undefined} />

      <div className="ac-card">
        <div className="ac-tabs" style={{ marginBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ac-tab ${tab === t.key ? "active" : ""}`} onClick={() => { setTab(t.key); setPage(0); }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr><th>Due Date</th><th>Customer / Reference</th><th>Task Type</th><th>Priority</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((t) => (
                <tr key={t.id}>
                  <td>{showDate(t.due_date) || "—"}{t.due_time && <div style={{ color: "#64748b", fontSize: 12 }}>{t.due_time}</div>}</td>
                  <td>{t.customer_name || "—"}<div style={{ color: "#64748b", fontSize: 12 }}>{t.invoice_number}</div></td>
                  <td>{t.task_type}{t.notes && <div style={{ color: "#64748b", fontSize: 12 }}>{t.notes}</div>}</td>
                  <td><Badge value={t.priority} /></td>
                  <td><Badge value={t.display_status} /></td>
                  <td>
                    {t.status === "OPEN" ? (
                      <button type="button" className="ac-task-done" title="Mark as done" aria-label="Mark as done"
                        disabled={completing === t.id} onClick={() => markDone(t.id)}><FiCheckCircle /></button>
                    ) : <span className="ac-task-none">—</span>}
                  </td>
                </tr>
              )) : <EmptyRow cols={6} loading={loading} text="No tasks found" />}
            </tbody>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>

      <SetReminderModal open={createOpen} onClose={() => setCreateOpen(false)} invoices={invoices} onSave={saveTask} />
    </div>
  );
}

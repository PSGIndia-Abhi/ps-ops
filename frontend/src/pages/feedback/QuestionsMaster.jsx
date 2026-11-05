import { useCallback, useEffect, useState } from "react";
import { FiBriefcase, FiCheck, FiChevronDown, FiChevronUp, FiEdit2, FiFileText, FiGrid, FiLayers, FiMinus, FiPlus, FiSearch, FiTool, FiX } from "react-icons/fi";
import { deepCleaningServices, pestServices } from "../../components/CreateBookingModal";
import { OPERATIONS, PRIORITIES, PRIORITY, departmentHint, departmentName, getDepartmentSetup, getQuestions, saveDepartments, saveQuestions } from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import { Card, ErrorBox, Loading, PageHead, Segmented, Switch, Toast } from "./ui";

// Masters › Questions. The whole list is saved in one go (PUT /api/feedback/questions): array order
// is the display order, a row without an id is new, and nothing that was used is ever deleted -
// it is switched off instead. A question is General (asked on every feedback) or Service-based
// (asked when the site had one of its services that month); the collector picks which to ask.
let tempKey = 0;
const newKey = () => `new-${++tempKey}`;

// The services a Service question can be for - the same list as the booking form.
const SERVICES = [...pestServices, ...deepCleaningServices];

const TYPE_LABEL = { GENERAL: "General", SERVICE: "Service-based", DEPARTMENT: "Department" };
const TYPE_ICON = { GENERAL: FiGrid, SERVICE: FiTool, DEPARTMENT: FiBriefcase };

function withKeys(questions) {
  return questions.map((q) => ({
    ...q,
    question_type: q.question_type || "GENERAL",
    services: q.services || [],
    departments: q.departments || [],
    key: `q-${q.id}`,
    options: q.options.map((o) => ({ ...o, key: `o-${o.id}` })),
  }));
}

function forApi(list) {
  return list.map((q) => ({
    id: q.id ?? null,
    question_text: q.question_text,
    question_type: q.question_type,
    services: q.question_type === "SERVICE" ? q.services : [],
    departments: q.question_type === "DEPARTMENT" ? q.departments : [],
    is_active: q.is_active,
    is_required: q.is_required,
    show_on_form: q.show_on_form,
    options: q.options.map((o) => ({
      id: o.id ?? null,
      label: o.label,
      is_bad: o.is_bad,
      suggested_priority: o.is_bad ? o.suggested_priority || "MEDIUM" : null,
      is_active: o.is_active,
    })),
  }));
}

export default function QuestionsMaster() {
  const [saved, setSaved] = useState(null);
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showOff, setShowOff] = useState(false);
  const [typeFilter, setTypeFilter] = useState("ALL");
  // Department tab: the departments (from the user hierarchy) and which one's questions are shown.
  const { reloadDepartments } = useFeedbackAccess();
  const [deptSetup, setDeptSetup] = useState(null);
  const [deptFilter, setDeptFilter] = useState("");
  const loadDepartments = useCallback(() => {
    getDepartmentSetup()
      .then(setDeptSetup)
      .catch((err) => setError(err.message));
  }, []);
  useEffect(loadDepartments, [loadDepartments]);
  const activeDepts = (deptSetup?.departments || []).filter((d) => d.is_active);
  async function changeDepartments(rows, message) {
    setError("");
    try {
      setDeptSetup(await saveDepartments(rows));
      reloadDepartments();
      setNotice(message);
    } catch (err) {
      setError(err.message);
    }
  }
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearNotice = useCallback(() => setNotice(""), []);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    getQuestions(true)
      .then((d) => {
        const rows = withKeys(d.questions);
        setSaved(rows);
        setList(rows);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  if (!list) return error ? <ErrorBox error={error} onRetry={load} /> : <Loading />;

  const dirty = JSON.stringify(forApi(list)) !== JSON.stringify(forApi(saved));
  const active = list.filter((q) => q.is_active);
  const offCount = list.length - active.length;
  const countOf = (type) => active.filter((q) => q.question_type === type).length;
  const shown = (showOff ? list : active).filter(
    (q) => (typeFilter === "ALL" || q.question_type === typeFilter) && (typeFilter !== "DEPARTMENT" || !deptFilter || q.departments.includes(deptFilter)),
  );
  const deptCount = (kind) => active.filter((q) => q.question_type === "DEPARTMENT" && q.departments.includes(kind)).length;
  const current = list.find((q) => q.key === editing) || null;

  const updateQuestion = (key, changes) => setList((l) => l.map((q) => (q.key === key ? { ...q, ...changes } : q)));
  const updateOption = (qKey, oKey, changes) =>
    setList((l) => l.map((q) => (q.key === qKey ? { ...q, options: q.options.map((o) => (o.key === oKey ? { ...o, ...changes } : o)) } : q)));

  // Moves a question past the next one shown (switched-off or other-type rows in between stay put).
  function move(key, by) {
    const visible = new Set(shown.map((q) => q.key));
    setList((l) => {
      const i = l.findIndex((q) => q.key === key);
      let j = i + by;
      while (l[j] && !visible.has(l[j].key)) j += by;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addQuestion() {
    const key = newKey();
    setList((l) => [
      ...l,
      {
        key,
        id: null,
        question_text: "",
        question_type: ["SERVICE", "DEPARTMENT"].includes(typeFilter) ? typeFilter : "GENERAL",
        services: [],
        departments: typeFilter === "DEPARTMENT" && deptFilter ? [deptFilter] : [],
        // department questions are asked on the call only
        show_on_form: typeFilter !== "DEPARTMENT",
        is_active: true,
        is_required: true,
        options: [
          { key: newKey(), id: null, label: "Yes", is_bad: false, suggested_priority: null, is_active: true },
          { key: newKey(), id: null, label: "No", is_bad: true, suggested_priority: "MEDIUM", is_active: true },
        ],
      },
    ]);
    setEditing(key);
  }

  function removeOption(q, o) {
    if (o.id) updateOption(q.key, o.key, { is_active: !o.is_active });
    else updateQuestion(q.key, { options: q.options.filter((x) => x.key !== o.key) });
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const d = await saveQuestions(forApi(list));
      const rows = withKeys(d.questions);
      setSaved(rows);
      setList(rows);
      // keep the same question open: new rows got ids, so match by position
      if (current) {
        const pos = list.findIndex((q) => q.key === current.key);
        setEditing(rows[pos]?.key || null);
      }
      setNotice("Questions saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead
        title="Feedback questions"
        actions={
          <>
            {dirty && (
              <button
                type="button"
                className="fb-btn"
                onClick={() => {
                  setList(saved);
                  setEditing(null);
                }}
                disabled={saving}
              >
                Undo changes
              </button>
            )}
            <button type="button" className="fb-btn" onClick={addQuestion}>
              <FiPlus /> Add question
            </button>
            <button type="button" className="fb-btn fb-btn-ok" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save questions"}
            </button>
          </>
        }
      />

      <Toast notice={notice ? { text: notice } : null} onClose={clearNotice} />
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox error={error} />
        </div>
      )}
      {dirty && !error && (
        <div className="fb-alert fb-alert-warn" style={{ marginBottom: 16 }}>
          <span>You have changes that are not saved yet.</span>
        </div>
      )}

      <div className="fb-qtabs">
        {[
          ["ALL", "All questions", active.length, FiLayers],
          ["GENERAL", "General", countOf("GENERAL"), FiGrid],
          ["SERVICE", "Service-based", countOf("SERVICE"), FiTool],
          ["DEPARTMENT", "Department", countOf("DEPARTMENT"), FiBriefcase],
        ].map(([value, label, count, icon]) => ({ value, label, count, Icon: icon })).map((t) => (
          <button key={t.value} type="button" className={`fb-qtab ${typeFilter === t.value ? "is-on" : ""}`} onClick={() => setTypeFilter(t.value)} aria-pressed={typeFilter === t.value}>
            <span className="fb-qtab-icon" aria-hidden="true">
              <t.Icon />
            </span>
            <span className="fb-qtab-label">{t.label}</span>
            <span className="fb-qtab-count">{t.count}</span>
          </button>
        ))}
        {offCount > 0 && (
          <label className="fb-row fb-small" style={{ gap: 8, marginLeft: "auto" }}>
            <Switch checked={showOff} onChange={setShowOff} label="Show switched off" /> Show {offCount} switched off
          </label>
        )}
      </div>

      {typeFilter === "DEPARTMENT" && (
        <DepartmentsBar
          setup={deptSetup}
          filter={deptFilter}
          onFilter={setDeptFilter}
          count={deptCount}
          onChange={changeDepartments}
        />
      )}

      <div className="fb-grid-side" style={{ gridTemplateColumns: current ? "minmax(0,1fr) 460px" : "minmax(0,1fr)" }}>
        <div className="fb-qlist">
          {shown.length === 0 && (
            <div className="fb-qempty">
              {typeFilter === "DEPARTMENT" && deptFilter
                ? `No questions for ${departmentName(deptSetup?.departments, deptFilter)} yet.`
                : `No ${typeFilter === "ALL" ? "" : `${TYPE_LABEL[typeFilter].toLowerCase()} `}questions yet.`}
              <button type="button" className="fb-btn fb-btn-sm" onClick={addQuestion}>
                <FiPlus /> Add question
              </button>
            </div>
          )}
          {shown.map((q, n) => (
            <div key={q.key} className={`fb-qcard ${q.key === editing ? "is-editing" : ""} ${q.is_active ? "" : "is-off"}`}>
              <div className="fb-qcard-move">
                <button type="button" aria-label="Move up" disabled={n === 0} onClick={() => move(q.key, -1)}>
                  <FiChevronUp />
                </button>
                <span className="fb-qcard-no">{n + 1}</span>
                <button type="button" aria-label="Move down" disabled={n === shown.length - 1} onClick={() => move(q.key, 1)}>
                  <FiChevronDown />
                </button>
              </div>
              <div className="fb-qcard-main">
                <div className="fb-qcard-tags">
                  <span className={`fb-qtype fb-qtype-${q.question_type.toLowerCase()}`}>
                    {(() => {
                      const Icon = TYPE_ICON[q.question_type] || FiGrid;
                      return <Icon aria-hidden="true" />;
                    })()}{" "}
                    {TYPE_LABEL[q.question_type]}
                  </span>
                  <span className={`fb-qflag ${q.is_required ? "is-on" : ""}`}>{q.is_required ? "Required" : "Can skip"}</span>
                  <span className={`fb-qflag ${q.show_on_form && q.question_type !== "DEPARTMENT" ? "is-on" : ""}`}>{q.show_on_form && q.question_type !== "DEPARTMENT" ? "On WhatsApp form" : "Call only"}</span>
                  {!q.is_active && <span className="fb-qflag is-warn">Switched off</span>}
                </div>
                <div className="fb-qcard-text">{q.question_text || <span className="fb-muted">New question</span>}</div>
                <div className="fb-qcard-answers">
                  {q.options
                    .filter((o) => o.is_active)
                    .map((o) => (
                      <span key={o.key} className={`fb-qans ${o.is_bad ? "is-bad" : "is-good"}`}>
                        {o.label || "…"}
                        {o.is_bad && <em>{PRIORITY[o.suggested_priority]?.label || "?"}</em>}
                      </span>
                    ))}
                </div>
                {q.question_type === "DEPARTMENT" && (
                  <div className="fb-qcard-services">
                    {q.departments.length ? q.departments.map((d) => <span key={d}>{departmentName(deptSetup?.departments, d)}</span>) : <span className="is-warn">Pick the departments</span>}
                  </div>
                )}
                {q.question_type === "SERVICE" && (
                  <div className="fb-qcard-services">
                    {q.services.length ? (
                      <>
                        {q.services.slice(0, 4).map((x) => (
                          <span key={x}>{x}</span>
                        ))}
                        {q.services.length > 4 && <span>+{q.services.length - 4} more</span>}
                      </>
                    ) : (
                      <span className="is-warn">Pick the services</span>
                    )}
                  </div>
                )}
              </div>
              <button type="button" className={`fb-btn fb-btn-sm ${q.key === editing ? "fb-btn-primary" : ""}`} onClick={() => setEditing(q.key === editing ? null : q.key)}>
                <FiEdit2 aria-hidden="true" /> {q.key === editing ? "Editing" : "Edit"}
              </button>
            </div>
          ))}
        </div>

        {current && (
          <section className="fb-card fb-qeditor" aria-label="Edit question">
            <div className="fb-card-h">
              <h2>{current.id ? "Edit question" : "New question"}</h2>
              <button type="button" className="fb-icon-btn" aria-label="Close the editor" onClick={() => setEditing(null)}>
                <FiX />
              </button>
            </div>
            <div className="fb-card-b fb-stack" style={{ gap: 16 }}>
              <label className="fb-field" htmlFor="fb-q-text">
                Question
                <input id="fb-q-text" className="fb-input" maxLength={255} value={current.question_text} onChange={(e) => updateQuestion(current.key, { question_text: e.target.value })} placeholder="e.g. Is the problem solved?" />
              </label>

              <div className="fb-field">
                Question type
                <Segmented
                  label="Question type"
                  options={[
                    { value: "GENERAL", label: "General" },
                    { value: "SERVICE", label: "Service-based" },
                    { value: "DEPARTMENT", label: "Department" },
                  ]}
                  value={current.question_type}
                  onChange={(v) => updateQuestion(current.key, { question_type: v })}
                />
              </div>

              {current.question_type === "SERVICE" && (
                <ServicePicker picked={current.services} onChange={(services) => updateQuestion(current.key, { services })} />
              )}
              {current.question_type === "DEPARTMENT" && (
                <DepartmentPicker list={activeDepts} picked={current.departments} onChange={(departments) => updateQuestion(current.key, { departments })} />
              )}

              <div>
                <div className="fb-field" style={{ marginBottom: 6 }}>
                  Answers (2 to 10)
                </div>
                <div className="fb-answer-grid">
                  <span className="fb-head">Label</span>
                  <span className="fb-head">Bad?</span>
                  <span className="fb-head">Priority</span>
                  <span />
                  {current.options.map((o) => (
                    <AnswerRow key={o.key} o={o} onChange={(c) => updateOption(current.key, o.key, c)} onRemove={() => removeOption(current, o)} />
                  ))}
                </div>
                {current.options.length < 10 && (
                  <button
                    type="button"
                    className="fb-btn fb-btn-sm fb-btn-link"
                    style={{ marginTop: 8 }}
                    onClick={() => updateQuestion(current.key, { options: [...current.options, { key: newKey(), id: null, label: "", is_bad: false, suggested_priority: null, is_active: true }] })}
                  >
                    <FiPlus /> Add answer
                  </button>
                )}
              </div>

              <div className="fb-qsettings">
                <div className="fb-setting">
                  <span>
                    Required
                    <small>Off = the collector can skip it</small>
                  </span>
                  <Switch checked={current.is_required} onChange={(v) => updateQuestion(current.key, { is_required: v })} label="Required" />
                </div>
                <div className="fb-setting">
                  <span>
                    On the WhatsApp form
                    <small>Also asked on the customer's form</small>
                  </span>
                  <Switch checked={current.show_on_form} onChange={(v) => updateQuestion(current.key, { show_on_form: v })} label="On the customer's form" />
                </div>
                <div className="fb-setting">
                  <span>Active</span>
                  <Switch checked={current.is_active} onChange={(v) => updateQuestion(current.key, { is_active: v })} label="Active" />
                </div>
              </div>
              {!current.id && (
                <button
                  type="button"
                  className="fb-btn fb-btn-sm fb-btn-danger-outline"
                  onClick={() => {
                    setList((l) => l.filter((q) => q.key !== current.key));
                    setEditing(null);
                  }}
                >
                  Remove this new question
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

const deptIcon = (d) => (d.kind === OPERATIONS ? FiTool : d.with_invoices ? FiFileText : FiBriefcase);

/**
 * The Department tab's top: the departments that take feedback tickets - picked from the user
 * hierarchy (Admin › Departments) - and a filter for their questions. Adding or removing one is
 * saved at once. A removed department gets no new tickets; its old tickets and questions stay.
 * onChange(rows, message) saves the departments (PUT /departments).
 */
function DepartmentsBar({ setup, filter, onFilter, count, onChange }) {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  if (!setup) return <Loading />;
  const active = setup.departments.filter((d) => d.is_active);
  const used = new Set(active.map((d) => d.org_unit_id));
  const free = setup.org_units.filter((u) => !used.has(u.id));
  const rowOf = (d, patch = {}) => ({ kind: d.kind, org_unit_id: d.org_unit_id, is_active: d.is_active, with_invoices: d.with_invoices, ...patch });

  async function run(rows, message) {
    setBusy(true);
    await onChange(rows, message);
    setBusy(false);
  }
  async function add() {
    const unit = setup.org_units.find((u) => u.id === adding);
    if (!unit) return;
    const before = setup.departments.find((d) => d.org_unit_id === unit.id);
    await run([before ? rowOf(before, { is_active: true }) : { org_unit_id: unit.id, is_active: true, with_invoices: false }], `${unit.name} added. Now add its questions.`);
    setAdding("");
  }
  async function remove(d) {
    if (!window.confirm(`Remove ${d.name}? It gets no new tickets and its people lose Customer Feedback. Old tickets and questions stay.`)) return;
    if (filter === d.kind) onFilter("");
    await run([rowOf(d, { is_active: false })], `${d.name} removed.`);
  }

  return (
    <Card title="Departments" aside="From the user hierarchy · who gets feedback tickets" className="fb-dept-bar">
      <div className="fb-stack" style={{ gap: 14 }}>
        <div className="fb-dept-tags" role="group" aria-label="Show the questions of">
          <button type="button" className={`fb-dept-tag ${!filter ? "is-on" : ""}`} aria-pressed={!filter} onClick={() => onFilter("")}>
            <FiLayers aria-hidden="true" /> All departments
          </button>
          {active.map((d) => {
            const Icon = deptIcon(d);
            return (
              <span key={d.kind} className={`fb-dept-tag ${filter === d.kind ? "is-on" : ""}`}>
                <button type="button" className="fb-dept-tag-main" aria-pressed={filter === d.kind} onClick={() => onFilter(d.kind)} title={departmentHint(d)}>
                  <Icon aria-hidden="true" /> {d.name} <span className="fb-qtab-count">{count(d.kind)}</span>
                </button>
                {d.kind !== OPERATIONS && (
                  <label className="fb-dept-tag-inv" title="This department can pick the customer's invoices on a ticket">
                    <input type="checkbox" checked={d.with_invoices} disabled={busy} onChange={(e) => run([rowOf(d, { with_invoices: e.target.checked })], `${d.name}: invoices ${e.target.checked ? "on" : "off"}.`)} />
                    Invoices
                  </label>
                )}
                {d.kind !== OPERATIONS && (
                  <button type="button" className="fb-dept-tag-x" aria-label={`Remove ${d.name}`} title="Remove" disabled={busy} onClick={() => remove(d)}>
                    <FiX />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="fb-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select className="fb-select" style={{ maxWidth: 280 }} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Department to add">
            <option value="">Add a department…</option>
            {free.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button type="button" className="fb-btn" onClick={add} disabled={!adding || busy}>
            <FiPlus /> Add department
          </button>
          <span className="fb-small fb-muted">People in these departments get Customer Feedback next to Task Management and see only their department's tickets.</span>
        </div>
      </div>
    </Card>
  );
}

/**
 * The departments a Department question is asked for. On a call the collector picks the department
 * (next to General / Service-based / Both) and its questions are asked; never on the WhatsApp form.
 */
function DepartmentPicker({ list, picked, onChange }) {
  const toggle = (kind) => onChange(picked.includes(kind) ? picked.filter((x) => x !== kind) : [...picked, kind]);
  return (
    <div className="fb-field">
      <span>
        Asked for these departments <span className="fb-req">*</span>
      </span>
      {list.length ? (
        <div className="fb-dept-pick">
          {list.map((d) => {
            const on = picked.includes(d.kind);
            const Icon = deptIcon(d);
            return (
              <button key={d.kind} type="button" className={`fb-dept-opt ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => toggle(d.kind)}>
                <span className="fb-dept-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="fb-dept-text">
                  <b>{d.name}</b>
                  <small>{departmentHint(d)}</small>
                </span>
                <span className="fb-dept-check" aria-hidden="true">
                  {on && <FiCheck />}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <span className="fb-field-hint">Add a department first (Department tab, at the top).</span>
      )}
      <span className="fb-field-hint">Asked on the call when the collector picks this department. Not on the WhatsApp form.</span>
    </div>
  );
}

/** The services a Service-based question is asked for: a searchable list of checkboxes. */
function ServicePicker({ picked, onChange }) {
  const [q, setQ] = useState("");
  // Services saved earlier that are not in the booking list stay pickable.
  const all = [...SERVICES, ...picked.filter((x) => !SERVICES.includes(x))];
  const shown = all.filter((x) => x.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (x) => onChange(picked.includes(x) ? picked.filter((y) => y !== x) : [...picked, x]);
  return (
    <div className="fb-field">
      <span>
        Asked for these services <span className="fb-req">*</span> <span className="fb-muted">· {picked.length} picked</span>
      </span>
      <div className="fb-svclist">
        <label className="fb-svclist-search">
          <FiSearch aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" aria-label="Search services" />
        </label>
        <div className="fb-svclist-items">
          {shown.map((x) => (
            <label key={x} className={`fb-svc-opt ${picked.includes(x) ? "is-on" : ""}`}>
              <input type="checkbox" checked={picked.includes(x)} onChange={() => toggle(x)} />
              <span>{x}</span>
            </label>
          ))}
          {!shown.length && <div className="fb-small fb-muted" style={{ padding: 8 }}>No service matches.</div>}
        </div>
      </div>
    </div>
  );
}

function AnswerRow({ o, onChange, onRemove }) {
  return (
    <>
      <input
        className="fb-input"
        maxLength={60}
        value={o.label}
        disabled={!o.is_active}
        onChange={(e) => onChange({ label: e.target.value })}
        aria-label="Answer label"
        style={o.is_active ? undefined : { textDecoration: "line-through" }}
      />
      <Switch checked={o.is_bad} disabled={!o.is_active} onChange={(v) => onChange({ is_bad: v, suggested_priority: v ? o.suggested_priority || "MEDIUM" : null })} label={`${o.label || "Answer"} is a bad answer`} />
      <select className="fb-select" disabled={!o.is_bad || !o.is_active} value={o.is_bad ? o.suggested_priority || "MEDIUM" : ""} onChange={(e) => onChange({ suggested_priority: e.target.value })} aria-label="Priority it suggests">
        {!o.is_bad && <option value="">—</option>}
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY[p].label}
          </option>
        ))}
      </select>
      <button type="button" className="fb-btn fb-btn-sm" style={{ padding: 0, width: 34 }} onClick={onRemove} aria-label={o.id ? (o.is_active ? "Switch off this answer" : "Switch this answer back on") : "Remove this answer"} title={o.id ? (o.is_active ? "Switch off" : "Switch on") : "Remove"}>
        {o.id && !o.is_active ? <FiPlus /> : <FiMinus />}
      </button>
    </>
  );
}

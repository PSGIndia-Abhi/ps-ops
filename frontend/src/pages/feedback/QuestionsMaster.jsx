import { useCallback, useEffect, useState } from "react";
import { FiChevronDown, FiChevronUp, FiInfo, FiMinus, FiPlus, FiX } from "react-icons/fi";
import { PRIORITIES, PRIORITY, getQuestions, saveQuestions } from "./feedbackApi";
import { Card, Chip, ErrorBox, Loading, PageHead, Switch } from "./ui";

// Masters › Questions. The whole list is saved in one go (PUT /api/feedback/questions): array order
// is the display order, a row without an id is new, and nothing that was used is ever deleted -
// it is switched off instead.
let tempKey = 0;
const newKey = () => `new-${++tempKey}`;

function withKeys(questions) {
  return questions.map((q) => ({ ...q, key: `q-${q.id}`, options: q.options.map((o) => ({ ...o, key: `o-${o.id}` })) }));
}

function forApi(list) {
  return list.map((q) => ({
    id: q.id ?? null,
    question_text: q.question_text,
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const shown = showOff ? list : active;
  const current = list.find((q) => q.key === editing) || null;

  const updateQuestion = (key, changes) => setList((l) => l.map((q) => (q.key === key ? { ...q, ...changes } : q)));
  const updateOption = (qKey, oKey, changes) =>
    setList((l) => l.map((q) => (q.key === qKey ? { ...q, options: q.options.map((o) => (o.key === oKey ? { ...o, ...changes } : o)) } : q)));

  function move(key, by) {
    setList((l) => {
      const i = l.findIndex((q) => q.key === key);
      // move past hidden (switched off) rows when they aren't shown
      let j = i + by;
      while (!showOff && l[j] && !l[j].is_active) j += by;
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
        is_active: true,
        is_required: true,
        show_on_form: true,
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
      setNotice("Questions saved. New calls and forms use them from now on.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead
        crumb="Masters › Questions"
        title="Feedback questions"
        sub="Asked on every feedback call and on the customer's WhatsApp form."
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
            <button type="button" className="fb-btn fb-btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save questions"}
            </button>
          </>
        }
      />

      <div className="fb-alert fb-alert-info" style={{ marginBottom: 16 }}>
        <FiInfo aria-hidden="true" />
        <span>Changes apply to new calls and forms only. Feedback already given keeps its own wording. A question or answer is never deleted; it is switched off instead.</span>
      </div>
      {notice && (
        <div className="fb-alert fb-alert-ok" role="status" style={{ marginBottom: 16 }}>
          <span>{notice}</span>
        </div>
      )}
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

      <div className="fb-grid-side" style={{ gridTemplateColumns: current ? "minmax(0,1fr) 440px" : "minmax(0,1fr)" }}>
        <Card
          bodyClass="is-flush"
          title={`${active.length} active question${active.length === 1 ? "" : "s"}${offCount ? ` · ${offCount} switched off` : ""}`}
          aside={
            offCount > 0 && (
              <label className="fb-row" style={{ gap: 8 }}>
                <Switch checked={showOff} onChange={setShowOff} label="Show switched off" /> Show switched off
              </label>
            )
          }
        >
          {shown.map((q, n) => (
            <div key={q.key} className={`fb-qrow ${q.key === editing ? "is-editing" : ""} ${q.is_active ? "" : "is-off"}`}>
              <div className="fb-qrow-move">
                <button type="button" aria-label="Move up" disabled={n === 0} onClick={() => move(q.key, -1)}>
                  <FiChevronUp />
                </button>
                <span>{n + 1}</span>
                <button type="button" aria-label="Move down" disabled={n === shown.length - 1} onClick={() => move(q.key, 1)}>
                  <FiChevronDown />
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fb-strong" style={{ marginBottom: 6 }}>
                  {q.question_text || <span className="fb-muted">New question</span>}
                </div>
                <div className="fb-row" style={{ gap: 6 }}>
                  {q.options
                    .filter((o) => o.is_active)
                    .map((o) => (
                      <Chip key={o.key} tone={o.is_bad ? "danger" : "ok"}>
                        {o.label || "…"}
                        {o.is_bad ? ` · ${PRIORITY[o.suggested_priority]?.label || "?"}` : ""}
                      </Chip>
                    ))}
                </div>
              </div>
              <span className="fb-small fb-muted" style={{ textAlign: "right" }}>
                {q.is_active ? [q.is_required ? "Required" : "Optional", q.show_on_form ? "On form" : "Call only"].join(" · ") : "Switched off"}
              </span>
              <button type="button" className={`fb-btn fb-btn-sm ${q.key === editing ? "fb-btn-dark" : ""}`} onClick={() => setEditing(q.key === editing ? null : q.key)}>
                {q.key === editing ? "Editing" : "Edit"}
              </button>
            </div>
          ))}
          <div className="fb-legend" style={{ padding: "12px 16px", flexWrap: "wrap" }}>
            <span>
              <Chip tone="ok">Yes</Chip> good answer
            </span>
            <span>
              <Chip tone="danger">No · High</Chip> bad answer and the priority it suggests
            </span>
            <span>Every call and form also has the optional "Other feedback" box (Settings).</span>
          </div>
        </Card>

        {current && (
          <section className="fb-card" style={{ border: "2px solid #0284c7" }} aria-label="Edit question">
            <div className="fb-card-h">
              <h2>{current.id ? `Edit question ${shown.indexOf(current) + 1 || ""}`.trim() : "New question"}</h2>
              <button type="button" className="fb-icon-btn" aria-label="Close the editor" onClick={() => setEditing(null)}>
                <FiX />
              </button>
            </div>
            <div className="fb-card-b fb-stack" style={{ gap: 14 }}>
              <label className="fb-field" htmlFor="fb-q-text">
                Question
                <input id="fb-q-text" className="fb-input" maxLength={255} value={current.question_text} onChange={(e) => updateQuestion(current.key, { question_text: e.target.value })} placeholder="e.g. Is the problem solved?" />
              </label>

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
                    <AnswerRow key={o.key} q={current} o={o} onChange={(c) => updateOption(current.key, o.key, c)} onRemove={() => removeOption(current, o)} />
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

              <div className="fb-stack" style={{ gap: 12, borderTop: "1px solid #f1f2f4", paddingTop: 12 }}>
                <div className="fb-setting">
                  Answer required
                  <Switch checked={current.is_required} onChange={(v) => updateQuestion(current.key, { is_required: v })} label="Answer required" />
                </div>
                <div className="fb-setting">
                  Show on the customer's WhatsApp form
                  <Switch checked={current.show_on_form} onChange={(v) => updateQuestion(current.key, { show_on_form: v })} label="Show on the customer's form" />
                </div>
                <div className="fb-setting">
                  Active
                  <Switch checked={current.is_active} onChange={(v) => updateQuestion(current.key, { is_active: v })} label="Active" />
                </div>
                {!current.id && (
                  <button
                    type="button"
                    className="fb-btn fb-btn-sm"
                    onClick={() => {
                      setList((l) => l.filter((q) => q.key !== current.key));
                      setEditing(null);
                    }}
                  >
                    Remove this new question
                  </button>
                )}
              </div>

              <div style={{ background: "#f6f7fb", borderRadius: 10, padding: 12 }}>
                <div className="fb-small fb-muted" style={{ marginBottom: 6, fontWeight: 600 }}>
                  Preview on a call
                </div>
                <div className="fb-strong" style={{ marginBottom: 8 }}>
                  {current.question_text || "Your question"}
                </div>
                <div className="fb-opts">
                  {current.options
                    .filter((o) => o.is_active)
                    .map((o) => (
                      <span key={o.key} className="fb-opt" style={{ minWidth: 70, textAlign: "center" }}>
                        {o.label || "…"}
                      </span>
                    ))}
                </div>
              </div>
              <div className="fb-small fb-muted">Press "Save questions" at the top to keep your changes.</div>
            </div>
          </section>
        )}
      </div>
    </>
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

// Reminders: the lead work coming up for the signed-in person - meetings, follow-ups and the
// personal reminders they set themselves - with new / edit / done / delete for the personal
// ones. Lead work only; Task Management's own tasks stay in Task Management. A list to see and
// manage: the alarm itself rings on the person's phone (the Android app), not in the browser.

import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FiBell, FiBriefcase, FiCheck, FiClock, FiEdit2, FiPhoneCall, FiPlus, FiTrash2 } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { useLeadData } from "./leadsApi";
import {
  clashesAt,
  completeReminder,
  createReminder,
  deleteReminder,
  kindLabel,
  LEAD_MINUTES,
  myReminders,
  showReminderCard,
  todayKey,
  updateReminder,
} from "./remindersApi";
import { useToast } from "./hooks";
import { Alert, Badge, Button, Card, Empty, Field, Note, SkeletonRows } from "./ui";
import { useViewer } from "./viewer";

const KIND = {
  meeting: { icon: <FiBriefcase />, tone: "violet" },
  followup: { icon: <FiPhoneCall />, tone: "warn" },
  personal: { icon: <FiBell />, tone: "success" },
};

const clock = (date, time) => new Date(`${date}T${time}`).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
function dayTitle(date) {
  const today = todayKey();
  const next = new Date(`${today}T00:00`);
  next.setDate(next.getDate() + 1);
  const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  return new Date(`${date}T00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

/** In one hour, rounded to the next 5 minutes - a sensible first time for a new reminder. */
function soon() {
  const d = new Date(Date.now() + 60 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/**
 * The popup that sets a personal reminder (or edits `item`). `lead` ties a new one to a lead,
 * so the alarm opens that lead. Warns when something else already rings at the chosen minute.
 */
export function ReminderPopup({ item, lead, onClose, onSaved }) {
  const toast = useToast();
  const { me } = useLeadData();
  const [first] = useState(() => (item ? { date: item.date, time: item.time || "09:00" } : soon()));
  const [title, setTitle] = useState(item?.title || "");
  const [note, setNote] = useState(item?.note || "");
  const [date, setDate] = useState(first.date);
  const [time, setTime] = useState(first.time);
  const [busy, setBusy] = useState(false);
  const [others, setOthers] = useState([]); // my other reminders, for the same-time warning

  useEffect(() => {
    if (!me?.id) return undefined;
    let alive = true;
    myReminders(me.id)
      .then((list) => alive && setOthers(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [me?.id]);

  const clash = clashesAt(others, date, time, item?.key);

  async function save(close) {
    if (busy) return;
    if (title.trim().length < 2) return toast("Write what to remind you about.", true);
    if (!date || !time) return toast("Choose the date and time.", true);
    if (new Date(`${date}T${time}`).getTime() <= Date.now()) return toast("Choose a time in the future.", true);
    setBusy(true);
    try {
      if (item) {
        await updateReminder(item, { title, note, date, time });
        toast("Reminder updated");
      } else {
        await createReminder(me.id, { title, note, date, time, leadId: lead?.id });
        showReminderCard({ kind: "personal", title: "Reminder set", text: title.trim(), sub: `${dayTitle(date)}, ${clock(date, time)}`, leadId: lead?.id || null });
      }
      onSaved?.();
      close();
    } catch (err) {
      toast(err.message || "Could not save the reminder.", true);
      setBusy(false);
    }
  }

  return (
    <Alert
      icon={<FiBell />}
      title={item ? "Edit Reminder" : "Set a Reminder"}
      onClose={onClose}
      actions={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiCheck />} onClick={() => save(close)}>
            {item ? "Save" : "Set Reminder"}
          </Button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 14, textAlign: "left" }}>
        {!!lead && <p className="muted">About {lead.company}</p>}
        <Field label="Remind me to" required>
          <input className="lm-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Call Ravi back about the quotation" autoFocus />
        </Field>
        <div className="lm-form">
          <Field label="Date" required>
            <input className="lm-input" type="date" value={date} min={todayKey()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time" required>
            <input className="lm-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Note">
          <textarea className="lm-textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Anything to remember when your phone rings" />
        </Field>
        {clash.length > 0 && (
          <Note tone="warn">
            You already have {clash.length === 1 ? `"${clash[0].title}" (${kindLabel(clash[0].kind).toLowerCase()})` : `${clash.length} things`} at this time. You can still save.
          </Note>
        )}
      </div>
    </Alert>
  );
}

export default function Reminders() {
  const { persona } = useViewer();
  const { me } = useLeadData();
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState({ items: null, error: "" });
  const [dialog, setDialog] = useState(null); // "new" | { edit: item } | { remove: item }
  const [busyKey, setBusyKey] = useState(null);

  const load = useCallback(() => {
    if (!me?.id) return;
    myReminders(me.id)
      .then((items) => setState({ items, error: "" }))
      .catch((err) => setState({ items: [], error: err.message || "Could not load your reminders." }));
  }, [me?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (persona === "lead_provider") return <Navigate to={LEADS_HOME} replace />;

  async function act(item, work, done) {
    setBusyKey(item.key);
    try {
      await work();
      toast(done);
      setDialog(null);
      load();
    } catch (err) {
      toast(err.message || "Could not update the reminder.", true);
    } finally {
      setBusyKey(null);
    }
  }


  const items = state.items || [];
  const days = [...new Set(items.map((i) => i.date))];
  const now = new Date();

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Reminders</h1>
          <p>
            Your meetings, follow-ups and reminders on leads. Your phone rings {LEAD_MINUTES} minutes before a meeting or follow-up, and at the time you choose for your own reminders.
          </p>
        </div>
        <div className="lm-head-actions">
          <Button icon={<FiPlus />} onClick={() => setDialog("new")}>
            New Reminder
          </Button>
        </div>
      </div>

      <Card flush index={1}>
        <div style={{ height: 6 }} />
        {!state.items ? (
          <SkeletonRows rows={5} />
        ) : state.error ? (
          <Empty title="Could not load your reminders" text={state.error} icon={<FiBell />} />
        ) : items.length === 0 ? (
          <Empty title="Nothing coming up" text="Your lead meetings and follow-ups appear here, with the reminders you set yourself." icon={<FiBell />} />
        ) : (
          <div className="lm-reminders">
            {days.map((day) => (
              <section key={day}>
                <h4>{dayTitle(day)}</h4>
                {items
                  .filter((i) => i.date === day)
                  .map((item, n) => {
                    const kind = KIND[item.kind];
                    const personal = item.kind === "personal";
                    return (
                      <div key={item.key} className="lm-reminder" style={{ "--i": n }}>
                        <div className="lm-reminder-time">
                          {item.time ? clock(item.date, item.time) : "Any time"}
                          {item.at < now && <small>Overdue</small>}
                        </div>
                        <span className={`lm-event-dot tone-${kind.tone}`}>{kind.icon}</span>
                        <div className="lm-reminder-main">
                          <strong>{item.title}</strong>
                          <small>
                            {kindLabel(item.kind)}
                            {item.detail && !personal ? ` · ${item.detail}` : ""}
                            {item.fromSomeoneElse && item.byName ? ` · from ${item.byName}` : ""}
                          </small>
                          {personal && !!item.note && <small>{item.note}</small>}
                        </div>
                        <Badge tone={kind.tone}>{kindLabel(item.kind)}</Badge>
                        <span className="lm-reminder-actions">
                          {!!item.leadId && (
                            <Button size="sm" variant="ghost" onClick={() => navigate(`${LEADS_HOME}/${item.leadId}`)}>
                              Open lead
                            </Button>
                          )}
                          {personal && (
                            <>
                              <Button size="sm" variant="ghost" icon={<FiCheck />} busy={busyKey === item.key} onClick={() => act(item, () => completeReminder(item.taskId), "Reminder marked done")}>
                                Done
                              </Button>
                              <Button size="sm" variant="ghost" icon={<FiEdit2 />} onClick={() => setDialog({ edit: item })} aria-label="Edit reminder" />
                              <Button size="sm" variant="ghost" icon={<FiTrash2 />} onClick={() => setDialog({ remove: item })} aria-label="Delete reminder" />
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
              </section>
            ))}
          </div>
        )}
      </Card>

      {dialog === "new" && <ReminderPopup onClose={() => setDialog(null)} onSaved={load} />}
      {dialog?.edit && <ReminderPopup item={dialog.edit} onClose={() => setDialog(null)} onSaved={load} />}
      {dialog?.remove && (
        <Alert
          icon={<FiClock />}
          title="Delete this reminder?"
          onClose={() => setDialog(null)}
          actions={(close) => (
            <>
              <Button variant="ghost" onClick={close}>
                Keep
              </Button>
              <Button variant="danger" icon={<FiTrash2 />} busy={busyKey === dialog.remove.key} onClick={() => act(dialog.remove, () => deleteReminder(dialog.remove.taskId), "Reminder deleted")}>
                Delete
              </Button>
            </>
          )}
        >
          <p>&quot;{dialog.remove.title}&quot; will be removed, and your phone will no longer ring for it.</p>
        </Alert>
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiPhoneOff, FiSend, FiX } from "react-icons/fi";
import { cancelNumberRequest, formatDateTime, formatDay, listNumberRequests, resolveNumberRequest, sendNumberRequest } from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import { Card, CallStatusChip, Chip, Empty, ErrorBox, Loading, Modal, PageHead, Segmented, Toast } from "./ui";

// Feedback Desk › Requests: a call reached a wrong number, so its collector asks for the right one.
// The service coordinator (or a desk manager) finds it and saves it on the site's contacts; the call
// goes back on the collector's list to call again. A collector sees the requests they sent.

const REQUEST_STATUS = {
  OPEN: { label: "Waiting", tone: "warn" },
  DONE: { label: "Number added", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

const wrongText = (w) => [w?.name, w?.phone].filter(Boolean).join(" · ") || "Not recorded";

/** The coordinator saves the right number: a new contact, or the wrong contact corrected. */
function ResolveModal({ request, onSaved, onClose }) {
  const [name, setName] = useState(request.wrong.name || "");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      onSaved(await resolveNumberRequest(request.id, { name: name.trim(), phone: phone.trim(), note: note.trim() || null }));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Right number · ${request.site.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="fb-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="fb-btn fb-btn-primary" onClick={save} disabled={saving || !name.trim() || !phone.trim()}>
            {saving ? "Saving…" : "Save and send back"}
          </button>
        </>
      }
    >
      <div className="fb-stack" style={{ gap: 14 }}>
        <ErrorBox error={error} />
        <div className="fb-nr-wrong">
          <FiPhoneOff aria-hidden="true" />
          <span>
            Wrong number: <b>{wrongText(request.wrong)}</b>
            <small>
              {request.customer.name} · asked by {request.requested_by?.name} {formatDateTime(request.requested_at)}
            </small>
            {request.note && <small>“{request.note}”</small>}
          </span>
        </div>
        {request.site_contacts?.length > 0 && (
          <div className="fb-field">
            <span>The site&apos;s saved contacts</span>
            <div className="fb-mini-chips">
              {request.site_contacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="fb-mini-chip"
                  title="Use this contact"
                  onClick={() => {
                    setName(c.name);
                    setPhone(String(c.phone || "").replace(/\D/g, "").slice(-10));
                  }}
                >
                  {c.name} · {c.phone}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="fb-sched-grid">
          <label className="fb-field" htmlFor="fb-nr-name">
            <span>
              Name <span className="fb-req">*</span>
            </span>
            <input id="fb-nr-name" className="fb-input" maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Person at the right number" />
          </label>
          <label className="fb-field" htmlFor="fb-nr-phone">
            <span>
              Right number <span className="fb-req">*</span>
            </span>
            <input id="fb-nr-phone" className="fb-input" inputMode="tel" maxLength={14} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
          </label>
        </div>
        <span className="fb-small fb-muted">It is added to the site&apos;s contacts under the old number, marked New for the collector.</span>
        <label className="fb-field" htmlFor="fb-nr-note">
          Note for the collector (optional)
          <input id="fb-nr-note" className="fb-input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ask for the facility manager" />
        </label>
      </div>
    </Modal>
  );
}

export default function NumberRequests() {
  const { reloadBadges } = useFeedbackAccess();
  const [status, setStatus] = useState("OPEN");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearNotice = useCallback(() => setNotice(""), []);
  const [resolving, setResolving] = useState(null);

  const load = useCallback(() => {
    listNumberRequests(status === "ALL" ? "" : status)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [status]);
  useEffect(load, [load]);

  async function cancel(q) {
    setError("");
    try {
      await cancelNumberRequest(q.id);
      setNotice("Request cancelled.");
      load();
      reloadBadges?.();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data) return error ? <ErrorBox error={error} onRetry={load} /> : <Loading />;
  const handler = data.can_resolve;

  return (
    <>
      <PageHead
        title="Requests"
        sub={
          handler
            ? "Calls that reached a wrong number. Find the right number and save it - the call goes back to the collector."
            : "Your requests to the service coordinator for the right number."
        }
      />
      <Toast notice={notice ? { text: notice } : null} onClose={clearNotice} />
      <ErrorBox error={error} />
      <Card bodyClass="is-flush">
        <div className="fb-filters">
          <Segmented
            label="Status"
            options={[
              { value: "OPEN", label: `Waiting (${data.counts.OPEN})` },
              { value: "DONE", label: `Number added (${data.counts.DONE})` },
              { value: "ALL", label: `All (${data.counts.ALL})` },
            ]}
            value={status}
            onChange={setStatus}
          />
        </div>
        {!data.requests.length ? (
          <Empty
            title={status === "OPEN" ? "No requests waiting" : "No requests"}
            text={handler ? "When a collector reaches a wrong number and sends a request, it shows here." : "After a wrong number, use Send request on the call."}
          />
        ) : (
          <div className="fb-table-wrap">
            <table className="fb-table">
              <thead>
                <tr>
                  <th>Customer · Site</th>
                  <th>Wrong number</th>
                  <th>Asked by</th>
                  <th>Status</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {data.requests.map((q) => (
                  <tr key={q.id}>
                    <td>
                      {/* Customer first (as on the Dashboard), the site under it. */}
                      <div className="fb-strong">{q.customer.name}</div>
                      <div className="fb-small fb-muted">
                        {q.site.name}
                        {q.site.city ? ` · ${q.site.city}` : ""}
                        {q.due_date ? ` · call due ${formatDay(q.due_date)}` : ""}
                      </div>
                    </td>
                    <td className="fb-small">
                      <div>{wrongText(q.wrong)}</div>
                      {q.note && <div className="fb-muted">“{q.note}”</div>}
                    </td>
                    <td className="fb-small" style={{ whiteSpace: "nowrap" }}>
                      <div>{q.requested_by?.name}</div>
                      <div className="fb-muted">{formatDateTime(q.requested_at)}</div>
                    </td>
                    <td className="fb-small">
                      <Chip tone={REQUEST_STATUS[q.status].tone}>{REQUEST_STATUS[q.status].label}</Chip>
                      {q.right && (
                        <div style={{ marginTop: 4 }}>
                          <b>{q.right.name}</b> · {q.right.phone}
                          <div className="fb-muted">
                            {q.resolved_by?.name} · {formatDateTime(q.resolved_at)}
                          </div>
                          {q.resolve_note && <div className="fb-muted">“{q.resolve_note}”</div>}
                        </div>
                      )}
                      {q.status !== "OPEN" && !handler && q.call_status && (
                        <div style={{ marginTop: 4 }}>
                          Call: <CallStatusChip status={q.call_status} />
                        </div>
                      )}
                    </td>
                    <td className="fb-right" style={{ whiteSpace: "nowrap" }}>
                      {q.status === "OPEN" && handler && (
                        <button type="button" className="fb-btn fb-btn-sm fb-btn-primary" onClick={() => setResolving(q)}>
                          Add the right number
                        </button>
                      )}
                      {q.status === "OPEN" && !handler && (
                        <button type="button" className="fb-btn fb-btn-sm" onClick={() => cancel(q)}>
                          <FiX aria-hidden="true" /> Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {resolving && (
        <ResolveModal
          request={resolving}
          onClose={() => setResolving(null)}
          onSaved={(d) => {
            setResolving(null);
            setData(d);
            setNotice("Right number saved. The call is back on the collector's list.");
            load();
            reloadBadges?.();
          }}
        />
      )}
    </>
  );
}

/**
 * On the call page, under the call result: when Wrong number is picked, ask the service coordinator
 * for the right number (saving the result first if needed); then the request's state - waiting, or
 * the number they added. Answering the call later cancels a waiting request (the number works).
 * wrongPicked = Wrong number is the result picked; unsaved = that result is not saved yet;
 * saveResult() saves it (true when saved); lastCallAt = when the last call was made.
 */
export function WrongNumberRequest({ call, canWork, wrongPicked, unsaved, saveResult, lastCallAt, onChanged }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requests = call.number_requests || [];
  const open = requests.find((q) => q.status === "OPEN");
  const lastDone = requests.find((q) => q.status === "DONE");
  // The right number came in and hasn't been called yet.
  const freshNumber = !open && lastDone && (!lastCallAt || new Date(lastCallAt) < new Date(lastDone.resolved_at));
  // Saved as wrong number and still waiting, or Wrong number just picked (saved with the request).
  const canSend = canWork && wrongPicked && !open && (call.status === "WRONG_NUMBER" || unsaved);
  if (!open && !canSend && !freshNumber) return null;

  async function send() {
    setSaving(true);
    setError("");
    try {
      if (unsaved && !(await saveResult())) return;
      await sendNumberRequest(call.id, { note: note.trim() || null });
      setNote("");
      onChanged("Wrong number saved and the request sent to the service coordinator.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  async function cancel() {
    setSaving(true);
    setError("");
    try {
      await cancelNumberRequest(open.id);
      onChanged("Request cancelled.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fb-nr-inline">
      <ErrorBox error={error} />
      {open ? (
        <div className="fb-nr-state is-waiting">
          <span>
            <b>Request sent - waiting for the service coordinator</b> for the right number (wrong: {wrongText(open.wrong)}, {formatDateTime(open.requested_at)}).
          </span>
          {canWork && (
            <button type="button" className="fb-btn fb-btn-sm" onClick={cancel} disabled={saving}>
              Cancel request
            </button>
          )}
        </div>
      ) : canSend ? (
        <div className="fb-nr-ask">
          <span className="fb-small">Ask the service coordinator for the right number. The call comes back to you when they add it.</span>
          <div className="fb-row" style={{ gap: 8 }}>
            <input className="fb-input" style={{ flex: "1 1 220px" }} maxLength={500} placeholder="Note (optional), e.g. The number belongs to someone else" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note for the coordinator" />
            <button type="button" className="fb-btn fb-btn-primary" onClick={send} disabled={saving}>
              <FiSend aria-hidden="true" /> {saving ? "Sending…" : unsaved ? "Save & send request" : "Send request"}
            </button>
          </div>
        </div>
      ) : null}
      {freshNumber && (
        <div className="fb-nr-state is-done">
          <FiCheck aria-hidden="true" />
          <span>
            Right number from {lastDone.resolved_by?.name || "the coordinator"}: <b>{lastDone.right?.name}</b> · {lastDone.right?.phone}
            {lastDone.resolve_note ? ` · “${lastDone.resolve_note}”` : ""}. It is added above, marked New - call it now.
          </span>
        </div>
      )}
    </div>
  );
}

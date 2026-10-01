import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowRight, FiCalendar, FiCheck, FiCheckCircle, FiInbox, FiSend, FiX } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { fmtDateTime, timeAgo, todayStr } from "./format";
import { approveRequest, listMyRequests, rejectRequest, useIncomingRequests, withdrawRequest } from "./tasksApi";
import { useToast } from "./toastContext";
import { Avatar, EmptyState, Modal, PriorityBadge, Skeleton } from "./ui";

const REQ_STATUS = {
  PENDING: { label: "Waiting", color: "#b45309", soft: "#fff3dc" },
  APPROVED: { label: "Approved", color: "#15803d", soft: "#e2f7e9" },
  REJECTED: { label: "Rejected", color: "#b91c1c", soft: "#fdeaea" },
  WITHDRAWN: { label: "Withdrawn", color: "#475569", soft: "#eef1f5" },
};

function ReqBadge({ status }) {
  const s = REQ_STATUS[status] || REQ_STATUS.PENDING;
  return (
    <span className="tp-badge" style={{ color: s.color, background: s.soft }}>
      {s.label}
    </span>
  );
}

function RejectNote({ request, onClose, onReject }) {
  const [note, setNote] = useState("");
  return (
    <Modal title="Reject reschedule request" onClose={onClose} size="sm">
      {(close) => (
        <div className="tp-form">
          <p className="tp-desc muted">
            {request.requested_by_name} asked to move <strong>{request.task_title}</strong> to {fmtDateTime(request.to_due_date, request.to_due_time)}.
          </p>
          <label className="tp-field">
            <span>
              Note to {request.requested_by_name} <em>(Optional)</em>
            </span>
            <input className="tp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The customer needs it by Friday" autoFocus />
          </label>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Go back
            </button>
            <button
              type="button"
              className="tp-btn danger"
              onClick={() => {
                onReject(note.trim() || undefined);
                close();
              }}
            >
              Reject request
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** One request row: which task, who asked, the date move, the reason. */
function RequestRow({ r, index, children, showRequester }) {
  return (
    <div className="tp-req-row" style={{ "--i": Math.min(index, 10) }}>
      <div className="tp-req-main">
        <Link to={`${TASKPRO_HOME}/tasks/${r.task_id}`} className="tp-req-task">
          {r.task_title} <FiArrowRight />
        </Link>
        <div className="tp-req-move">
          <span>{fmtDateTime(r.from_due_date, r.from_due_time)}</span>
          <FiArrowRight />
          <strong>{fmtDateTime(r.to_due_date, r.to_due_time)}</strong>
          {r.task_priority && <PriorityBadge priority={r.task_priority} />}
        </div>
        {r.reason && <p className="tp-req-reason">“{r.reason}”</p>}
        {r.decision_note && (
          <p className="tp-req-reason">
            {r.decided_by_name ? `${r.decided_by_name}: ` : ""}“{r.decision_note}”
          </p>
        )}
      </div>
      <div className="tp-req-who">
        {showRequester ? (
          <>
            <Avatar name={r.requested_by_name} size={30} />
            <span>
              <strong>{r.requested_by_name}</strong>
              <small>asked {timeAgo(r.created_at)}</small>
            </span>
          </>
        ) : (
          <span>
            <small>Asked {timeAgo(r.created_at)}</small>
            {r.decided_by_name && r.status !== "PENDING" && <small>by {r.decided_by_name}</small>}
          </span>
        )}
      </div>
      <div className="tp-req-side">{children}</div>
    </div>
  );
}

/**
 * Reschedule requests. "Waiting for me": requests on tasks I created or on
 * my team's tasks, to approve or reject. "My requests": ones I sent.
 */
export default function RescheduleRequests() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "mine" ? "mine" : "incoming";
  const { incoming, ready: incomingReady } = useIncomingRequests();
  const [mine, setMine] = useState([]);
  const [mineReady, setMineReady] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  const loadMine = useCallback(async () => {
    try {
      setMine(await listMyRequests());
    } catch {
      setMine([]);
    } finally {
      setMineReady(true);
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  async function act(r, fn, success) {
    setBusyId(r.id);
    try {
      await fn();
      toast.push({ type: "success", ...success });
    } catch (err) {
      toast.push({ type: "error", title: "That didn't go through", text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  const waiting = mine.filter((r) => r.status === "PENDING").length;

  return (
    <>
      <div className="tp-page-head">
        <div>
          <h1>Reschedule requests</h1>
          <p>Ask for a new due date on a task someone gave you, or decide on requests from your team.</p>
        </div>
      </div>

      <div className="tp-chips" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={tab === "incoming"} className={`tp-chip ${tab === "incoming" ? "on" : ""}`} onClick={() => setParams({}, { replace: true })}>
          <FiInbox /> Waiting for me <span>{incoming.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "mine"} className={`tp-chip ${tab === "mine" ? "on" : ""}`} onClick={() => setParams({ tab: "mine" }, { replace: true })}>
          <FiSend /> My requests <span>{waiting}</span>
        </button>
      </div>

      {tab === "incoming" && (
        <div className="tp-list">
          {!incomingReady && [0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={14} />)}
          {incomingReady && incoming.length === 0 && <EmptyState icon={FiCheckCircle} title="Nothing waiting for you" text="When someone asks to move a task you gave them, it shows up here." />}
          {incomingReady &&
            incoming.map((r, i) => (
              <RequestRow key={r.id} r={r} index={i} showRequester>
                <button type="button" className="tp-btn ghost" disabled={busyId === r.id} onClick={() => setRejecting(r)}>
                  <FiX /> Reject
                </button>
                <button
                  type="button"
                  className="tp-btn success"
                  disabled={busyId === r.id || r.to_due_date < todayStr()}
                  title={r.to_due_date < todayStr() ? "The requested date has passed — reject it, or open the task and reschedule it" : undefined}
                  onClick={() => act(r, () => approveRequest(r.id), { title: "Request approved", text: `${r.task_title} is now due ${fmtDateTime(r.to_due_date, r.to_due_time)}` })}
                >
                  <FiCheck /> Approve
                </button>
              </RequestRow>
            ))}
        </div>
      )}

      {tab === "mine" && (
        <div className="tp-list">
          {!mineReady && [0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={14} />)}
          {mineReady && mine.length === 0 && (
            <EmptyState icon={FiCalendar} title="You haven't asked for any reschedules" text="Open a task someone gave you and use “Request reschedule” to ask for a new due date." />
          )}
          {mineReady &&
            mine.map((r, i) => (
              <RequestRow key={r.id} r={r} index={i}>
                <ReqBadge status={r.status} />
                {r.status === "PENDING" && (
                  <button
                    type="button"
                    className="tp-btn ghost"
                    disabled={busyId === r.id}
                    onClick={() => act(r, async () => {
                      await withdrawRequest(r.id);
                      await loadMine();
                    }, { title: "Request withdrawn" })}
                  >
                    Withdraw
                  </button>
                )}
              </RequestRow>
            ))}
        </div>
      )}

      {rejecting && (
        <RejectNote
          request={rejecting}
          onClose={() => setRejecting(null)}
          onReject={(note) => act(rejecting, () => rejectRequest(rejecting.id, note), { title: "Request rejected" })}
        />
      )}
    </>
  );
}

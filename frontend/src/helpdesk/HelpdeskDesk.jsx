// Helpdesk desk - Task Management > Helpdesk (/taskpro/helpdesk[/:id]).
// For the technical team (Technical Lead / Team, both equal): the ticket queue on the left,
// the selected ticket on the right - pick up, assign, priority, status, reply, internal notes.
// On phones the list and the ticket are separate screens.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FiAlertTriangle, FiArrowLeft, FiCheckCircle, FiClock, FiGlobe, FiInbox, FiLayers, FiMessageCircle, FiMonitor, FiSearch, FiSmartphone, FiUser, FiUserCheck, FiXCircle } from "react-icons/fi";
import * as api from "./helpdeskApi";
import { Composer, PriorityChip, Spinner, StatusChip, Thread } from "./HelpdeskParts";
import { clock, timeAgo, useInterval } from "./helpdeskHooks";
import "./helpdesk.css";
import "./helpdeskDesk.css";

const BASE = "/taskpro/helpdesk";
const SCOPES = [
  { key: "unassigned", label: "Unassigned", count: "unassigned" },
  { key: "mine", label: "Mine", count: "mine" },
  { key: "open", label: "All open", count: "open" },
  // Resolved (waiting for the user to confirm) and closed.
  { key: "closed", label: "Closed" },
];
const STATUS_OPTIONS = [
  ["OPEN", "Open"],
  ["IN_PROGRESS", "In progress"],
  ["WAITING_USER", "Waiting on user"],
  ["RESOLVED", "Resolved"],
  ["CLOSED", "Closed"],
];
const PRIORITY_OPTIONS = [
  ["LOW", "Low"],
  ["NORMAL", "Normal"],
  ["HIGH", "High"],
  ["URGENT", "Urgent"],
];
const ACTIVE = ["OPEN", "IN_PROGRESS", "WAITING_USER"];

const changed = () => window.dispatchEvent(new Event("helpdesk:changed"));

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function HelpdeskDesk() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") || "open";
  const priority = params.get("priority") || "";
  const [q, setQ] = useState(params.get("q") || "");
  const query = useDebounced(q.trim());

  const [summary, setSummary] = useState(null);
  const [denied, setDenied] = useState(false);
  const [agents, setAgents] = useState([]);
  const [list, setList] = useState({ loading: true, error: "", tickets: [], page: 1, hasMore: false });

  const loadSummary = useCallback(() => {
    api
      .getSummary()
      .then((s) => {
        setSummary(s);
        setDenied(!s.isAgent);
      })
      .catch(() => setSummary(null));
  }, []);

  const loadList = useCallback(
    async (page = 1) => {
      try {
        const res = await api.listTickets({ scope, q: query, priority, page });
        setList((s) => ({
          loading: false,
          error: "",
          tickets: page === 1 ? res.tickets : [...s.tickets, ...res.tickets],
          page: res.page,
          hasMore: res.hasMore,
        }));
      } catch (err) {
        setList((s) => ({ ...s, loading: false, error: err.message }));
      }
    },
    [scope, query, priority]
  );

  useEffect(() => {
    loadSummary();
    api.listAgents().then((r) => setAgents(r.agents)).catch(() => {});
  }, [loadSummary]);
  useEffect(() => {
    loadList(1);
  }, [loadList]);
  useInterval(() => {
    loadSummary();
    loadList(1);
  }, 30 * 1000);

  const refreshAll = useCallback(() => {
    loadSummary();
    loadList(1);
    changed();
  }, [loadSummary, loadList]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const keep = params.toString() ? `?${params}` : "";
  const openTicket = (ticketId) => navigate(`${BASE}/${ticketId}${keep}`);

  if (denied) {
    return (
      <div className="hd-desk">
        <div className="hd-desk-denied">
          <FiXCircle />
          <strong>Helpdesk desk is for the technical team</strong>
          <span>Need help? Use the Help button at the bottom-right of the screen.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`hd-desk ${id ? "has-ticket" : ""}`}>
      <div className="hd-desk-head">
        <div>
          <h1>Helpdesk</h1>
          <p>Support tickets raised from the web and the app</p>
        </div>
        {summary && (
          <div className="hd-desk-stats">
            <Stat icon={FiInbox} tone="amber" label="Unassigned" hint="Waiting to be picked up" value={summary.unassigned} alert={summary.unassigned > 0} active={scope === "unassigned"} onClick={() => setParam("scope", "unassigned")} />
            <Stat icon={FiMessageCircle} tone="rose" label="Needs reply" hint="User is waiting on us" value={summary.needsReply} alert={summary.needsReply > 0} onClick={() => setParam("scope", "")} />
            <Stat icon={FiUserCheck} tone="blue" label="Mine" hint="Assigned to you" value={summary.mine} active={scope === "mine"} onClick={() => setParam("scope", "mine")} />
            <Stat icon={FiLayers} tone="violet" label="All open" hint="Across the team" value={summary.open} active={scope === "open"} onClick={() => setParam("scope", "")} />
          </div>
        )}
      </div>

      <div className="hd-desk-grid">
        <aside className="hd-queue">
          <div className="hd-queue-tabs" role="tablist">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={scope === s.key}
                className={scope === s.key ? "is-on" : ""}
                onClick={() => setParam("scope", s.key === "open" ? "" : s.key)}
              >
                {s.label}
                {s.count && summary?.[s.count] > 0 && <span className="hd-count">{summary[s.count]}</span>}
              </button>
            ))}
          </div>
          <div className="hd-queue-filters">
            <label className="hd-search">
              <FiSearch />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="HD-00042, subject or name" aria-label="Search tickets" />
            </label>
            <select value={priority} onChange={(e) => setParam("priority", e.target.value)} aria-label="Priority">
              <option value="">Any priority</option>
              {PRIORITY_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div className="hd-queue-list">
            {list.loading ? (
              <Spinner label="Loading tickets…" />
            ) : list.error ? (
              <div className="hd-center">
                <div className="hd-error">{list.error}</div>
                <button type="button" className="hd-btn hd-btn--ghost" onClick={() => loadList(1)}>Try again</button>
              </div>
            ) : list.tickets.length === 0 ? (
              <div className="hd-empty">
                <FiInbox />
                <strong>{query || priority ? "No tickets match" : scope === "unassigned" ? "Nothing waiting to be picked up" : scope === "mine" ? "No open tickets assigned to you" : "No tickets here"}</strong>
                <span>{query || priority ? "Try a different search or filter." : "New tickets show up here automatically."}</span>
              </div>
            ) : (
              <>
                {list.tickets.map((t) => (
                  <QueueItem key={t.id} t={t} active={t.id === id} onClick={() => openTicket(t.id)} />
                ))}
                {list.hasMore && (
                  <button type="button" className="hd-btn hd-btn--ghost hd-more" onClick={() => loadList(list.page + 1)}>Load more</button>
                )}
              </>
            )}
          </div>
        </aside>

        <section className="hd-detail">
          {id ? (
            <DeskTicket key={id} id={id} agents={agents} onBack={() => navigate(`${BASE}${keep}`)} onChanged={refreshAll} />
          ) : (
            <div className="hd-detail-empty">
              <FiInbox />
              <strong>Select a ticket</strong>
              <span>Pick one from the queue to read and reply.</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, tone, label, hint, value, alert = false, active = false, onClick }) {
  const Icon = icon;
  return (
    <button type="button" className={`hd-stat hd-stat--${tone} ${alert ? "is-alert" : ""} ${active ? "is-active" : ""}`} onClick={onClick}>
      <span className="hd-stat-icon">
        <Icon />
        {alert && <span className="hd-stat-ping" />}
      </span>
      <span className="hd-stat-body">
        <strong>{value ?? "–"}</strong>
        <span className="hd-stat-label">{label}</span>
        <span className="hd-stat-hint">{hint}</span>
      </span>
    </button>
  );
}

function QueueItem({ t, active, onClick }) {
  const needsReply = ACTIVE.includes(t.status) && t.status !== "WAITING_USER" && t.lastMessageBy === "USER";
  return (
    <button type="button" className={`hd-qitem ${active ? "is-active" : ""} ${t.unread ? "is-unread" : ""}`} onClick={onClick}>
      <div className="hd-item-top">
        <span className="hd-code">{t.code}</span>
        <StatusChip status={t.status} team />
        <PriorityChip priority={t.priority} />
        <span className="hd-item-time">{timeAgo(t.lastMessageAt)}</span>
      </div>
      <div className="hd-item-subject">
        {t.unread && <span className="hd-dot" aria-label="Unread" />}
        {t.subject}
      </div>
      <div className="hd-qitem-meta">
        <span><FiUser /> {t.raisedBy?.name}{t.raisedBy?.role ? ` · ${t.raisedBy.role}` : ""}</span>
        {t.source === "APP" ? <FiSmartphone title="From the app" /> : <FiMonitor title="From the web" />}
      </div>
      <div className="hd-qitem-foot">
        {t.assignedTo ? <span className="hd-assignee"><FiUserCheck /> {t.assignedTo.name}</span> : <span className="hd-unassigned">Unassigned</span>}
        {needsReply && <span className="hd-needs"><FiClock /> Needs reply</span>}
      </div>
    </button>
  );
}

function DeskTicket({ id, agents, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.getTicket(id));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load().then(() => changed());
  }, [load]);
  useInterval(load, 15 * 1000);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function update(changes, done) {
    setBusy(true);
    try {
      setData(await api.updateTicket(id, changes));
      if (done) setNotice(done);
      onChanged();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  const me = localStorage.getItem("userId");
  const agentOptions = useMemo(() => agents, [agents]);

  if (!data) {
    return (
      <div className="hd-detail-inner">
        <div className="hd-detail-bar hd-only-mobile">
          <button type="button" className="hd-icon-btn" onClick={onBack} aria-label="Back to queue"><FiArrowLeft /></button>
        </div>
        {error ? (
          <div className="hd-center">
            <div className="hd-error">{error}</div>
            <button type="button" className="hd-btn hd-btn--ghost" onClick={load}>Try again</button>
          </div>
        ) : (
          <Spinner label="Opening ticket…" />
        )}
      </div>
    );
  }

  const { ticket: t, messages } = data;
  const mineAssigned = t.assignedTo && me && t.assignedTo.id === String(me);
  const closed = t.status === "CLOSED";

  return (
    <div className="hd-detail-inner">
      <header className="hd-dhead">
        <button type="button" className="hd-icon-btn hd-only-mobile" onClick={onBack} aria-label="Back to queue"><FiArrowLeft /></button>
        <div className="hd-dhead-main">
          <div className="hd-dhead-top">
            <span className="hd-code">{t.code}</span>
            <StatusChip status={t.status} team />
            <PriorityChip priority={t.priority} />
            {t.reopenCount > 0 && <span className="hd-chip hd-chip--reopen">Reopened ×{t.reopenCount}</span>}
          </div>
          <h2>{t.subject}</h2>
          <div className="hd-dhead-meta">
            <span><FiUser /> <strong>{t.raisedBy?.name}</strong>{t.raisedBy?.role ? ` · ${t.raisedBy.role}` : ""}</span>
            <span><FiClock /> Raised {clock(t.createdAt)}</span>
          </div>
        </div>
      </header>

      <div className="hd-controls">
        {!mineAssigned && !closed && (
          <button type="button" className="hd-btn hd-btn--primary hd-btn--sm" disabled={busy} onClick={() => update({ assignedTo: "me" }, "You picked up this ticket")}>
            <FiUserCheck /> Pick up
          </button>
        )}
        <label className="hd-field">
          <span>Assignee</span>
          <select value={t.assignedTo?.id || ""} disabled={busy} onChange={(e) => update({ assignedTo: e.target.value || null }, e.target.value ? "Assigned" : "Unassigned")}>
            <option value="">Unassigned</option>
            {agentOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}{String(a.id) === String(me) ? " (me)" : ""} · {a.role}</option>
            ))}
          </select>
        </label>
        <label className="hd-field">
          <span>Status</span>
          <select value={t.status} disabled={busy} onChange={(e) => update({ status: e.target.value }, "Status updated - the user has been notified")}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="hd-field">
          <span>Priority</span>
          <select value={t.priority} disabled={busy} onChange={(e) => update({ priority: e.target.value }, "Priority updated")}>
            {PRIORITY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <div className="hd-quick">
          {ACTIVE.includes(t.status) && t.status !== "WAITING_USER" && (
            <button type="button" className="hd-btn hd-btn--ghost hd-btn--sm" disabled={busy} onClick={() => update({ status: "WAITING_USER" }, "Waiting on the user")}>
              <FiAlertTriangle /> Ask user
            </button>
          )}
          {ACTIVE.includes(t.status) && (
            <button type="button" className="hd-btn hd-btn--success hd-btn--sm" disabled={busy} onClick={() => update({ status: "RESOLVED" }, "Marked resolved - the user will be asked to confirm")}>
              <FiCheckCircle /> Mark resolved
            </button>
          )}
          {closed && (
            <button type="button" className="hd-btn hd-btn--ghost hd-btn--sm" disabled={busy} onClick={() => update({ status: t.assignedTo ? "IN_PROGRESS" : "OPEN" }, "Ticket reopened")}>
              Reopen
            </button>
          )}
        </div>
      </div>

      <div className="hd-context-bar">
        <span>{t.source === "APP" ? <FiSmartphone /> : <FiGlobe />} {t.source === "APP" ? "App" : "Web"}{t.appVersion ? ` v${t.appVersion}` : ""}</span>
        {t.page && <span title="Page / screen they were on"><FiMonitor /> <code>{t.page}</code></span>}
        {t.device && <span title="Device / browser">{t.device}</span>}
      </div>

      <div className="hd-detail-thread">
        <Thread messages={messages} team />
      </div>

      {notice && <div className="hd-toast hd-toast--desk">{notice}</div>}

      {closed ? (
        <div className="hd-closed">
          <span>This ticket is closed.</span>
          <span className="hd-muted">Reopen it to reply.</span>
        </div>
      ) : (
        <Composer
          team
          placeholder="Reply to the user…"
          onSend={async (msg) => {
            setData(await api.sendMessage(id, msg));
            onChanged();
          }}
        />
      )}
    </div>
  );
}

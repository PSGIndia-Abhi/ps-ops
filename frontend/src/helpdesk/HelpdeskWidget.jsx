// The "Help" button on every signed-in page of the web app, with the user's tickets and chat in a
// panel. Mounted once next to the router (main.jsx) instead of inside each layout, so every area -
// admin, client, supervisor, technician, staff, accountant, leads, task management, feedback desk,
// brigade - gets it without touching those layouts.
//
// Hidden on public pages, for temporary workers, and for the technical team (they answer tickets
// from the Helpdesk desk instead - the server's /summary says who is on the team).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiCheckCircle, FiChevronRight, FiHelpCircle, FiInfo, FiMessageSquare, FiPlus, FiRotateCcw, FiUploadCloud, FiX } from "react-icons/fi";
import * as api from "./helpdeskApi";
import { AttachButton, Composer, PickedFiles, Spinner, StatusChip, Thread } from "./HelpdeskParts";
import { timeAgo, useFilePicker, useInterval } from "./helpdeskHooks";
import "./helpdesk.css";

const PUBLIC_PATHS = [/^\/$/, /^\/login/, /^\/signup/, /^\/terms/, /^\/temp(-access)?(\/|$)/, /^\/invite\//, /^\/feedback\//];
const SUMMARY_EVERY_MS = 60 * 1000;
const THREAD_EVERY_MS = 15 * 1000;

function signedIn() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  return !!token && role !== "temporary_worker";
}

// ---------------------------------------------------------------------------
// Draggable Help button. The person can drag it anywhere so it never sits on top of a page's own
// buttons; on release it glides to the nearest side (left/right) and the spot is remembered in this
// browser. A press that moves less than DRAG_START_PX is an ordinary click (opens Help).
// Stored as { side: "left" | "right", bottom: px from the bottom edge } so it stays put on resize.
// ---------------------------------------------------------------------------
const POS_KEY = "hd-fab-pos";
const DRAG_START_PX = 5;
const PANEL_GAP = 12;
const PANEL_MAX_H = 640;
const PANEL_TOP_ROOM = 30;
const DEFAULT_POS = { side: "right", bottom: 20 };

function readPos() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (p && (p.side === "left" || p.side === "right") && Number.isFinite(p.bottom)) return p;
  } catch {
    /* no saved spot */
  }
  return DEFAULT_POS;
}

function savePos(p) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked - the spot just isn't remembered */
  }
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return vp;
}

function useDraggableFab() {
  const vp = useViewport();
  const [pos, setPos] = useState(readPos);
  const [size, setSize] = useState(null); // the button's own { w, h }, measured
  const [drag, setDrag] = useState(null); // { left, top } while dragging
  const [el, setEl] = useState(null); // the button element (callback ref - it mounts after the summary loads)
  const press = useRef(null); // { id, x, y, offX, offY, moved }
  const justDragged = useRef(false);

  // Measure the button (its width changes: "Help" label, close X, badge).
  useEffect(() => {
    if (!el) return undefined;
    const measure = () => setSize((s) => (s && s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const margin = vp.w <= 560 ? 16 : 20;

  // Where the button sits now (null until measured - the CSS default corner is used until then).
  let box = null;
  if (size) {
    if (drag) {
      box = { left: drag.left, top: drag.top };
    } else {
      const left = pos.side === "left" ? margin : vp.w - margin - size.w;
      const top = clamp(vp.h - pos.bottom - size.h, margin, vp.h - margin - size.h);
      box = { left, top };
    }
  }

  const onPointerDown = (e) => {
    if (e.button !== 0 || !el) return;
    const r = el.getBoundingClientRect();
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, moved: false };
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId || !size) return;
    if (!p.moved) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START_PX) return;
      p.moved = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
    }
    e.preventDefault();
    setDrag({
      left: clamp(e.clientX - p.offX, margin, vp.w - margin - size.w),
      top: clamp(e.clientY - p.offY, margin, vp.h - margin - size.h),
    });
  };

  const finish = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.moved || !drag || !size) {
      setDrag(null);
      return;
    }
    justDragged.current = true; // swallow the click that follows this release
    const side = drag.left + size.w / 2 < vp.w / 2 ? "left" : "right";
    const next = { side, bottom: Math.round(vp.h - drag.top - size.h) };
    setPos(next);
    savePos(next);
    setDrag(null);
  };

  // True once for the click that ends a drag - the caller ignores that click.
  const consumeDrag = () => {
    if (!justDragged.current) return false;
    justDragged.current = false;
    return true;
  };

  // The panel opens beside the button: same side, above it when the button is in the lower half.
  let panelStyle;
  if (box && size && vp.w > 560) {
    const below = box.top + size.h / 2 < vp.h / 2;
    const horiz = box.left + size.w / 2 < vp.w / 2 ? { left: margin, right: "auto" } : { right: margin, left: "auto" };
    if (below) {
      const top = box.top + size.h + PANEL_GAP;
      panelStyle = { ...horiz, top, bottom: "auto", height: Math.min(PANEL_MAX_H, vp.h - top - margin), transformOrigin: "top" };
    } else {
      const bottom = vp.h - box.top + PANEL_GAP;
      panelStyle = { ...horiz, bottom, top: "auto", height: Math.min(PANEL_MAX_H, box.top - PANEL_GAP - PANEL_TOP_ROOM), transformOrigin: "bottom" };
    }
  }

  const fabStyle = box ? { left: box.left, top: box.top, right: "auto", bottom: "auto" } : undefined;

  return {
    attach: setEl,
    fabStyle,
    panelStyle,
    dragging: !!drag,
    consumeDrag,
    handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish },
  };
}

function usePath(router) {
  const [path, setPath] = useState(() => router.state.location.pathname);
  useEffect(() => router.subscribe((state) => setPath(state.location.pathname)), [router]);
  return path;
}

export default function HelpdeskWidget({ router }) {
  const path = usePath(router);
  const isPublic = PUBLIC_PATHS.some((re) => re.test(path));
  const eligible = !isPublic && signedIn();

  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);
  // view: { name: "list" } | { name: "new" } | { name: "ticket", id }
  const [view, setView] = useState({ name: "list" });
  const [toast, setToast] = useState("");
  const { attach: fabAttach, fabStyle, panelStyle, dragging: fabDragging, consumeDrag, handlers: fabHandlers } = useDraggableFab();

  const refreshSummary = useCallback(() => {
    api.getSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  // Signed out (or onto a public page): forget the last person's state.
  const [wasEligible, setWasEligible] = useState(eligible);
  if (wasEligible !== eligible) {
    setWasEligible(eligible);
    if (!eligible) {
      setSummary(null);
      setOpen(false);
      setView({ name: "list" });
    }
  }
  // Re-check whenever the person signs in or moves between areas.
  useEffect(() => {
    if (eligible) refreshSummary();
  }, [eligible, refreshSummary]);
  useInterval(refreshSummary, SUMMARY_EVERY_MS, eligible);

  // Other parts of the app can open it: window.dispatchEvent(new CustomEvent("helpdesk:open", { detail: { ticketId } }))
  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      setView(e.detail?.ticketId ? { name: "ticket", id: e.detail.ticketId } : { name: "list" });
    };
    window.addEventListener("helpdesk:open", onOpen);
    return () => window.removeEventListener("helpdesk:open", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  if (!eligible || !summary || summary.isAgent) return null;

  const close = () => {
    setOpen(false);
    refreshSummary();
  };

  return (
    <div className="hd-root">
      {open && <div className="hd-backdrop" onClick={close} />}
      {open && (
        <section className="hd-panel" role="dialog" aria-label="Help and support" style={panelStyle}>
          {view.name === "list" && (
            <ListView onClose={close} onNew={() => setView({ name: "new" })} onOpen={(id) => setView({ name: "ticket", id })} />
          )}
          {view.name === "new" && (
            <NewTicketView
              onClose={close}
              onBack={() => setView({ name: "list" })}
              onCreated={(t) => {
                setToast(`Ticket ${t.code} raised - the technical team has been notified`);
                setView({ name: "ticket", id: t.id });
                refreshSummary();
              }}
            />
          )}
          {view.name === "ticket" && (
            <TicketView id={view.id} onClose={close} onBack={() => { setView({ name: "list" }); refreshSummary(); }} onToast={setToast} />
          )}
          {toast && <div className="hd-toast">{toast}</div>}
        </section>
      )}

      <button
        type="button"
        ref={fabAttach}
        className={`hd-fab ${open ? "is-open" : ""} ${fabDragging ? "is-dragging" : ""} ${fabStyle ? "is-placed" : ""}`}
        style={fabStyle}
        {...fabHandlers}
        onClick={() => {
          if (consumeDrag()) return; // the release of a drag, not a click
          if (open) close();
          else setOpen(true);
        }}
        aria-label={open ? "Close help" : "Help and support"}
        title={open ? "Close" : "Help & Support · drag to move"}
      >
        {open ? <FiX /> : <FiHelpCircle />}
        {!open && <span className="hd-fab-label">Help</span>}
        {!open && summary.unread > 0 && <span className="hd-badge">{summary.unread > 9 ? "9+" : summary.unread}</span>}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PanelHeader({ title, subtitle, onBack, onClose, children }) {
  return (
    <header className="hd-head">
      {onBack && (
        <button type="button" className="hd-head-btn" onClick={onBack} aria-label="Back">
          <FiArrowLeft />
        </button>
      )}
      <div className="hd-head-text">
        <div className="hd-head-title">{title}</div>
        {subtitle && <div className="hd-head-sub">{subtitle}</div>}
      </div>
      {children}
      <button type="button" className="hd-head-btn" onClick={onClose} aria-label="Close">
        <FiX />
      </button>
    </header>
  );
}

function ListView({ onClose, onNew, onOpen }) {
  const [tab, setTab] = useState("active");
  const [state, setState] = useState({ loading: true, error: "", tickets: [], page: 1, hasMore: false });

  const load = useCallback(async (page = 1) => {
    try {
      const res = await api.listTickets({ scope: "all", page });
      setState((s) => ({
        loading: false,
        error: "",
        tickets: page === 1 ? res.tickets : [...s.tickets, ...res.tickets],
        page: res.page,
        hasMore: res.hasMore,
      }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);
  useInterval(() => load(1), SUMMARY_EVERY_MS, true);

  const active = state.tickets.filter((t) => t.status !== "CLOSED");
  const closed = state.tickets.filter((t) => t.status === "CLOSED");
  const shown = tab === "active" ? active : closed;

  return (
    <>
      <PanelHeader title="Help & Support" subtitle="Report a problem and chat with the technical team" onClose={onClose} />
      <div className="hd-body">
        <button type="button" className="hd-cta" onClick={onNew}>
          <span className="hd-cta-icon"><FiPlus /></span>
          <span className="hd-cta-text">
            <strong>Raise a new ticket</strong>
            <small>Describe the problem, add screenshots</small>
          </span>
          <FiChevronRight />
        </button>

        <div className="hd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "active"} className={tab === "active" ? "is-on" : ""} onClick={() => setTab("active")}>
            Active {active.length > 0 && <span className="hd-count">{active.length}</span>}
          </button>
          <button type="button" role="tab" aria-selected={tab === "closed"} className={tab === "closed" ? "is-on" : ""} onClick={() => setTab("closed")}>
            Closed
          </button>
        </div>

        {state.loading ? (
          <Spinner label="Loading your tickets…" />
        ) : state.error ? (
          <div className="hd-center">
            <div className="hd-error">{state.error}</div>
            <button type="button" className="hd-btn hd-btn--ghost" onClick={() => load(1)}>Try again</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="hd-empty">
            <FiMessageSquare />
            <strong>{tab === "active" ? "No active tickets" : "No closed tickets"}</strong>
            <span>{tab === "active" ? "Facing a problem? Raise a ticket and the technical team will get back to you here." : "Tickets you close will appear here."}</span>
          </div>
        ) : (
          <ul className="hd-list">
            {shown.map((t) => (
              <li key={t.id}>
                <button type="button" className={`hd-item ${t.unread ? "is-unread" : ""}`} onClick={() => onOpen(t.id)}>
                  <div className="hd-item-top">
                    <span className="hd-code">{t.code}</span>
                    <StatusChip status={t.status} />
                    <span className="hd-item-time">{timeAgo(t.lastMessageAt)}</span>
                  </div>
                  <div className="hd-item-subject">
                    {t.unread && <span className="hd-dot" aria-label="New reply" />}
                    {t.subject}
                  </div>
                  {t.lastMessagePreview && <div className="hd-item-preview">{t.lastMessagePreview}</div>}
                </button>
              </li>
            ))}
            {state.hasMore && (
              <li>
                <button type="button" className="hd-btn hd-btn--ghost hd-more" onClick={() => load(state.page + 1)}>Load more</button>
              </li>
            )}
          </ul>
        )}
      </div>
    </>
  );
}

function NewTicketView({ onClose, onBack, onCreated }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const picker = useFilePicker();
  const area = useRef(null);
  const where = useMemo(() => window.location.pathname, []);

  useEffect(() => {
    area.current?.focus();
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please describe the problem.");
      area.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.createTicket({ message: message.trim(), files: picker.files });
      onCreated(res.ticket);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <PanelHeader title="New ticket" subtitle="The technical team will reply here" onBack={onBack} onClose={onClose} />
      <form className="hd-body hd-form" onSubmit={submit}>
        <label className="hd-label" htmlFor="hd-message">What's the problem?</label>
        <textarea
          id="hd-message"
          ref={area}
          className="hd-textarea"
          value={message}
          maxLength={5000}
          placeholder={"What were you trying to do, and what happened instead?\nInclude any error message you saw."}
          onChange={(e) => setMessage(e.target.value)}
          onPaste={picker.onPaste}
          disabled={busy}
        />
        <div className="hd-hint-row">
          <span>Tip: paste a screenshot with Ctrl+V</span>
          <span>{message.length}/5000</span>
        </div>

        <div
          className={`hd-drop ${drag ? "hd-drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            picker.add(e.dataTransfer.files);
          }}
        >
          <FiUploadCloud className="hd-drop-icon" />
          <div className="hd-drop-text">
            <strong>Add screenshots or files</strong>
            <span>Drag & drop or browse · images or PDF · up to {api.MAX_FILES} files, {api.MAX_FILE_MB} MB each</span>
          </div>
          <AttachButton picker={picker} label="Browse" />
        </div>
        <PickedFiles picker={picker} />

        <div className="hd-context">
          <FiInfo />
          <span>The page you're on (<code>{where}</code>) and your browser are sent with the ticket to help the team.</span>
        </div>

        {error && <div className="hd-error">{error}</div>}

        <div className="hd-form-foot">
          <button type="button" className="hd-btn hd-btn--ghost" onClick={onBack} disabled={busy}>Cancel</button>
          <button type="submit" className="hd-btn hd-btn--primary" disabled={busy || !message.trim()}>
            {busy ? <><span className="hd-spinner" /> Submitting…</> : "Submit ticket"}
          </button>
        </div>
      </form>
    </>
  );
}

function TicketView({ id, onClose, onBack, onToast }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.getTicket(id));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  useInterval(load, THREAD_EVERY_MS, true);

  async function act(name, fn, done) {
    setBusy(name);
    try {
      setData(await fn());
      if (done) onToast(done);
    } catch (err) {
      onToast(err.message);
    } finally {
      setBusy("");
    }
  }

  if (!data) {
    return (
      <>
        <PanelHeader title="Ticket" onBack={onBack} onClose={onClose} />
        <div className="hd-body">
          {error ? (
            <div className="hd-center">
              <div className="hd-error">{error}</div>
              <button type="button" className="hd-btn hd-btn--ghost" onClick={load}>Try again</button>
            </div>
          ) : (
            <Spinner label="Opening ticket…" />
          )}
        </div>
      </>
    );
  }

  const { ticket, messages, actions } = data;
  return (
    <>
      <PanelHeader
        title={
          <span className="hd-title-row">
            {ticket.code} <StatusChip status={ticket.status} />
          </span>
        }
        subtitle={ticket.subject}
        onBack={onBack}
        onClose={onClose}
      />

      {ticket.status === "RESOLVED" && (
        <div className="hd-banner hd-banner--ok">
          <div>
            <strong>The technical team marked this as resolved.</strong>
            <span>Is your problem solved?</span>
          </div>
          <div className="hd-banner-actions">
            <button type="button" className="hd-btn hd-btn--primary hd-btn--sm" disabled={!!busy} onClick={() => act("confirm", () => api.confirmSolved(id), "Thanks! The ticket is closed.")}>
              <FiCheckCircle /> Yes, it's solved
            </button>
            <button type="button" className="hd-btn hd-btn--ghost hd-btn--sm" disabled={!!busy} onClick={() => act("reopen", () => api.reopenTicket(id), "Reopened - the technical team has been notified")}>
              <FiRotateCcw /> Still an issue
            </button>
          </div>
        </div>
      )}
      {ticket.status === "WAITING_USER" && (
        <div className="hd-banner hd-banner--warn">
          <strong>The technical team needs more information.</strong>
          <span>Please reply below.</span>
        </div>
      )}

      <div className="hd-body hd-body--thread">
        <Thread messages={messages} />
      </div>

      {ticket.status === "CLOSED" ? (
        <div className="hd-closed">
          <span>This ticket is closed.</span>
          {actions.reopen ? (
            <button type="button" className="hd-btn hd-btn--ghost hd-btn--sm" disabled={!!busy} onClick={() => act("reopen", () => api.reopenTicket(id), "Reopened - the technical team has been notified")}>
              <FiRotateCcw /> Reopen
            </button>
          ) : (
            <span className="hd-muted">Raise a new ticket if you need more help.</span>
          )}
        </div>
      ) : (
        <Composer
          placeholder={ticket.status === "RESOLVED" ? "Reply to reopen this ticket…" : "Write a message…"}
          onSend={async (msg) => setData(await api.sendMessage(id, msg))}
        />
      )}
    </>
  );
}

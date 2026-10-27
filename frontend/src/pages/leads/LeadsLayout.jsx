import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiBriefcase,
  FiAward,
  FiBarChart2,
  FiBell,
  FiCalendar,
  FiCheckSquare,
  FiChevronDown,
  FiClock,
  FiFileText,
  FiGrid,
  FiHome,
  FiInbox,
  FiList,
  FiLogOut,
  FiMapPin,
  FiNavigation,
  FiMenu,
  FiPhoneCall,
  FiPlusCircle,
  FiSearch,
  FiTag,
  FiThumbsDown,
  FiTrendingUp,
  FiUserCheck,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import logo from "../../assets/logo.png";
import { roleBasePath } from "../../auth/roleBasePath";
import { LEAD_MANAGER_ROLES, LEAD_ROLES, TASKPRO_HOME } from "../taskpro/access";
import { LEADS_HOME, PERSONAS, resolvePersona, roleIsPersona } from "./access";
import { getNotifications, loadWorkspace, markNotificationRead, markNotificationsRead, resetWorkspace, useLeadData } from "./leadsApi";
import { isPast, isToday } from "./format";
import { dayLabel, timeLabel } from "./format";
import { kindLabel, todayKey } from "./remindersApi";
import { Avatar, ToastProvider } from "./ui";
import { useMyReminders } from "./useMyReminders";
import { ViewerContext, visibleLeads, visibleMeetings } from "./viewer";
import "./leads.css";

/** How each kind of lead notification looks in the bell. */
const NOTE_ICON = {
  LEAD_NEW: <FiInbox />,
  LEAD_VERIFIED: <FiUserCheck />,
  LEAD_NOT_GENUINE: <FiXCircle />,
  LEAD_MEETING_ASSIGNED: <FiCalendar />,
  LEAD_MEETING_SCHEDULED: <FiCalendar />,
  LEAD_MEETING_MOVED: <FiCalendar />,
  LEAD_MEETING_CANCELLED: <FiXCircle />,
  LEAD_VISIT_DONE: <FiMapPin />,
  LEAD_QUOTATION: <FiFileText />,
  LEAD_CONVERTED: <FiAward />,
  LEAD_LOST: <FiThumbsDown />,
  LEAD_FOLLOW_UP: <FiPhoneCall />,
  LEAD_FOLLOW_UP_DUE: <FiPhoneCall />,
  LEAD_MEETING_DUE: <FiCalendar />,
  LEAD_PROVIDER_UPDATE: <FiBell />,
};
const NOTE_TONE = {
  LEAD_NEW: "info",
  LEAD_VERIFIED: "success",
  LEAD_NOT_GENUINE: "danger",
  LEAD_MEETING_ASSIGNED: "violet",
  LEAD_MEETING_SCHEDULED: "violet",
  LEAD_MEETING_MOVED: "warn",
  LEAD_MEETING_CANCELLED: "danger",
  LEAD_VISIT_DONE: "teal",
  LEAD_QUOTATION: "violet",
  LEAD_CONVERTED: "success",
  LEAD_LOST: "danger",
  LEAD_FOLLOW_UP: "warn",
  LEAD_FOLLOW_UP_DUE: "warn",
  LEAD_MEETING_DUE: "violet",
  LEAD_PROVIDER_UPDATE: "info",
};

const COLLAPSE_KEY = "lm.sideCollapsed";

/** The Residential area's menu (residential.jsx). */
function residentialNav() {
  return [
    { to: `${LEADS_HOME}/residential`, end: true, label: "Dashboard", icon: <FiGrid /> },
    { to: `${LEADS_HOME}/residential/all`, label: "All Residential Leads", icon: <FiList /> },
    { to: `${LEADS_HOME}/residential/new`, label: "Add Residential Lead", icon: <FiPlusCircle /> },
  ];
}

/** The sidebar for each persona. `count` is worked out from what that person can see. */
function navFor(persona, counts) {
  const home = { to: LEADS_HOME, end: true, label: "Dashboard", icon: <FiGrid /> };
  switch (persona) {
    case "lead_provider":
      // No dashboard: the provider's home is their list of leads.
      return [
        { to: `${LEADS_HOME}/submit`, label: "Submit New Lead", icon: <FiPlusCircle /> },
        { to: `${LEADS_HOME}/all`, label: "My Leads", icon: <FiList />, count: counts.leads },
      ];
    case "telecaller":
      return [
        home,
        { to: `${LEADS_HOME}/all`, label: "Leads", icon: <FiList />, count: counts.queue },
        { to: `${LEADS_HOME}/follow-ups`, label: "Follow-ups", icon: <FiPhoneCall />, count: counts.followUps },
        { to: `${LEADS_HOME}/meetings`, label: "Meetings", icon: <FiCalendar /> },
        { to: `${LEADS_HOME}/performance`, label: "My Performance", icon: <FiTrendingUp /> },
      ];
    case "sales":
      return [
        home,
        { to: `${LEADS_HOME}/all`, label: "My Leads", icon: <FiList />, count: counts.leads },
        { to: `${LEADS_HOME}/follow-ups`, label: "Follow-ups", icon: <FiPhoneCall />, count: counts.followUps },
        { to: `${LEADS_HOME}/meetings`, label: "Meetings", icon: <FiCalendar />, count: counts.today },
        { to: `${LEADS_HOME}/performance`, label: "My Performance", icon: <FiTrendingUp /> },
      ];
    default:
      return [
        { ...home, label: "Sales Performance", icon: <FiBarChart2 /> },
        { to: `${LEADS_HOME}/all`, label: "All Leads", icon: <FiList />, count: counts.leads },
        { to: `${LEADS_HOME}/follow-ups`, label: "Follow-ups", icon: <FiPhoneCall />, count: counts.followUps },
        { to: `${LEADS_HOME}/meetings`, label: "Meetings", icon: <FiCalendar /> },
        { to: `${LEADS_HOME}/team-visits`, label: "Team Visits", icon: <FiMapPin /> },
        { to: `${LEADS_HOME}/field-tracking`, label: "Field Tracking", icon: <FiNavigation /> },
        { to: `${LEADS_HOME}/sources`, label: "Lead Sources", icon: <FiTag /> },
        { to: `${LEADS_HOME}/quote-master`, label: "Quotation Master", icon: <FiFileText /> },
        { to: `${LEADS_HOME}/performance`, label: "Team Report", icon: <FiTrendingUp /> },
      ];
  }
}

export default function LeadsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = localStorage.getItem("role");
  // An admin opening Lead Management from the admin panel (not a lead role): always the sales manager's dashboard.
  const canPick = !roleIsPersona(role);
  const [persona] = useState(() => resolvePersona(role));
  const [navOpen, setNavOpen] = useState(false);
  // The three-line button folds the sidebar down to icons; the choice is remembered on this device.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [popover, setPopover] = useState(null); // null | "bell" | "me"
  const mainRef = useRef(null);
  const [query, setQuery] = useState("");
  const { leads, meetings, me, error } = useLeadData();
  // What happened on leads, from the server (unread first), and which bell tab is open.
  const [notes, setNotes] = useState({ items: [], unread: 0 });
  const [bellTab, setBellTab] = useState("updates");
  // A new notification (a lead to verify, a meeting given to you...) also pops up as a card. The ones
  // read on opening are only remembered; "due now" ones are left out - the reminder cards cover those.
  const seenNotes = useRef(null);
  const [notePopups, setNotePopups] = useState([]);
  const refreshNotes = useCallback(() => {
    getNotifications()
      .then((next) => {
        setNotes(next);
        const known = seenNotes.current;
        if (known) {
          // The reminder set on a meeting / follow-up pops up when it rings; other "due" notifications
          // are covered by the reminder cards.
          const fresh = next.items.filter((n) => !n.read && !known.has(n.id) && (!/_DUE$/.test(n.type) || n.type === "TASK_REMINDER_DUE"));
          if (fresh.length) setNotePopups((cur) => [...fresh.map((n) => ({ ...n, id: `note-${n.id}`, noteId: n.id })), ...cur].slice(0, 3));
        }
        seenNotes.current = new Set([...(known || []), ...next.items.map((n) => n.id)]);
      })
      .catch(() => {}); // the bell just stays as it was
  }, []);
  const dismissNote = (id) => setNotePopups((cur) => cur.filter((p) => p.id !== id));

  // The staff's lead reminders, for the bell's Reminders tab, and the cards that pop up on the page
  // when one reaches its time or is newly set for them. No sound or browser notification.
  const { reminders, popups, dismiss } = useMyReminders(persona === "lead_provider" ? "" : me?.id, leads);

  // Read on opening, after every change to the leads (a save here can notify someone), and every 15 seconds.
  useEffect(() => {
    refreshNotes();
  }, [leads, refreshNotes]);
  useEffect(() => {
    const timer = setInterval(refreshNotes, 15000);
    return () => clearInterval(timer);
  }, [refreshNotes]);

  // Everything shown here is read when the lead area opens, and forgotten when it closes
  // so the next person to sign in on this browser never glimpses it.
  useEffect(() => {
    loadWorkspace();
    return resetWorkspace;
  }, []);

  // The signed-in person. Until their details arrive the screens draw their loading state.
  const viewer = useMemo(
    () => ({ persona, me: { id: me?.id || "", name: me?.name || "", providerId: me?.providerId, role: persona }, canPick }),
    [persona, me, canPick],
  );

  const counts = useMemo(() => {
    const mine = visibleLeads(leads, viewer);
    return {
      leads: mine.length,
      queue: mine.filter((l) => ["NEW", "TO_CALL", "NEED_MORE_INFO"].includes(l.stage)).length,
      followUps: mine.filter((l) => l.nextFollowUpAt && (isToday(l.nextFollowUpAt) || isPast(l.nextFollowUpAt))).length,
      today: visibleMeetings(meetings, viewer).filter((m) => isToday(m.scheduledAt) && m.status !== "COMPLETED").length,
    };
  }, [leads, meetings, viewer]);

  // A click anywhere outside an open popover (the bell or the profile menu), or Escape, closes it.
  // Listened for on the document: a layer inside the top bar could not cover the page below it.
  useEffect(() => {
    if (!popover) return undefined;
    const onDown = (e) => !e.target.closest?.(".lm-pop-anchor") && setPopover(null);
    const onKey = (e) => e.key === "Escape" && setPopover(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  // Each page starts at the top, like a fresh page load would.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname, persona]);

  /** On a phone the sidebar slides over the page; on a desktop it folds to icons. */
  function toggleSidebar() {
    if (window.matchMedia("(max-width: 860px)").matches) {
      setNavOpen((open) => !open);
      return;
    }
    setCollapsed((was) => {
      localStorage.setItem(COLLAPSE_KEY, was ? "0" : "1");
      return !was;
    });
  }

  function go(path) {
    setPopover(null);
    navigate(path);
  }

  // What the bell's Reminders tab lists: the Reminders page's own list, cut down to what is due
  // today or overdue - meetings, follow-ups, tasks and personal reminders alike, for every staff
  // login. (A lead provider has no bell.)
  const alerts = useMemo(() => {
    const today = todayKey();
    return reminders
      .filter((r) => r.date <= today)
      .map((r) => {
        const at = `${r.date}T${r.time || "09:00"}`;
        const detail = r.detail && r.kind !== "personal" ? ` · ${r.detail}` : "";
        return {
          id: r.key,
          title: r.title,
          text: `${kindLabel(r.kind)}${detail}`,
          when: r.date < today ? `Overdue · ${dayLabel(at)}` : r.time ? `Today, ${timeLabel(at)}` : "Today",
          to: r.leadId ? `${LEADS_HOME}/${r.leadId}` : `${LEADS_HOME}/reminders`,
        };
      });
  }, [reminders]);

  function openNote(n) {
    if (!n.read) {
      setNotes((cur) => ({ items: cur.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)), unread: Math.max(0, cur.unread - 1) }));
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.leadId) go(`${LEADS_HOME}/${n.leadId}`);
  }

  function readAll() {
    const ids = notes.items.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    setNotes((cur) => ({ items: cur.items.map((x) => ({ ...x, read: true })), unread: 0 }));
    markNotificationsRead(ids).then(refreshNotes);
  }

  const bellCount = notes.unread;

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  // The sales executive and sales manager (and an admin looking in) work residential leads too, in
  // their own area: the switch at the top of the sidebar moves between the two.
  const twoAreas = canPick || persona === "sales" || persona === "sales_manager";
  const residential = twoAreas && location.pathname.startsWith(`${LEADS_HOME}/residential`);

  function search(e) {
    e.preventDefault();
    const q = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    navigate(residential ? `${LEADS_HOME}/residential/all${q}` : `${LEADS_HOME}/all${q}`);
  }

  const info = PERSONAS[persona];
  // Lead staff open Task Management from here with the same login (it has its own login for everyone else).
  const nav = [
    ...(residential ? residentialNav() : navFor(persona, counts)),
    ...(persona !== "lead_provider" ? [{ to: `${LEADS_HOME}/reminders`, label: "Reminders", icon: <FiBell /> }] : []),
    ...(LEAD_ROLES.includes(role) || LEAD_MANAGER_ROLES.includes(role) ? [{ to: TASKPRO_HOME, label: "Task Management", icon: <FiCheckSquare /> }] : []),
  ];

  return (
    <ViewerContext.Provider value={viewer}>
      <ToastProvider>
        {/* The lead staff also work in Task Management, so their screens wear its colours. */}
        <div className={`lm-root${persona !== "lead_provider" ? " tp-theme" : ""}${navOpen ? " nav-open" : ""}${collapsed ? " collapsed" : ""}`}>
          <aside className="lm-side">
            <div className="lm-brand">
              <span className="lm-brand-mark">
                <img src={logo} alt="" />
              </span>
              <span className="lm-brand-text">
                <strong>BestServe</strong>
                <small>{residential ? "Residential Leads" : twoAreas ? "Commercial Leads" : info.area}</small>
              </span>
            </div>

            {twoAreas && (
              <div className="lm-area-switch" role="tablist" aria-label="Lead area">
                <button type="button" role="tab" aria-selected={!residential} className={residential ? "" : "on"} onClick={() => residential && navigate(LEADS_HOME)} data-tip="Commercial">
                  <FiBriefcase /> <span>Commercial</span>
                </button>
                <button type="button" role="tab" aria-selected={residential} className={residential ? "on" : ""} onClick={() => !residential && navigate(`${LEADS_HOME}/residential`)} data-tip="Residential">
                  <FiHome /> <span>Residential</span>
                </button>
              </div>
            )}

            {/* `key` restarts the menu's entrance when the dashboard being viewed changes. */}
            <nav className="lm-nav" key={`${persona}-${residential}`} aria-label="Lead management">
              {nav.map((item, i) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `lm-nav-item${isActive ? " active" : ""}`} style={{ "--i": i }} onClick={() => setNavOpen(false)} data-tip={item.label}>
                  <span className="lm-nav-icon">{item.icon}</span>
                  <span className="lm-nav-label">{item.label}</span>
                  {item.count > 0 && <span className="lm-nav-count">{item.count}</span>}
                </NavLink>
              ))}
            </nav>

            <div className="lm-side-foot">
              {canPick && (
                <button type="button" className="lm-nav-item" onClick={() => navigate(roleBasePath(role))} data-tip="Back to my panel">
                  <span className="lm-nav-icon">
                    <FiArrowLeft />
                  </span>
                  <span className="lm-nav-label">Back to my panel</span>
                </button>
              )}
              <button type="button" className="lm-nav-item" onClick={logout} data-tip="Logout">
                <span className="lm-nav-icon">
                  <FiLogOut />
                </span>
                <span className="lm-nav-label">Logout</span>
              </button>
            </div>
          </aside>
          <button type="button" className="lm-side-scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} />

          <div className="lm-col">
            {!!error && (
              <div className="lm-ribbon" role="alert">
                <span>
                  <strong>Could not load leads.</strong> {error}{" "}
                  <button type="button" className="lm-ribbon-tab on" onClick={loadWorkspace}>
                    Try again
                  </button>
                </span>
              </div>
            )}

            <header className="lm-top">
              <button type="button" className="lm-burger" aria-label={collapsed ? "Expand menu" : "Collapse menu"} aria-expanded={!collapsed} onClick={toggleSidebar}>
                <FiMenu />
              </button>
              <form className="lm-search" onSubmit={search} role="search">
                <FiSearch />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={residential ? "Search residential leads, phone, area..." : "Search leads, company, phone..."} aria-label="Search leads" />
              </form>
              <span className="lm-top-space" />
              {/* No bell for the provider: every update on their lead would tell them its status. */}
              {persona !== "lead_provider" && (
                <div className="lm-pop-anchor">
                  <button
                    type="button"
                    className="lm-icon-btn"
                    aria-label={bellCount ? `Notifications, ${bellCount} unread` : "Notifications"}
                    aria-expanded={popover === "bell"}
                    onClick={() => setPopover(popover === "bell" ? null : "bell")}
                  >
                    <FiBell />
                    {bellCount > 0 ? <span className="lm-bell-count">{bellCount > 99 ? "99+" : bellCount}</span> : alerts.length > 0 && <span className="lm-dot" />}
                  </button>
                  {popover === "bell" && (
                    <div className="lm-pop wide lm-bell" role="dialog" aria-label="Notifications">
                      <div className="lm-bell-head">
                        <strong>Notifications</strong>
                        {notes.unread > 0 && bellTab === "updates" && (
                          <button type="button" className="lm-link" onClick={readAll}>
                            Mark all as read
                          </button>
                        )}
                      </div>
                      <div className="lm-bell-tabs" role="tablist">
                        <button type="button" role="tab" aria-selected={bellTab === "updates"} className={bellTab === "updates" ? "on" : ""} onClick={() => setBellTab("updates")}>
                          Updates{notes.unread > 0 && <span>{notes.unread}</span>}
                        </button>
                        <button type="button" role="tab" aria-selected={bellTab === "reminders"} className={bellTab === "reminders" ? "on" : ""} onClick={() => setBellTab("reminders")}>
                          Reminders{alerts.length > 0 && <span>{alerts.length}</span>}
                        </button>
                      </div>
                      <div className="lm-bell-list">
                        {bellTab === "updates" ? (
                          notes.items.length === 0 ? (
                            <div className="lm-pop-empty">No updates yet. New leads, verifications, meetings and results appear here.</div>
                          ) : (
                            notes.items.map((n, i) => (
                              <button key={n.id} type="button" className={`lm-note${n.read ? "" : " unread"}`} style={{ "--i": i }} onClick={() => openNote(n)}>
                                <span className={`lm-note-icon tone-${NOTE_TONE[n.type] || "info"}`}>{NOTE_ICON[n.type] || <FiBell />}</span>
                                <span className="lm-note-text">
                                  <strong>{n.title}</strong>
                                  <small>{n.text}</small>
                                  <em>
                                    {dayLabel(n.at)}, {timeLabel(n.at)}
                                  </em>
                                </span>
                                {!n.read && <span className="lm-pop-dot" aria-label="Unread" />}
                              </button>
                            ))
                          )
                        ) : (
                          <>
                            {alerts.length === 0 ? (
                              <div className="lm-pop-empty">Nothing due today.</div>
                            ) : (
                              alerts.map((n, i) => (
                                <button key={n.id} type="button" className="lm-note" style={{ "--i": i }} onClick={() => go(n.to)}>
                                  <span className="lm-note-icon tone-warn">
                                    <FiClock />
                                  </span>
                                  <span className="lm-note-text">
                                    <strong>{n.title}</strong>
                                    <small>{n.text}</small>
                                    <em>{n.when}</em>
                                  </span>
                                </button>
                              ))
                            )}
                            <button type="button" className="lm-link lm-bell-all" onClick={() => go(`${LEADS_HOME}/reminders`)}>
                              See all reminders{reminders.length > alerts.length ? ` (${reminders.length - alerts.length} upcoming)` : ""}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="lm-pop-anchor">
                <button type="button" className="lm-me" aria-expanded={popover === "me"} onClick={() => setPopover(popover === "me" ? null : "me")}>
                  <Avatar name={viewer.me.name} size={36} />
                  <span className="lm-me-text">
                    <strong>{viewer.me.name}</strong>
                    <small>{info.label}</small>
                  </span>
                  <FiChevronDown className={`lm-caret${popover === "me" ? " open" : ""}`} />
                </button>
                {popover === "me" && (
                  <div className="lm-pop" role="menu">
                    <div className="lm-pop-head">
                      <strong>{viewer.me.name}</strong>
                      <small>{info.blurb}</small>
                    </div>
                    {canPick && (
                      <button type="button" className="lm-pop-item" role="menuitem" onClick={() => go(roleBasePath(role))}>
                        <FiArrowLeft /> Back to my panel
                      </button>
                    )}
                    <button type="button" className="lm-pop-item danger" role="menuitem" onClick={logout}>
                      <FiLogOut /> Logout
                    </button>
                  </div>
                )}
              </div>
            </header>

            {/* The content area. Full-page forms open over it (not over the top bar), so the
                menu button, search and bell stay in reach. */}
            <div className="lm-stage">
              <main className="lm-main" ref={mainRef}>
                {/* `key` replays the page entrance on every navigation and dashboard switch. */}
                <div className="lm-page" key={`${persona}:${location.pathname}`}>
                  <Outlet />
                </div>
              </main>
            </div>
          </div>

          {popups.length + notePopups.length > 0 && (
            <div className="lm-popups" role="status" aria-live="polite">
              {notePopups.map((p) => (
                <div key={p.id} className="lm-popup">
                  <span className="lm-popup-icon">{NOTE_ICON[p.type] || <FiBell />}</span>
                  <div className="lm-popup-text">
                    <small>New notification</small>
                    <strong>{p.title}</strong>
                    {!!p.text && <span>{p.text}</span>}
                    {!!p.leadId && (
                      <button
                        type="button"
                        className="lm-link"
                        onClick={() => {
                          dismissNote(p.id);
                          markNotificationRead(p.noteId).then(refreshNotes, () => {});
                          navigate(`${LEADS_HOME}/${p.leadId}`);
                        }}
                      >
                        Open lead
                      </button>
                    )}
                  </div>
                  <button type="button" className="lm-popup-x" onClick={() => dismissNote(p.id)} aria-label="Dismiss">
                    <FiX />
                  </button>
                </div>
              ))}
              {popups.map((p) => (
                <div key={p.id} className="lm-popup">
                  <span className="lm-popup-icon">{p.kind === "meeting" ? <FiCalendar /> : p.kind === "followup" ? <FiPhoneCall /> : <FiBell />}</span>
                  <div className="lm-popup-text">
                    <small>{p.title}</small>
                    <strong>{p.text}</strong>
                    {!!p.sub && <span>{p.sub}</span>}
                    <button
                      type="button"
                      className="lm-link"
                      onClick={() => {
                        dismiss(p.id);
                        navigate(p.leadId ? `${LEADS_HOME}/${p.leadId}` : `${LEADS_HOME}/reminders`);
                      }}
                    >
                      {p.leadId ? "Open lead" : "Open reminders"}
                    </button>
                  </div>
                  <button type="button" className="lm-popup-x" onClick={() => dismiss(p.id)} aria-label="Dismiss">
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </ToastProvider>
    </ViewerContext.Provider>
  );
}

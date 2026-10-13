import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiAward,
  FiBarChart2,
  FiBell,
  FiBriefcase,
  FiCalendar,
  FiCheckSquare,
  FiChevronDown,
  FiClock,
  FiFileText,
  FiGrid,
  FiInbox,
  FiList,
  FiLogOut,
  FiMapPin,
  FiMenu,
  FiPhoneCall,
  FiPlusCircle,
  FiSearch,
  FiTag,
  FiThumbsDown,
  FiTrendingUp,
  FiUserCheck,
  FiXCircle,
} from "react-icons/fi";
import logo from "../../assets/logo.png";
import { roleBasePath } from "../../auth/roleBasePath";
import { LEAD_ROLES, TASKPRO_HOME } from "../taskpro/access";
import { LEADS_HOME, PERSONAS, resolvePersona, roleIsPersona } from "./access";
import { getNotifications, loadWorkspace, markNotificationRead, markNotificationsRead, resetWorkspace, useLeadData } from "./leadsApi";
import { isPast, isToday } from "./format";
import { dayLabel, timeLabel } from "./format";
import { Avatar, ToastProvider } from "./ui";
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
  LEAD_PROVIDER_UPDATE: "info",
};

const COLLAPSE_KEY = "lm.sideCollapsed";

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
        { to: `${LEADS_HOME}/meetings`, label: "Meetings", icon: <FiCalendar />, count: counts.today },
        { to: `${LEADS_HOME}/performance`, label: "My Performance", icon: <FiTrendingUp /> },
      ];
    default:
      return [
        { ...home, label: "Sales Performance", icon: <FiBarChart2 /> },
        { to: `${LEADS_HOME}/all`, label: "All Leads", icon: <FiList />, count: counts.leads },
        { to: `${LEADS_HOME}/follow-ups`, label: "Follow-ups", icon: <FiPhoneCall />, count: counts.followUps },
        { to: `${LEADS_HOME}/meetings`, label: "Meetings", icon: <FiCalendar /> },
        { to: `${LEADS_HOME}/providers`, label: "Lead Providers", icon: <FiBriefcase /> },
        { to: `${LEADS_HOME}/sources`, label: "Lead Sources", icon: <FiTag /> },
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
  const refreshNotes = useCallback(() => {
    getNotifications()
      .then(setNotes)
      .catch(() => {}); // the bell just stays as it was
  }, []);

  // Read on opening, after every change to the leads (a save here can notify someone), and once a minute.
  useEffect(() => {
    refreshNotes();
  }, [leads, refreshNotes]);
  useEffect(() => {
    const timer = setInterval(refreshNotes, 60000);
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

  // What the bell lists: calls due for whoever verifies leads, today's meetings for sales,
  // and the latest feedback for a provider.
  const alerts = useMemo(() => {
    const mine = visibleLeads(leads, viewer);
    if (persona === "lead_provider") {
      return mine
        .filter((l) => l.providerFeedback)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5)
        .map((l) => ({ id: l.id, title: l.company, text: l.providerFeedback, when: dayLabel(l.updatedAt), to: `${LEADS_HOME}/${l.id}` }));
    }
    if (persona === "sales") {
      return visibleMeetings(meetings, viewer)
        .filter((m) => isToday(m.scheduledAt) && m.status !== "COMPLETED")
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
        .slice(0, 5)
        .map((m) => ({ id: m.id, title: leads.find((l) => l.id === m.leadId)?.company || "Meeting", text: m.type === "SITE_VISIT" ? "Site visit today" : "Meeting today", when: timeLabel(m.scheduledAt), to: `${LEADS_HOME}/${m.leadId}` }));
    }
    return mine
      .filter((l) => l.nextFollowUpAt && (isToday(l.nextFollowUpAt) || isPast(l.nextFollowUpAt)))
      .sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt))
      .slice(0, 5)
      .map((l) => ({ id: l.id, title: l.company, text: isPast(l.nextFollowUpAt) ? "Follow-up call overdue" : "Follow-up call due today", when: timeLabel(l.nextFollowUpAt), to: `${LEADS_HOME}/${l.id}` }));
  }, [leads, meetings, viewer, persona]);

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

  function search(e) {
    e.preventDefault();
    navigate(`${LEADS_HOME}/all${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
  }

  const info = PERSONAS[persona];
  // Lead staff open Task Management from here with the same login (it has its own login for everyone else).
  const nav = [...navFor(persona, counts), ...(LEAD_ROLES.includes(role) ? [{ to: TASKPRO_HOME, label: "Task Management", icon: <FiCheckSquare /> }] : [])];

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
                <small>{info.area}</small>
              </span>
            </div>

            {/* `key` restarts the menu's entrance when the dashboard being viewed changes. */}
            <nav className="lm-nav" key={persona} aria-label="Lead management">
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
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads, company, phone..." aria-label="Search leads" />
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
                        ) : alerts.length === 0 ? (
                          <div className="lm-pop-empty">Nothing needs your attention right now.</div>
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
              {/* A click anywhere else closes whichever popover is open. */}
              {popover && <button type="button" className="lm-pop-shade" aria-label="Close" onClick={() => setPopover(null)} />}
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
        </div>
      </ToastProvider>
    </ViewerContext.Provider>
  );
}

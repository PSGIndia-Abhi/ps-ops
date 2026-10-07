import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiBarChart2,
  FiBell,
  FiBriefcase,
  FiCalendar,
  FiChevronDown,
  FiGrid,
  FiList,
  FiLogOut,
  FiMenu,
  FiPhoneCall,
  FiPlusCircle,
  FiSearch,
} from "react-icons/fi";
import logo from "../../assets/logo.png";
import { roleBasePath } from "../../auth/roleBasePath";
import { LEADS_HOME, PERSONAS, PERSONA_KEYS, resolvePersona, roleIsPersona, savePreviewPersona } from "./access";
import { USING_SAMPLE_DATA, useLeadData } from "./leadsApi";
import { PERSONA_USER } from "./mockData";
import { isPast, isToday } from "./format";
import { dayLabel, timeLabel } from "./format";
import { Avatar, ToastProvider } from "./ui";
import { ViewerContext, visibleLeads, visibleMeetings } from "./viewer";
import "./leads.css";

const COLLAPSE_KEY = "lm.sideCollapsed";

/** The sidebar for each persona. `count` is worked out from what that person can see. */
function navFor(persona, counts) {
  const home = { to: LEADS_HOME, end: true, label: "Dashboard", icon: <FiGrid /> };
  switch (persona) {
    case "lead_provider":
      return [
        home,
        { to: `${LEADS_HOME}/submit`, label: "Submit New Lead", icon: <FiPlusCircle /> },
        { to: `${LEADS_HOME}/all`, label: "My Leads", icon: <FiList />, count: counts.leads },
      ];
    case "telecaller":
      return [
        home,
        { to: `${LEADS_HOME}/all`, label: "Leads", icon: <FiList />, count: counts.queue },
        { to: `${LEADS_HOME}/follow-ups`, label: "Follow-ups", icon: <FiPhoneCall />, count: counts.followUps },
        { to: `${LEADS_HOME}/meetings`, label: "Meetings", icon: <FiCalendar /> },
      ];
    case "sales":
      return [
        home,
        { to: `${LEADS_HOME}/all`, label: "My Leads", icon: <FiList />, count: counts.leads },
        { to: `${LEADS_HOME}/meetings`, label: "Meetings", icon: <FiCalendar />, count: counts.today },
      ];
    default:
      return [
        { ...home, label: "Sales Performance", icon: <FiBarChart2 /> },
        { to: `${LEADS_HOME}/all`, label: "All Leads", icon: <FiList />, count: counts.leads },
        { to: `${LEADS_HOME}/follow-ups`, label: "Follow-ups", icon: <FiPhoneCall />, count: counts.followUps },
        { to: `${LEADS_HOME}/meetings`, label: "Meetings", icon: <FiCalendar /> },
        { to: `${LEADS_HOME}/providers`, label: "Lead Providers", icon: <FiBriefcase /> },
      ];
  }
}

export default function LeadsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = localStorage.getItem("role");
  const canPick = !roleIsPersona(role);
  const [persona, setPersona] = useState(() => resolvePersona(role));
  const [navOpen, setNavOpen] = useState(false);
  // The three-line button folds the sidebar down to icons; the choice is remembered on this device.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [popover, setPopover] = useState(null); // null | "bell" | "me"
  const mainRef = useRef(null);
  const [query, setQuery] = useState("");
  const { leads, meetings } = useLeadData();

  // While the data is sample data, each dashboard is shown as the sample person it belongs to.
  const viewer = useMemo(() => ({ persona, me: { ...PERSONA_USER[persona], role: persona }, canPick }), [persona, canPick]);

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

  function pickPersona(next) {
    savePreviewPersona(next);
    setPersona(next);
    navigate(LEADS_HOME);
  }

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
  const nav = navFor(persona, counts);

  return (
    <ViewerContext.Provider value={viewer}>
      <ToastProvider>
        <div className={`lm-root${navOpen ? " nav-open" : ""}${collapsed ? " collapsed" : ""}`}>
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
            {(USING_SAMPLE_DATA || canPick) && (
              <div className="lm-ribbon" role="note">
                {USING_SAMPLE_DATA && (
                  <span>
                    <strong>Sample data.</strong> Nothing here is saved or sent to the server yet.
                  </span>
                )}
                {canPick && (
                  <>
                    <span>View as:</span>
                    <span className="lm-ribbon-tabs">
                      {PERSONA_KEYS.map((key) => (
                        <button key={key} type="button" className={`lm-ribbon-tab${key === persona ? " on" : ""}`} onClick={() => pickPersona(key)}>
                          {PERSONAS[key].label}
                        </button>
                      ))}
                    </span>
                  </>
                )}
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
              <div className="lm-pop-anchor">
                <button type="button" className="lm-icon-btn" aria-label={alerts.length ? `Notifications, ${alerts.length} waiting` : "Notifications"} aria-expanded={popover === "bell"} onClick={() => setPopover(popover === "bell" ? null : "bell")}>
                  <FiBell />
                  {alerts.length > 0 && <span className="lm-dot" />}
                </button>
                {popover === "bell" && (
                  <div className="lm-pop wide" role="dialog" aria-label="Notifications">
                    <div className="lm-pop-head">
                      <strong>Notifications</strong>
                      <small>{alerts.length ? `${alerts.length} waiting for you` : "You're all caught up"}</small>
                    </div>
                    {alerts.length === 0 ? (
                      <div className="lm-pop-empty">Nothing needs your attention right now.</div>
                    ) : (
                      alerts.map((n, i) => (
                        <button key={n.id} type="button" className="lm-pop-item" style={{ "--i": i }} onClick={() => go(n.to)}>
                          <span className="lm-pop-dot" />
                          <span className="lm-who-text">
                            <strong>{n.title}</strong>
                            <small>{n.text}</small>
                          </span>
                          <em>{n.when}</em>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

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

            <main className="lm-main" ref={mainRef}>
              {/* `key` replays the page entrance on every navigation and dashboard switch. */}
              <div className="lm-page" key={`${persona}:${location.pathname}`}>
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </ToastProvider>
    </ViewerContext.Provider>
  );
}

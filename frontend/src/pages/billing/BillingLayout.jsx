import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiBarChart2,
  FiChevronDown,
  FiChevronUp,
  FiClipboard,
  FiEdit2,
  FiFileText,
  FiFolder,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiMessageSquare,
  FiPlayCircle,
  FiShoppingBag,
  FiAlignLeft,
  FiRepeat,
  FiUsers,
  FiCalendar,
} from "react-icons/fi";
import logo from "../../assets/logo.png";
import useMe from "../../hooks/useMe";
import useStackedTables from "../../hooks/useStackedTables";
import NotificationsMenu from "../../components/NotificationsMenu";
import UserMenu from "../../components/UserMenu";
import useHasFeedbackAccess from "../feedback/useHasFeedbackAccess";
import { FEEDBACK_HOME } from "../feedback/access";
import { TASKPRO_HOME, TASKPRO_ROLES } from "../taskpro/access";
import { billingGet } from "./billingApi";
import { BILLING_HOME, useBillingMe } from "./access";
import "../../layouts/AccountantLayout.css";
import "../accountant/accountant.css";
import "./billing.css";

// The Billing area (Invoice Generation) for the Accounts department (Accounts Head / Executive)
// and the Service Coordinator. Same look as the Accountant Panel; the menu follows the user's
// billing permissions (GET /api/billing/me).

// The permission each page needs (the API checks it again on every call).
const PAGE_PERMISSION = {
  tracker: "VIEW_SERVICE_TRACKER",
  plans: "VIEW_SERVICE_TRACKER",
  run: "VIEW_BILLING",
  drafts: "VIEW_BILLING",
  invoices: "VIEW_BILLING",
  contracts: "VIEW_BILLING",
  pos: "VIEW_BILLING",
  descriptions: "VIEW_BILLING",
  frequencies: "VIEW_BILLING",
};

function navFor(can, drafts) {
  const accounts = can("VIEW_BILLING");
  const tracker = can("VIEW_SERVICE_TRACKER");
  if (!accounts) {
    return [
      {
        label: "Service Planning",
        icon: FiUsers,
        children: [
          { label: "Service Plans", path: `${BILLING_HOME}/plans`, icon: FiCalendar },
          tracker && { label: "Service Tracker", path: `${BILLING_HOME}/tracker`, icon: FiBarChart2 },
        ].filter(Boolean),
      },
    ];
  }
  return [
    {
      label: "Billing",
      icon: FiFileText,
      children: [
        tracker && { label: "Service Tracker", path: `${BILLING_HOME}/tracker`, icon: FiBarChart2 },
        { label: "Bill Run", path: `${BILLING_HOME}/run`, icon: FiPlayCircle },
        { label: "Draft Invoices", path: `${BILLING_HOME}/drafts`, icon: FiEdit2, badge: drafts },
        { label: "Issued Invoices", path: `${BILLING_HOME}/invoices`, icon: FiFileText },
      ].filter(Boolean),
    },
    {
      label: "Masters",
      icon: FiFolder,
      children: [
        tracker && { label: "Service Plans", path: `${BILLING_HOME}/plans`, icon: FiCalendar },
        { label: "Contracts & Price Lists", path: `${BILLING_HOME}/contracts`, icon: FiClipboard },
        { label: "Purchase Orders", path: `${BILLING_HOME}/pos`, icon: FiShoppingBag },
        accounts && { label: "Invoice Descriptions", path: `${BILLING_HOME}/descriptions`, icon: FiAlignLeft },
        accounts && { label: "Billing Frequencies", path: `${BILLING_HOME}/frequencies`, icon: FiRepeat },
      ].filter(Boolean),
    },
  ];
}

export default function BillingLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();
  const me = useBillingMe();
  const hasFeedback = useHasFeedbackAccess();
  const role = localStorage.getItem("role") || "";
  const mainRef = useRef(null);
  useStackedTables(mainRef);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [drafts, setDrafts] = useState(0);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Number of drafts waiting to be issued (the badge on "Draft Invoices"), refreshed per page.
  const accounts = me.can("VIEW_BILLING");
  useEffect(() => {
    if (!accounts) return undefined;
    let live = true;
    billingGet("/invoices?status=DRAFT&page_size=1")
      .then((r) => live && setDrafts(r?.total || 0))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [accounts, location.pathname]);

  if (me.ready && !me.permissions.length) {
    return <Navigate to={TASKPRO_ROLES.includes(role) ? TASKPRO_HOME : "/"} replace />;
  }
  // A page the user's permissions do not cover (e.g. typed into the address bar) opens their home instead.
  const section = location.pathname.slice(BILLING_HOME.length + 1).split("/")[0];
  const needed = PAGE_PERMISSION[section];
  if (me.ready && needed && !me.can(needed)) return <Navigate to={BILLING_HOME} replace />;

  const nav = navFor(me.can, drafts);
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);
  const groupActive = (g) => g.children.some((c) => isActive(c.path));
  const groupOpen = (g) => openGroups[g.label] ?? true;

  function go(path) {
    setMenuOpen(false);
    navigate(path);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  const navEl = (
    <nav className="acc-nav">
      {nav.map((group) => {
        const Icon = group.icon;
        const open = groupOpen(group);
        return (
          <div key={group.label}>
            <button
              type="button"
              className={`acc-parent ${groupActive(group) ? "active" : ""}`}
              onClick={() => setOpenGroups((prev) => ({ ...prev, [group.label]: !open }))}
              aria-expanded={open}
            >
              <Icon className="acc-icon" />
              <span className="acc-label">{group.label}</span>
              {open ? <FiChevronUp className="acc-chevron" /> : <FiChevronDown className="acc-chevron" />}
            </button>
            {open && (
              <div className="acc-children">
                {group.children.map((child) => {
                  const ChildIcon = child.icon;
                  return (
                    <button key={child.path} type="button" className={`acc-child ${isActive(child.path) ? "active" : ""}`} onClick={() => go(child.path)}>
                      <ChildIcon className="acc-icon" />
                      <span className="acc-label">{child.label}</span>
                      {child.badge > 0 && <span className="bl-nav-badge">{child.badge}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="acc-foot">
        {role === "admin" && (
          <button type="button" className="acc-item" onClick={() => go("/admin")}>
            <FiGrid className="acc-icon" />
            <span className="acc-label">Admin Panel</span>
          </button>
        )}
        {TASKPRO_ROLES.includes(role) && (
          <button type="button" className="acc-item" onClick={() => go(TASKPRO_HOME)}>
            <FiClipboard className="acc-icon" />
            <span className="acc-label">Task Management</span>
          </button>
        )}
        {hasFeedback && (
          <button type="button" className="acc-item" onClick={() => go(FEEDBACK_HOME)}>
            <FiMessageSquare className="acc-icon" />
            <span className="acc-label">Customer Feedback</span>
          </button>
        )}
        <button type="button" className="acc-item" onClick={logout}>
          <FiLogOut className="acc-icon" />
          <span className="acc-label">Logout</span>
        </button>
      </div>
    </nav>
  );

  return (
    <div className="app-shell acc-square bl-app">
      <header className="app-header">
        <button type="button" className="header-left header-left-btn" onClick={() => navigate(BILLING_HOME)}>
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">{me.ready && !accounts ? "Service Coordinator" : "Accounts Department"}</span>
          <span className="bl-hdr-tag">{me.ready && !accounts ? "Service Planning" : "Billing"}</span>
        </button>
        <div className="header-right">
          <NotificationsMenu iconOnly />
          <UserMenu user={user} onLogout={logout} actions={[]} />
        </div>
      </header>

      <div className="app-body">
        {!isMobile && <aside className="sidebar acc-sidebar">{me.ready && navEl}</aside>}
        <main className="main-content" ref={mainRef}>
          {isMobile && (
            <>
              <button type="button" className="acc-mobile-toggle" onClick={() => setMenuOpen((o) => !o)}>
                <FiMenu /> Menu
              </button>
              {menuOpen && <div className="acc-mobile-panel">{navEl}</div>}
            </>
          )}
          {me.ready ? <Outlet context={{ me }} /> : <div className="ac-card">Loading…</div>}
        </main>
      </div>
    </div>
  );
}

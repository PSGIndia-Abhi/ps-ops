import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiCheckSquare,
  FiClipboard,
  FiEdit3,
  FiFileText,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiMenu,
  FiMessageSquare,
  FiPlayCircle,
  FiZap,
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
import { CenterSpinner } from "./Skeletons";
import "../../layouts/AccountantLayout.css";
import "../accountant/accountant.css";
import "./billing.css";

// The Billing area (Invoice Generation) for the Accounts department (Accounts Head / Executive)
// and the Service Coordinator. Same look as the Accountant Panel; the menu follows the user's
// billing permissions (GET /api/billing/me).

// The permission each page needs (the API checks it again on every call).
// A list = any one of them.
const PAGE_PERMISSION = {
  dashboard: "VIEW_BILLING",
  coordinator: "VIEW_SERVICE_TRACKER",
  sos: ["VIEW_SERVICE_TRACKER", "VIEW_BILLING"],
  run: "VIEW_BILLING",
  generate: "GENERATE_INVOICE",
  drafts: "VIEW_BILLING",
  invoices: "VIEW_BILLING",
  masters: "VIEW_BILLING",
  contracts: "VIEW_BILLING",
  pos: "VIEW_BILLING",
  descriptions: "VIEW_BILLING",
  frequencies: "VIEW_BILLING",
};

// Pages that belong to a menu item without being in the menu (opened from Masters).
const MENU_OF = { contracts: "masters", pos: "masters", descriptions: "masters", frequencies: "masters" };

/**
 * The menu: flat sections, every item one click away. Accounts (VIEW_BILLING) bill; the Service
 * Coordinator (MANAGE_SERVICE_PLANS) plans services. Someone with both (admin) sees both sections.
 */
function navFor(can, drafts) {
  const accounts = can("VIEW_BILLING");
  const coordinator = can("MANAGE_SERVICE_PLANS") || (!accounts && can("VIEW_SERVICE_TRACKER"));
  const sections = [];
  if (accounts) {
    sections.push(
      {
        heading: "Billing",
        items: [
          { key: "dashboard", label: "Dashboard", icon: FiGrid },
          // Generate Invoice: a manual (extra) invoice, made and issued in one go - needs both permissions
          ...(can("GENERATE_INVOICE") && can("ISSUE_INVOICE") ? [{ key: "generate", label: "Generate Invoice", icon: FiZap }] : []),
          { key: "run", label: "Bill Run", icon: FiPlayCircle },
          { key: "drafts", label: "Draft Invoices", icon: FiEdit3, badge: drafts },
          { key: "invoices", label: "Issued Invoices", icon: FiFileText },
          { key: "sos", label: "Monthly SOS", icon: FiCheckSquare },
        ],
      },
      {
        heading: "Setup",
        items: [{ key: "masters", label: "Masters", icon: FiLayers }],
      }
    );
  }
  // The Service Coordinator: a dashboard and the monthly SOS (Accounts reach the SOS from Billing).
  if (coordinator) {
    sections.push({
      heading: "Service Coordinator",
      items: [
        { key: "coordinator", label: "Dashboard", icon: FiGrid },
        ...(accounts ? [] : [{ key: "sos", label: "Monthly SOS", icon: FiCheckSquare }]),
      ],
    });
  }
  return sections;
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
  const allowed = !needed || (Array.isArray(needed) ? needed.some((p) => me.can(p)) : me.can(needed));
  if (me.ready && !allowed) return <Navigate to={BILLING_HOME} replace />;

  const nav = navFor(me.can, drafts);
  const current = MENU_OF[section] || section;

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
    <nav className="acc-nav bl-nav">
      {nav.map((sec) => (
        <div key={sec.heading} className="bl-nav-sec">
          <div className="bl-nav-heading">{sec.heading}</div>
          {sec.items.map((item) => {
            const Icon = item.icon;
            const active = current === item.key;
            return (
              <button key={item.key} type="button" className={`bl-nav-item ${active ? "active" : ""}`} onClick={() => go(`${BILLING_HOME}/${item.key}`)} aria-current={active ? "page" : undefined}>
                <Icon className="acc-icon" />
                <span className="acc-label">{item.label}</span>
                {item.badge > 0 && <span className="bl-nav-badge">{item.badge}</span>}
              </button>
            );
          })}
        </div>
      ))}
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
          {me.ready ? <Outlet context={{ me }} /> : <CenterSpinner label="Loading billing" />}
        </main>
      </div>
    </div>
  );
}

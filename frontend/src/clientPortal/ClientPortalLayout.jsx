import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineSquares2X2, HiOutlineBuildingStorefront, HiOutlineClipboardDocumentList, HiOutlineChatBubbleLeftRight,
  HiOutlineFolderOpen, HiOutlineShieldCheck, HiOutlineSparkles, HiOutlineUserCircle, HiOutlineBars3,
  HiOutlineArrowRightOnRectangle, HiOutlinePhone, HiOutlineEnvelope, HiOutlineMapPin, HiOutlinePlus,
  HiOutlineLifebuoy,
} from "react-icons/hi2";
import logo from "../assets/logo.png";
import { apiFetch, safeJson } from "../api";
import useMe from "../hooks/useMe";
import NotificationsMenu from "../components/NotificationsMenu";
import UserMenu from "../components/UserMenu";
import { loadSavedOutlet, saveOutlet, SUPPORT_CONTACT } from "./portalUtils";
import CompanyAvatar from "../pages/clientAccounts/CompanyAvatar";
import OutletPicker from "./OutletPicker";
import "./clientPortal.css";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/client", label: "Dashboard", icon: <HiOutlineSquares2X2 aria-hidden="true" />, end: true },
      { to: "/client/outlets", label: "Outlets", icon: <HiOutlineBuildingStorefront aria-hidden="true" /> },
    ],
  },
  {
    label: "Services",
    items: [
      { to: "/client/jobs", label: "Jobs & Visits", icon: <HiOutlineClipboardDocumentList aria-hidden="true" /> },
      { to: "/client/request-service", label: "Request a Service", icon: <HiOutlineSparkles aria-hidden="true" /> },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/client/complaints", label: "Complaints", icon: <HiOutlineChatBubbleLeftRight aria-hidden="true" /> },
    ],
  },
  {
    label: "Records",
    items: [
      { to: "/client/documents", label: "Documents", icon: <HiOutlineFolderOpen aria-hidden="true" /> },
      { to: "/client/audits", label: "Audit Reports", icon: <HiOutlineShieldCheck aria-hidden="true" /> },
    ],
  },
];
const ALL_NAV = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  { to: "/client/profile", label: "Profile", end: false },
];

// The portal font, loaded once and only used inside .cp-shell.
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
function useJakartaFont() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

export default function ClientPortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: me } = useMe();
  useJakartaFont();

  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [outletId, setOutletIdState] = useState(loadSavedOutlet);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("clientPortal.sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });

  // ☰ button: on phones it opens/closes the slide-out menu, on desktop it collapses the sidebar to icons.
  function toggleMenu() {
    if (window.matchMedia("(max-width: 860px)").matches) {
      setDrawerOpen((open) => !open);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("clientPortal.sidebarCollapsed", next ? "1" : "0");
      } catch {
        /* not remembered */
      }
      return next;
    });
  }

  const loadPortal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/client-portal/me");
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Could not load your account");
      setPortal(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  // Close the mobile drawer whenever the page changes.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  // Forget a saved outlet the user no longer has access to.
  const validOutletId = useMemo(() => {
    if (!portal || !outletId) return "";
    return portal.outlets.some((o) => o.id === outletId) ? outletId : "";
  }, [portal, outletId]);

  const setOutletId = useCallback((id) => {
    setOutletIdState(id || "");
    saveOutlet(id || "");
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  const company = portal?.companies?.[0];
  const companyName = String(company?.display_name || company?.name || "").trim();
  const current = ALL_NAV.find((n) =>
    n.end ? location.pathname === n.to || location.pathname === `${n.to}/` : location.pathname.startsWith(n.to)
  );
  const pageTitle = current?.label || "Client Portal";

  if (loading && !portal) {
    return (
      <div className="cp-fullscreen">
        <div className="cp-loader">
          <img src={logo} alt="" />
          <div className="cp-spinner" aria-label="Loading" />
        </div>
      </div>
    );
  }

  if (error && !portal) {
    return (
      <div className="cp-fullscreen">
        <div className="cp-noaccess">
          <img src={logo} alt="BestServe" />
          <h2>We couldn’t open your portal</h2>
          <p>{error}</p>
          <div className="cp-noaccess-actions">
            <button className="cp-btn" onClick={loadPortal}>Try again</button>
            <button className="cp-btn cp-btn-ghost" onClick={logout}>Log out</button>
          </div>
        </div>
      </div>
    );
  }

  const outlets = portal.outlets || [];

  return (
    <div className={`cp-shell ${collapsed ? "collapsed" : ""}`}>
      <aside className={`cp-sidebar ${drawerOpen ? "open" : ""}`}>
        <div className="cp-brand">
          <span className="cp-brand-mark"><img src={logo} alt="" /></span>
          <span className="cp-brand-text">
            <strong>BestServe</strong>
            <small>Client Portal</small>
          </span>
        </div>

        <div className="cp-company" title={companyName}>
          <CompanyAvatar name={companyName} size={38} className="cp-company-avatar-modern" />
          <div className="cp-company-text">
            <strong>{companyName}</strong>
            <small>
              <HiOutlineMapPin aria-hidden="true" />
              {portal.access === "company" ? `All outlets · ${outlets.length}` : `${outlets.length} outlet${outlets.length === 1 ? "" : "s"}`}
            </small>
          </div>
        </div>

        <nav className="cp-nav" aria-label="Portal">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="cp-nav-group">
              <span className="cp-nav-label">{group.label}</span>
              {group.items.map(({ to, label, icon, end }) => (
                <NavLink key={to} to={to} end={end} title={label} className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}>
                  {icon}
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="cp-manager cp-support">
          <div className="cp-manager-top">
            <span className="cp-manager-avatar"><HiOutlineLifebuoy aria-hidden="true" /></span>
            <div>
              <small>Contact BestServe</small>
              <strong>We’re here to help</strong>
            </div>
          </div>
          <a className="cp-support-line" href={`mailto:${SUPPORT_CONTACT.email}`}>
            <HiOutlineEnvelope aria-hidden="true" /> <span>{SUPPORT_CONTACT.email}</span>
          </a>
          <a className="cp-support-line" href={`tel:${SUPPORT_CONTACT.phone}`}>
            <HiOutlinePhone aria-hidden="true" /> <span>{SUPPORT_CONTACT.phoneDisplay}</span>
          </a>
        </div>

        <div className="cp-side-foot">
          <NavLink to="/client/profile" title="Profile" className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}>
            <HiOutlineUserCircle aria-hidden="true" /><span>Profile</span>
          </NavLink>
          <button className="cp-logout" onClick={logout} title="Log out"><HiOutlineArrowRightOnRectangle aria-hidden="true" /> <span>Log out</span></button>
        </div>
      </aside>

      {drawerOpen && <div className="cp-backdrop" onClick={() => setDrawerOpen(false)} />}

      <div className="cp-main">
        <header className="cp-topbar">
          <button className="cp-icon-btn cp-menu-btn" onClick={toggleMenu} aria-label="Toggle menu">
            <HiOutlineBars3 />
          </button>
          <div className="cp-topbar-title">
            <h1 className="cp-page-title">{pageTitle}</h1>
            <small>{companyName}</small>
          </div>

          {outlets.length > 0 && (
            <OutletPicker outlets={outlets} value={validOutletId} onChange={setOutletId} className="cp-picker-top" />
          )}

          <div className="cp-topbar-right">
            <button className="cp-btn cp-topbar-cta" onClick={() => navigate("/client/request-service")}>
              <HiOutlinePlus /> <span>Request service</span>
            </button>
            <NotificationsMenu iconOnly />
            <UserMenu
              user={me}
              onLogout={logout}
              actions={[{ label: "Profile", onClick: () => navigate("/client/profile") }]}
            />
          </div>
        </header>

        <main className="cp-content">
          <Outlet context={{ portal, outletId: validOutletId, setOutletId }} />
        </main>
      </div>
    </div>
  );
}

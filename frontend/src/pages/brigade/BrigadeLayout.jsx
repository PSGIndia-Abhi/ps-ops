import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  HiOutlineSquares2X2,
  HiOutlineClipboardDocumentList,
  HiOutlineCog6Tooth,
  HiOutlineCurrencyRupee,
  HiOutlineUserGroup,
  HiOutlineMapPin,
  HiOutlineDocumentMinus,
  HiOutlineDocumentText,
  HiOutlineBanknotes,
  HiOutlineArrowUpTray,
  HiOutlineReceiptPercent,
  HiOutlineChevronDown,
  HiOutlineBars3,
  HiOutlineArrowRightOnRectangle,
  HiOutlineArrowLeft,
} from "react-icons/hi2";
import logo from "../../assets/logo.png";
import useMe from "../../hooks/useMe";
import NotificationsMenu from "../../components/NotificationsMenu";
import UserMenu from "../../components/UserMenu";
import { brigadeRequest } from "./brigadeShared";
import "./brigade.css";

// Brigade Executive panel. Same shell classes as AdminLayout (scoped by the
// "bgl" class so the restyle stays inside this panel); the backend limits
// every list here to Brigade Group.
const MASTERS = {
  key: "masters",
  label: "Master Settings",
  icon: HiOutlineCog6Tooth,
  tone: "slate",
  children: [
    { path: "/brigade/masters", label: "Prices & BHK", icon: HiOutlineCurrencyRupee, exact: true },
    { path: "/brigade/masters/contacts", label: "Contacts", icon: HiOutlineUserGroup },
    { path: "/brigade/masters/locations", label: "Locations", icon: HiOutlineMapPin },
  ],
};

// Work flow: overview -> jobs -> services waiting for a PO -> POs -> billing
// -> issued invoices -> import; Master Settings last.
const NAV = [
  { path: "/brigade/dashboard", label: "Dashboard", icon: HiOutlineSquares2X2, tone: "indigo" },
  { path: "/brigade", label: "New Request", exact: true, icon: HiOutlineClipboardDocumentList, tone: "sky" },
  { path: "/brigade/no-po", label: "Services without PO", badge: "noPo", icon: HiOutlineDocumentMinus, tone: "orange" },
  { path: "/brigade/pos", label: "PO", icon: HiOutlineDocumentText, tone: "teal" },
  { path: "/brigade/billing", label: "Billing", icon: HiOutlineBanknotes, tone: "emerald" },
  { path: "/brigade/invoices", label: "Issued Invoices", icon: HiOutlineReceiptPercent, tone: "indigo" },
  { path: "/brigade/import", label: "Import", icon: HiOutlineArrowUpTray, tone: "pink" },
  MASTERS,
];

export default function BrigadeLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);
  const inMasters = location.pathname.startsWith("/brigade/masters");
  // Master Settings is open while one of its pages is showing, unless toggled.
  const [mastersToggle, setMastersToggle] = useState(null); // null = follow the page
  const mastersOpen = mastersToggle ?? inMasters;

  // How many services are waiting for a PO (the badge on "Services without PO"), refreshed per page.
  const [noPo, setNoPo] = useState(0);
  useEffect(() => {
    let live = true;
    brigadeRequest("/api/brigade/billing/unassigned-services")
      .then((list) => live && setNoPo(Array.isArray(list) ? list.length : 0))
      .catch(() => {});
    return () => { live = false; };
  }, [location.pathname]);
  const badgeOf = (item) => (item.badge === "noPo" && noPo > 0 ? (noPo > 99 ? "99+" : noPo) : null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function go(path) {
    setMenuOpen(false);
    navigate(path);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  // Pages opened from somewhere else (a job, the profile) get a Back button.
  const showBack = /^\/brigade\/(jobs\/|profile)/.test(location.pathname);
  function goBack() {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate("/brigade");
  }

  const isActive = (item) => {
    if (item.path === "/brigade") return location.pathname === "/brigade" || location.pathname.startsWith("/brigade/jobs");
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  };

  function navItem(item, onPick, sub = false) {
    const Icon = item.icon;
    const active = isActive(item);
    return (
      <button
        key={item.path}
        type="button"
        className={`nav-btn bgl-item ${sub ? "bgl-sub" : ""} ${item.tone || ""} ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={() => onPick(item.path)}
      >
        <span className="bgl-ico" aria-hidden="true"><Icon /></span>
        <span className="bgl-text">{item.label}</span>
        {badgeOf(item) && <span className="bgn-nav-badge" aria-label={`${noPo} waiting`}>{badgeOf(item)}</span>}
      </button>
    );
  }

  function navList(onPick) {
    return NAV.map((item) => {
      if (!item.children) return navItem(item, onPick);
      const Icon = item.icon;
      return (
        <div key={item.key} className={`bgl-group ${mastersOpen ? "open" : ""}`}>
          <button
            type="button"
            className={`nav-btn bgl-item ${item.tone} ${inMasters ? "parent-active" : ""}`}
            aria-expanded={mastersOpen}
            aria-controls="bgl-masters"
            onClick={() => setMastersToggle(!mastersOpen)}
          >
            <span className="bgl-ico" aria-hidden="true"><Icon /></span>
            <span className="bgl-text">{item.label}</span>
            <HiOutlineChevronDown className="bgl-chev" aria-hidden="true" />
          </button>
          {mastersOpen && (
            <div className="bgl-subs" id="bgl-masters">
              {item.children.map((c) => navItem(c, onPick, true))}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="app-shell bgl">
      <header className="app-header">
        <button type="button" className="header-left header-left-btn" onClick={() => navigate("/brigade/dashboard")}>
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">Brigade Panel</span>
        </button>

        <div className="header-right">
          <NotificationsMenu />
          <UserMenu
            user={user}
            onLogout={logout}
            actions={[{ label: "Profile", onClick: () => navigate("/brigade/profile") }]}
          />
        </div>
      </header>

      <div className="app-body">
        {!isMobile && (
          <aside className="sidebar bgl-sidebar">
            <nav className="nav" aria-label="Brigade">
              {navList(navigate)}
            </nav>
          </aside>
        )}

        <main className="main-content">
          {showBack && (
            <button type="button" className="bgl-back" onClick={goBack}>
              <HiOutlineArrowLeft aria-hidden="true" /> Back
            </button>
          )}
          <Outlet context={{ setActionsConfig: () => {} }} />
        </main>
      </div>

      {isMobile && menuOpen && (
        <div className="mobile-panel mobile-panel-menu bgl-mobile">
          {navList(go)}
          <button type="button" className="nav-btn bgl-item red" onClick={logout}>
            <span className="bgl-ico" aria-hidden="true"><HiOutlineArrowRightOnRectangle /></span>
            <span className="bgl-text">Logout</span>
          </button>
        </div>
      )}

      {isMobile && (
        <div className="mobile-tabbar">
          <button
            onClick={() => go("/brigade")}
            className={location.pathname === "/brigade" && !menuOpen ? "active" : ""}
          >
            <HiOutlineClipboardDocumentList aria-hidden="true" /> Requests
          </button>
          <button
            onClick={() => go("/brigade/masters")}
            className={inMasters && !menuOpen ? "active" : ""}
          >
            <HiOutlineCog6Tooth aria-hidden="true" /> Masters
          </button>
          <button onClick={() => setMenuOpen((open) => !open)} className={menuOpen ? "active" : ""}>
            <HiOutlineBars3 aria-hidden="true" /> Menu
          </button>
        </div>
      )}
    </div>
  );
}

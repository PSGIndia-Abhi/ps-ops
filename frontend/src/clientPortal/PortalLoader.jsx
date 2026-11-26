import logo from "../assets/logo.png";

// BestServe loader for the Client Portal: logo with a spinning ring, centred in the page area.
// `compact` = a shorter version for a list inside a card (the page header and filters stay visible).
export default function PortalLoader({ label = "Loading…", compact = false }) {
  return (
    <div className={`cp-page-loader ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <div className="cp-page-loader-mark">
        <span className="cp-page-loader-ring" aria-hidden="true" />
        <img src={logo} alt="" />
      </div>
      <span className="cp-page-loader-text">{label}</span>
    </div>
  );
}

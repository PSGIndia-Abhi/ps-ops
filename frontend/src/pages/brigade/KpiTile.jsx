// Summary tile used on the Brigade Flats board and Billing: coloured icon
// badge, label, big value, a short note and an optional progress bar.
const ICONS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  rupee: <path d="M6 4h12M6 9h12M14 4c3 0 3 10-6 10l8 7" />,
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13v4" />
      <path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" />
      <circle cx="16" cy="14.5" r="1.2" />
    </>
  ),
};

export default function KpiTile({ icon, tone = "blue", label, value, note, noteTone, progress }) {
  return (
    <div className={`bgk-tile ${tone}`}>
      <div className="bgk-top">
        <span className="bgk-label">{label}</span>
        <span className="bgk-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[icon]}
          </svg>
        </span>
      </div>
      <strong className="bgk-value">{value}</strong>
      {progress !== undefined && progress !== null && (
        <div className={`bgk-bar ${progress > 100 ? "over" : ""}`} role="img" aria-label={`${Math.round(progress)}%`}>
          <span style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      )}
      {note && <span className={`bgk-note ${noteTone || ""}`}>{note}</span>}
    </div>
  );
}

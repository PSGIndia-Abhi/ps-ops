// Small dependency-free SVG / HTML charts for the lead dashboards.
// Every value is also printed as text beside its mark, so nothing is only
// readable from a colour or by hovering.

const CHART_COLORS = ["#2563eb", "#7c3aed", "#0d9488", "#d97706", "#db2777", "#0891b2", "#64748b"];

/** `data`: [{ label, value }]. The ring draws itself in, one slice after another. */
export function Donut({ data, centerLabel = "Leads", size = 168 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="lm-donut">
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={`${centerLabel}: ${total} in total`}>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#eef1f7" strokeWidth="18" />
        {total > 0 &&
          data.map((d, i) => {
            const length = (d.value / total) * circumference;
            const rotation = (offset / circumference) * 360;
            offset += length;
            return (
              <circle
                key={d.label}
                className="seg"
                cx="80"
                cy="80"
                r={radius}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth="18"
                strokeDasharray={`${Math.max(0, length - 2)} ${circumference}`}
                strokeDashoffset={length}
                transform={`rotate(${rotation} 80 80)`}
                style={{ animationDelay: `${i * 110 + 150}ms` }}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </circle>
            );
          })}
        <g transform="rotate(90 80 80)">
          <text x="80" y="80" textAnchor="middle" className="lm-donut-center">
            {total}
          </text>
          <text x="80" y="98" textAnchor="middle" className="lm-donut-sub">
            {centerLabel}
          </text>
        </g>
      </svg>
      <ul className="lm-legend">
        {data.map((d, i) => (
          <li key={d.label} style={{ "--i": i }}>
            <i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span>{d.label}</span>
            <b>{d.value}</b>
            <em>{total ? Math.round((d.value / total) * 100) : 0}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars, longest value = full width. */
export function Bars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="lm-bars">
      {data.map((d, i) => (
        <div key={d.label} className="lm-bar" style={{ "--i": i }}>
          <span title={d.label}>{d.label}</span>
          <div className="lm-bar-track">
            <div className="lm-bar-fill" style={{ width: `${(d.value / max) * 100}%`, "--i": i }} />
          </div>
          <b>{d.value}</b>
        </div>
      ))}
    </div>
  );
}

/** A pipeline funnel: each step's bar is sized against the first step. */
export function Funnel({ steps }) {
  const top = Math.max(1, steps[0]?.value || 1);
  return (
    <div className="lm-funnel">
      {steps.map((s, i) => (
        <div key={s.label} className="lm-funnel-row" style={{ "--i": i }}>
          <span>{s.label}</span>
          <div className="lm-funnel-track">
            <div className={`lm-funnel-bar tone-${s.tone}`} style={{ width: `${Math.max(9, (s.value / top) * 100)}%`, "--i": i }}>
              {s.value}
            </div>
          </div>
          <em>{Math.round((s.value / top) * 100)}%</em>
        </div>
      ))}
    </div>
  );
}

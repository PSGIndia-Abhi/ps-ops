import { useEffect, useState } from "react";

// Animated donut chart: slices draw in around the ring on load (and when the numbers change), a
// 2px gap between slices, hover a slice or its legend row to see it in the centre. Every slice is
// named with its value and share in the legend (colour is never the only cue), and a hidden table
// carries the same numbers for screen readers.
// segments: [{ key, label, value, color, display? }]  (display = formatted value, e.g. "₹1.2L")

const R = 54;
const STROKE = 16;
const C = 2 * Math.PI * R;
const GAP = 2; // px of ring left empty between slices

export default function Donut({ segments, centerValue, centerLabel, title, emptyText = "Nothing yet" }) {
  const total = segments.reduce((t, s) => t + (Number(s.value) || 0), 0);
  const [hover, setHover] = useState(null);
  const sig = segments.map((s) => `${s.key}:${s.value}`).join("|");
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Draw in: new numbers start with empty slices, which grow to their lengths on the next frame
  // (CSS transition). `drawnSig` says which numbers have been drawn.
  const [drawnSig, setDrawnSig] = useState(null);
  const drawn = reduce || drawnSig === sig;
  useEffect(() => {
    if (reduce) return undefined;
    let inner;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setDrawnSig(sig));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [sig, reduce]);

  const shown = segments.filter((s) => Number(s.value) > 0);
  // Each slice starts where the previous one ended (offset = running total of lengths).
  const arcs = shown.reduce((list, s) => {
    const len = (Number(s.value) / total) * C;
    const offset = list.length ? list[list.length - 1].offset + list[list.length - 1].full : 0;
    return [...list, { ...s, full: len, len: shown.length > 1 ? Math.max(len - GAP, 0.5) : len, offset }];
  }, []);
  const active = hover ? segments.find((s) => s.key === hover) : null;
  const pct = (v) => (total ? Math.round((Number(v) * 100) / total) : 0);

  return (
    <div className="dn">
      <div className="dn-chart">
        <svg viewBox="0 0 140 140" role="img" aria-label={title || "Donut chart"}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="#eef2f7" strokeWidth={STROKE} />
          {arcs.map((a, i) => (
            <circle
              key={a.key}
              className={`dn-arc ${hover && hover !== a.key ? "dim" : ""}`}
              cx="70" cy="70" r={R} fill="none" stroke={a.color} strokeWidth={hover === a.key ? STROKE + 4 : STROKE}
              strokeDasharray={`${drawn ? a.len : 0} ${C}`}
              strokeDashoffset={-a.offset}
              transform="rotate(-90 70 70)"
              style={{ transitionDelay: `${i * 120}ms` }}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="dn-center">
          {active ? (
            <><b>{active.display ?? active.value}</b><span>{active.label} · {pct(active.value)}%</span></>
          ) : total ? (
            <><b>{centerValue}</b><span>{centerLabel}</span></>
          ) : <span>{emptyText}</span>}
        </div>
      </div>
      <ul className="dn-legend">
        {segments.map((s) => (
          <li key={s.key} className={hover === s.key ? "on" : ""} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
            <span className="dn-sw" style={{ background: s.color }} />
            <span className="dn-name">{s.label}</span>
            <span className="dn-val">{s.display ?? s.value}</span>
            <span className="dn-pct">{pct(s.value)}%</span>
          </li>
        ))}
      </ul>
      <table className="ad-sr-only">
        <caption>{title}</caption>
        <tbody>{segments.map((s) => <tr key={s.key}><th>{s.label}</th><td>{s.display ?? s.value}</td><td>{pct(s.value)}%</td></tr>)}</tbody>
      </table>
    </div>
  );
}

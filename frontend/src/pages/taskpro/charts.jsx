// TaskPro dashboard charts — small, dependency-free SVG/HTML charts.
//
// Every chart is interactive: hover or keyboard-focus a mark for a tooltip,
// click it to filter the whole dashboard (click again to clear). Every card
// has a type switcher (donut / pie / bars / columns / line / area, whichever
// suit its data) plus a plain-table view, so no value is only reachable by
// hovering and no series is identified by colour alone.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiActivity, FiAlertCircle, FiAlignLeft, FiBarChart2, FiDisc, FiList, FiPieChart, FiTrendingUp } from "react-icons/fi";
import { loadPrefs, updatePrefs } from "./prefs";

/* ---------------------------------------------------------------- tooltip */

/** One floating tooltip per chart. `show` takes a pointer/focus event (or
 *  explicit viewport coords) plus the tooltip body. */
function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, body) => {
    const r = e.currentTarget?.getBoundingClientRect?.();
    const x = e.clientX ?? (r ? r.left + r.width / 2 : 0);
    const y = e.clientY ?? (r ? r.top : 0);
    setTip({ x, y, body });
  };
  const showAt = (x, y, body) => setTip({ x, y, body });
  const hide = () => setTip(null);
  return { tip, show, showAt, hide };
}

export function ChartTip({ tip }) {
  if (!tip) return null;
  const host = document.querySelector(".tp-root") || document.body;
  const x = Math.min(Math.max(tip.x, 90), window.innerWidth - 90);
  return createPortal(
    <div className="tp-tip" style={{ left: x, top: tip.y }} role="tooltip">
      {tip.body}
    </div>,
    host,
  );
}

/** Tooltip body: the value leads, the label follows. `rows` is for
 *  multi-series readouts, each keyed with a short line in its colour. */
export function TipBody({ value, label, rows, hint }) {
  return (
    <>
      {value !== undefined && <strong className="tp-tip-value">{value}</strong>}
      {label && <span className="tp-tip-label">{label}</span>}
      {rows?.map((r) => (
        <span key={r.label} className="tp-tip-row">
          <i style={{ background: r.color }} />
          <strong>{r.value}</strong> {r.label}
        </span>
      ))}
      {hint && <small className="tp-tip-hint">{hint}</small>}
    </>
  );
}

const plural = (n, word = "task") => `${n} ${word}${n === 1 ? "" : "s"}`;
const sum = (parts) => parts.reduce((s, p) => s + p.value, 0);

/* ------------------------------------------------------------- chart card */

const TYPE_META = {
  donut: { label: "Donut", icon: FiDisc },
  pie: { label: "Pie", icon: FiPieChart },
  bar: { label: "Bars", icon: FiAlignLeft },
  column: { label: "Columns", icon: FiBarChart2 },
  line: { label: "Line", icon: FiTrendingUp },
  area: { label: "Area", icon: FiActivity },
  table: { label: "Table", icon: FiList },
};

/**
 * A dashboard card holding one chart. `types` lists the chart types that
 * suit this data (first = default); the chosen one is remembered per card
 * (`id`) in this browser. `table` ({ columns, rows }) adds a Table option.
 * `render(type)` draws the chart in the chosen type.
 */
export function ChartCard({ id, title, note, types, table, render, className = "" }) {
  const options = [...types, ...(table ? ["table"] : [])];
  const [saved, setSaved] = useState(() => loadPrefs().types?.[id]);
  const type = options.includes(saved) ? saved : options[0];

  const choose = (t) => {
    setSaved(t);
    updatePrefs((p) => ({ ...p, types: { ...p.types, [id]: t } }));
  };

  return (
    <section className={`tp-card tp-chart-card ${className}`}>
      <div className="tp-card-head">
        <div className="tp-chart-title">
          <h3>{title}</h3>
          {note && <small>{note}</small>}
        </div>
        {options.length > 1 && (
          <div className="tp-chart-types" role="radiogroup" aria-label={`${title}: chart type`}>
            {options.map((t) => {
              const Icon = TYPE_META[t].icon;
              return (
                <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? "on" : ""} onClick={() => choose(t)} title={TYPE_META[t].label}>
                  <Icon />
                  <span className="tp-sr">{TYPE_META[t].label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="tp-chart-body" key={type}>
        {type === "table" ? <DataTable {...table} /> : render(type)}
      </div>
    </section>
  );
}

function DataTable({ columns, rows }) {
  if (!rows.length) return <p className="tp-desc muted">No data.</p>;
  return (
    <div className="tp-dtable-wrap">
      <table className="tp-dtable">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? "num" : ""}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key ?? i}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "num" : ""}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartEmpty({ text = "Nothing to show for this selection." }) {
  return <p className="tp-chart-empty">{text}</p>;
}

/* ------------------------------------------------------- category chart */

/**
 * One set of categories drawn as any categorical type. `items`:
 * [{ key, label, short?, phone?, sub?, color, value | parts, flag?, clickable?, tipLabel? }]
 * — `phone` is a shorter column label used only on phone-width screens.
 * — `parts` (stacked) is only used by the bar/column types.
 */
export function CategoryChart({ type, items, selected, onSelect, legend, unit }) {
  if (type === "donut" || type === "pie") {
    return <DonutChart pie={type === "pie"} segments={items.map((i) => ({ key: i.key, label: i.label, color: i.color, value: i.value ?? sum(i.parts) }))} selected={selected} onSelect={onSelect} unit={unit} />;
  }
  const withParts = items.map((i) => ({ ...i, parts: i.parts || [{ key: i.key, label: i.label, color: i.color, value: i.value }] }));
  if (type === "column") {
    return (
      <ColumnChart
        columns={withParts.map((i) => ({ key: i.key, label: i.short || i.label, phone: i.phone, sub: i.sub, tipLabel: i.tipLabel || i.label, parts: i.parts, clickable: i.clickable }))}
        selected={selected}
        onSelect={onSelect}
        legend={legend}
      />
    );
  }
  return <BarList rows={withParts} selected={selected} onSelect={onSelect} legend={legend} />;
}

function Legend({ items }) {
  if (!items || items.length < 2) return null;
  return (
    <div className="tp-chart-legend">
      {items.map((l) => (
        <span key={l.label}>
          <i className={l.line ? "line" : ""} style={{ background: l.color }} /> {l.label}
          {l.total !== undefined && <strong>{l.total}</strong>}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ donut / pie */

/**
 * Part-to-whole donut, or a full pie. `segments`: [{ key, label, color, value }].
 * Hovering a slice or legend row previews it; clicking toggles it as a
 * filter (`selected` / `onSelect`).
 */
export function DonutChart({ segments, selected, onSelect, unit = "task", pie = false }) {
  const [hover, setHover] = useState(null);
  const { tip, show, hide } = useTip();
  const total = segments.reduce((s, x) => s + x.value, 0);
  // A pie is the same stroke trick with the ring as thick as its radius.
  const R = pie ? 33 : 54;
  const W = pie ? 66 : 16;
  const C = 2 * Math.PI * R;
  const visible = segments.filter((s) => s.value > 0);
  const gap = visible.length > 1 ? (pie ? 0.8 : 2) : 0;

  const arcs = visible.reduce((acc, s) => {
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].len : 0;
    return [...acc, { ...s, start, len: total ? (s.value / total) * C : 0 }];
  }, []);

  const focusKey = hover || selected;
  const focus = segments.find((s) => s.key === focusKey);
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  const pick = (key) => onSelect?.(selected === key ? null : key);

  return (
    <div className="tp-donut-wrap">
      <div className={`tp-donut ${pie ? "pie" : ""}`}>
        <svg viewBox="0 0 140 140" role="img" aria-label={`${plural(total, unit)} by category`}>
          {!pie && <circle cx="70" cy="70" r={R} className="tp-donut-track" />}
          {arcs.map((a, i) => (
            <circle
              key={a.key}
              cx="70"
              cy="70"
              r={R}
              className={`tp-donut-seg ${focusKey && focusKey !== a.key ? "dim" : ""} ${hover === a.key && !pie ? "hot" : ""}`}
              stroke={a.color}
              strokeDasharray={`${Math.max(0.01, a.len - gap)} ${C}`}
              strokeDashoffset={-a.start}
              style={{ "--i": i, "--w": W }}
              onPointerEnter={() => setHover(a.key)}
              onPointerMove={(e) => show(e, <TipBody value={plural(a.value, unit)} label={`${a.label} · ${pct(a.value)}%`} hint={selected === a.key ? "Click to clear" : "Click to filter"} />)}
              onPointerLeave={() => {
                setHover(null);
                hide();
              }}
              onClick={() => pick(a.key)}
            />
          ))}
        </svg>
        {!pie && (
          <div className="tp-donut-center" aria-live="polite">
            <strong>{focus ? focus.value : total}</strong>
            <span>{focus ? `${focus.label} · ${pct(focus.value)}%` : total === 1 ? unit : `${unit}s`}</span>
          </div>
        )}
      </div>
      <ul className="tp-legend">
        {segments.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className={`${selected === s.key ? "on" : ""} ${selected && selected !== s.key ? "dim" : ""} ${hover === s.key ? "hot" : ""}`}
              aria-pressed={selected === s.key}
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(s.key)}
              onBlur={() => setHover(null)}
              onClick={() => pick(s.key)}
            >
              <span className="tp-swatch" style={{ background: s.color }} />
              <span className="tp-legend-label">{s.label}</span>
              <strong>{s.value}</strong>
              <em>{pct(s.value)}%</em>
            </button>
          </li>
        ))}
      </ul>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------------------------------------------------------- column chart */

/**
 * Vertical columns. `columns`: [{ key, label, sub?, tipLabel?, parts:
 * [{ key, label, color, value }], clickable? }]. `layout` "stack" piles the
 * parts (total on the cap); "group" sets them side by side. Without
 * `onSelect` the columns are read-only (hover still shows the tooltip).
 */
export function ColumnChart({ columns, selected, onSelect, legend, layout = "stack", height = 190, labelEvery = 1 }) {
  const { tip, show, hide } = useTip();
  const max = Math.max(1, ...columns.map((c) => (layout === "group" ? Math.max(0, ...c.parts.map((p) => p.value)) : sum(c.parts))));
  const n = columns.length;
  return (
    <>
      <Legend items={legend} />
      <div className={`tp-vcols ${layout}`} style={{ height }}>
        {columns.map((c, i) => {
          const total = sum(c.parts);
          const on = selected === c.key;
          const selectable = onSelect && c.clickable !== false;
          const body = (
            <TipBody
              value={c.parts.length > 1 ? undefined : plural(total)}
              label={c.tipLabel || c.label}
              rows={c.parts.length > 1 ? c.parts.map((p) => ({ label: p.label, value: p.value, color: p.color })) : undefined}
              hint={selectable ? (on ? "Click to clear" : "Click to filter") : undefined}
            />
          );
          const Tag = selectable ? "button" : "div";
          return (
            <Tag
              key={c.key}
              {...(selectable ? { type: "button", "aria-pressed": on, onClick: () => onSelect(on ? null : c.key) } : { tabIndex: 0, role: "img" })}
              className={`tp-vcol ${on ? "on" : ""} ${selected && !on ? "dim" : ""} ${selectable ? "" : "static"}`}
              aria-label={`${c.tipLabel || c.label}: ${c.parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}
              onPointerMove={(e) => show(e, body)}
              onPointerLeave={hide}
              onFocus={(e) => show(e, body)}
              onBlur={hide}
            >
              <span className="tp-vcol-val">{layout === "stack" ? total : ""}</span>
              <span className="tp-vcol-track">
                {layout === "group" ? (
                  c.parts.map((p) => <span key={p.key} className="tp-vcol-bar" style={{ height: `${(p.value / max) * 100}%`, background: p.color, "--i": i }} />)
                ) : (
                  <span className="tp-vcol-stack" style={{ height: `${(total / max) * 100}%`, "--i": i }}>
                    {c.parts.map((p) => (p.value > 0 ? <span key={p.key} style={{ flexGrow: p.value, background: p.color }} /> : null))}
                  </span>
                )}
              </span>
              <span className="tp-vcol-label">
                {i % labelEvery !== (n - 1) % labelEvery ? " " : c.phone ? (
                  <>
                    <span className="tp-vcol-full">{c.label}</span>
                    <span className="tp-vcol-short">{c.phone}</span>
                  </>
                ) : (
                  c.label
                )}
              </span>
              {c.sub && <small className="tp-vcol-sub">{c.sub}</small>}
            </Tag>
          );
        })}
      </div>
      <ChartTip tip={tip} />
    </>
  );
}

/* ------------------------------------------------------ horizontal bars */

/**
 * Ranked horizontal bars, optionally stacked. `rows`: [{ key, label, sub,
 * parts: [{ key, label, color, value }], flag, clickable }] — `flag` is a
 * small attention note after the total (e.g. "2 overdue").
 */
export function BarList({ rows, selected, onSelect, legend }) {
  const { tip, show, hide } = useTip();
  const totals = rows.map((r) => sum(r.parts));
  const max = Math.max(1, ...totals);
  return (
    <>
      <Legend items={legend} />
      <div className="tp-bars-h">
        {rows.map((r, i) => {
          const total = totals[i];
          const on = selected === r.key;
          const selectable = onSelect && r.clickable !== false;
          const body = (
            <TipBody
              value={plural(total)}
              label={r.label}
              rows={r.parts.length > 1 ? r.parts.map((p) => ({ label: p.label, value: p.value, color: p.color })) : undefined}
              hint={selectable ? (on ? "Click to clear" : "Click to filter") : undefined}
            />
          );
          return (
            <button
              key={r.key}
              type="button"
              className={`tp-hbar ${on ? "on" : ""} ${selected && !on ? "dim" : ""}`}
              style={{ "--i": i }}
              aria-pressed={on}
              aria-disabled={!selectable}
              aria-label={`${r.label}: ${plural(total)}${r.flag ? `, ${r.flag}` : ""}`}
              onPointerMove={(e) => show(e, body)}
              onPointerLeave={hide}
              onFocus={(e) => show(e, body)}
              onBlur={hide}
              onClick={() => selectable && onSelect(on ? null : r.key)}
            >
              <span className="tp-hbar-name">
                <strong>{r.label}</strong>
                {r.sub && <small>{r.sub}</small>}
              </span>
              <span className="tp-hbar-track">
                {r.parts.map((p) => (p.value > 0 ? <span key={p.key} className="tp-hbar-seg" style={{ width: `${(p.value / max) * 100}%`, background: p.color }} /> : null))}
              </span>
              <span className="tp-hbar-val">{total}</span>
              <span className="tp-hbar-flag">
                {r.flag && (
                  <>
                    <FiAlertCircle /> {r.flag}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <ChartTip tip={tip} />
    </>
  );
}

/* ------------------------------------------------------ line / area chart */

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Clean y-axis: a max of 1/2/5 x 10^n and 3-5 whole-number ticks. */
function niceScale(maxValue) {
  const max = Math.max(1, maxValue);
  if (max <= 4) return { max, ticks: Array.from({ length: max + 1 }, (_, i) => i) };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  return { max: top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}

/**
 * Multi-series line chart over days (`area` adds a 10% wash under each
 * line). `days`: [{ key, label, tipLabel }]; `series`: [{ key, label,
 * color, values }]. A crosshair snaps to the nearest day and the tooltip
 * lists every series there; arrow keys move it when the chart has focus.
 */
export function LineChart({ days, series, height = 210, area = false }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const width = useWidth(wrapRef);
  const [idx, setIdx] = useState(null);
  const { tip, showAt, hide } = useTip();

  const pad = { l: 30, r: 12, t: 12, b: 28 };
  const n = days.length;
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const { max, ticks } = niceScale(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i) => pad.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => pad.t + h - (v / max) * h;
  const labelEvery = n > 10 ? 2 : 1;
  const linePath = (s) => s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");

  function point(i) {
    setIdx(i);
    const rect = svgRef.current.getBoundingClientRect();
    showAt(rect.left + x(i), rect.top + pad.t, <TipBody label={days[i].tipLabel || days[i].label} rows={series.map((s) => ({ label: s.label, value: s.values[i], color: s.color }))} />);
  }
  function onMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - pad.l) / Math.max(1, w)) * (n - 1));
    point(Math.min(n - 1, Math.max(0, i)));
  }
  function clear() {
    setIdx(null);
    hide();
  }
  function onKey(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const cur = idx ?? (e.key === "ArrowLeft" ? n : -1);
    point(Math.min(n - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1))));
  }

  return (
    <>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color, line: true, total: s.values.reduce((a, b) => a + b, 0) }))} />
      <div ref={wrapRef} className="tp-line-wrap">
        {width > 0 && (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            className="tp-line"
            tabIndex={0}
            role="img"
            aria-label={`${series.map((s) => s.label).join(" and ")} per day. Use the arrow keys to read each day.`}
            onPointerMove={onMove}
            onPointerLeave={clear}
            onBlur={clear}
            onKeyDown={onKey}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="tp-grid" />
                <text x={pad.l - 8} y={y(t)} className="tp-axis" textAnchor="end" dominantBaseline="middle">
                  {t}
                </text>
              </g>
            ))}
            {days.map((d, i) =>
              i % labelEvery === (n - 1) % labelEvery ? (
                <text key={d.key} x={x(i)} y={height - 8} className="tp-axis" textAnchor="middle">
                  {d.label}
                </text>
              ) : null,
            )}
            {area && series.map((s) => <path key={`a-${s.key}`} d={`${linePath(s)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={s.color} opacity="0.1" />)}
            {idx !== null && <line x1={x(idx)} x2={x(idx)} y1={pad.t} y2={pad.t + h} className="tp-crosshair" />}
            {series.map((s) => (
              <path key={s.key} d={linePath(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s) => (
              <circle key={s.key} cx={x(n - 1)} cy={y(s.values[n - 1])} r="4" fill={s.color} className="tp-dot" />
            ))}
            {idx !== null && series.map((s) => <circle key={s.key} cx={x(idx)} cy={y(s.values[idx])} r="5" fill={s.color} className="tp-dot" />)}
          </svg>
        )}
      </div>
      <ChartTip tip={tip} />
    </>
  );
}

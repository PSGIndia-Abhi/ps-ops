import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brigadeRequest, formatInr, gstOn } from "./brigadeShared";
import "./brigade.css";

// Brigade overview (/brigade/dashboard). A dark hero with the headline numbers, then a bento grid:
// work trend, where the work stands, quick action tiles, properties, collection, service mix.
// Filters (period, property, service, PO, status) scope everything and live in the URL.
// Service values are excl. GST; invoice and PO amounts incl. GST.
// Colours (validated, fixed meaning everywhere): blue = invoiced / on a PO, aqua = ready to invoice /
// collected, orange = without a PO, grey = not done yet.

const C = { blue: "#2563eb", aqua: "#0f9488", orange: "#e8772e", grey: "#cbd5e1", grid: "#eef2f7", axis: "#94a3b8" };

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function presetRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fy = m >= 3 ? y : y - 1;
  switch (key) {
    case "this_month": return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case "last_month": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "last_3": return [iso(new Date(y, m - 2, 1)), iso(new Date(y, m + 1, 0))];
    case "this_quarter": { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]; }
    case "this_fy": return [`${fy}-04-01`, `${fy + 1}-03-31`];
    case "last_fy": return [`${fy - 1}-04-01`, `${fy}-03-31`];
    default: return [null, null];
  }
}
const PRESETS = [
  ["all", "All time"], ["this_month", "This month"], ["last_month", "Last month"], ["last_3", "Last 3 months"],
  ["this_quarter", "This quarter"], ["this_fy", "This FY"], ["last_fy", "Last FY"], ["custom", "Custom…"],
];

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
/** ₹1.19 Cr, ₹31.2 L, ₹12.5k - the full amount goes in the title. */
function money(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
}
const num = (n) => (Number(n) || 0).toLocaleString("en-IN");
const monthLabel = (ym) => { const [y, m] = String(ym).split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" }); };

export default function BrigadeHome() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const preset = params.get("period") || "all";
  const customFrom = params.get("from") || "";
  const customTo = params.get("to") || "";
  const props = useMemo(() => (params.get("properties") || "").split(",").filter(Boolean), [params]);
  const svcs = useMemo(() => (params.get("services") || "").split(",").filter(Boolean), [params]);
  const po = params.get("po") || "";
  const status = params.get("status") || "";
  const [from, to] = preset === "custom" ? [customFrom || null, customTo || null] : presetRange(preset);

  const [options, setOptions] = useState({ properties: [], services: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTable, setShowTable] = useState(false);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || (Array.isArray(v) && !v.length)) next.delete(k);
      else next.set(k, Array.isArray(v) ? v.join(",") : v);
    }
    setLoading(true);
    setParams(next, { replace: true });
  };
  const filtered = preset !== "all" || props.length || svcs.length || po || status;

  useEffect(() => { brigadeRequest("/api/brigade/dashboard/options").then(setOptions).catch(() => {}); }, []);

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (props.length) query.set("company_ids", props.join(","));
  if (svcs.length) query.set("services", svcs.join(","));
  if (po) query.set("po", po);
  if (status) query.set("status", status);
  const qs = query.toString();

  useEffect(() => {
    let live = true;
    brigadeRequest(`/api/brigade/dashboard${qs ? `?${qs}` : ""}`)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((err) => live && setError(err.message || "Failed to load the dashboard"))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [qs]);

  const t = data?.totals;
  const ps = data?.pos?.summary;
  const periodText = preset === "custom" ? `${customFrom || "…"} to ${customTo || "…"}` : PRESETS.find(([k]) => k === preset)?.[1] || "All time";
  const readyIncl = t ? gstOn(t.ready_value).total : 0;

  return (
    <div className="bg-page bdz">
      {/* ---------------- hero ---------------- */}
      <section className="bdz-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Brigade · Deep clean</span>
            <h1>Overview</h1>
            <p>{periodText} · {props.length ? `${props.length} propert${props.length === 1 ? "y" : "ies"}` : "all properties"}</p>
          </div>
          <div className="bdz-filters" role="toolbar" aria-label="Filters">
            <SinglePick icon="calendar" label="Period" items={PRESETS} value={preset} onChange={(v) => set({ period: v === "all" ? null : v, from: null, to: null })} />
            {preset === "custom" && (
              <span className="bdz-range">
                <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => set({ from: e.target.value })} aria-label="From" />
                <span>–</span>
                <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="To" />
              </span>
            )}
            <MultiPick icon="home" all="All properties" items={options.properties.map((p) => ({ value: p.company_id, label: p.name }))} value={props} onChange={(v) => set({ properties: v })} />
            <MultiPick icon="tool" all="All services" items={options.services.map((s) => ({ value: s, label: s }))} value={svcs} onChange={(v) => set({ services: v })} />
            <Seg value={po} onChange={(v) => set({ po: v })} items={[["", "All"], ["with", "On PO"], ["without", "No PO"]]} label="PO" />
            <Seg value={status} onChange={(v) => set({ status: v })} items={[["", "All"], ["done", "Done"], ["open", "Open"]]} label="Status" />
            {filtered && <button type="button" className="bdz-clear" onClick={() => { setLoading(true); setParams({}, { replace: true }); }}>Clear</button>}
          </div>
        </div>

        {!data ? <div className="bdz-hero-kpis">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="bdz-skel dark" />)}</div> : (
          <div className={`bdz-hero-kpis ${loading ? "busy" : ""}`}>
            <div className="bdz-ring-kpi">
              <Ring value={pct(t.completed, t.booked)} />
              <div>
                <span>Services completed</span>
                <b>{num(t.completed)}<small> / {num(t.booked)}</small></b>
                <em>{num(t.flats)} flats</em>
              </div>
            </div>
            <HeroStat label="Work value completed" value={money(t.completed_value)} title={formatInr(t.completed_value)} sub="excl. GST" />
            <HeroStat label="Total PO value" value={money(ps.po_amount)} title={formatInr(ps.po_amount)} sub={`${num(ps.count)} POs · incl. GST`} accent="aqua" />
            <HeroStat label="PO balance remaining" value={money(ps.balance)} title={formatInr(ps.balance)} sub={`${money(ps.invoiced)} invoiced · ${pct(ps.invoiced, ps.po_amount)}% used`} accent="blue" />
            <HeroStat label="Outstanding" value={money(t.outstanding)} title={formatInr(t.outstanding)} sub={t.overdue ? `${money(t.overdue)} overdue` : `${money(t.collected)} collected`} accent={t.overdue ? "red" : ""} />
          </div>
        )}
      </section>

      {error && <div className="bg-error">{error}</div>}
      {data?.data_issues?.future_dated > 0 && (
        <div className="bdz-note" role="status">
          <Icon name="alert" />
          <span><b>{data.data_issues.future_dated}</b> service{data.data_issues.future_dated === 1 ? " is" : "s are"} dated more than a month ahead (e.g. year 3036) and left out of the trend. Correct the dates in the tracker / bookings.</span>
        </div>
      )}

      {!data ? <Skeleton /> : (
        <div className={`bdz-grid ${loading ? "busy" : ""}`} aria-busy={loading}>
          {/* action tiles */}
          <Tile tone="orange" icon="clock" label="Waiting for a PO" value={num(t.no_po_completed)} sub={`${money(t.no_po_completed_value)} of completed work`}
            action={t.no_po_completed ? ["Add to a PO", () => navigate("/brigade/no-po")] : null} />
          <Tile tone="aqua" icon="receipt" label="Ready to invoice" value={num(t.ready)} sub={`services · ${money(readyIncl)}`}
            action={t.ready ? ["Generate invoices", () => navigate("/brigade/billing")] : null} />
          <Tile tone="blue" icon="file" label="Purchase orders" value={num(ps.count)} sub={`${money(ps.invoiced)} invoiced · ${pct(ps.invoiced, ps.po_amount)}% used`}
            action={["Open POs", () => navigate("/brigade/pos")]} />
          <Tile tone="violet" icon="building" label="Properties" value={num(data.properties.length)} sub={`${num(t.flats)} flats${t.pending_flats ? ` · ${num(t.pending_flats)} pending` : ""}`} />

          {/* trend */}
          <Panel className="span-8" title="Completed services" sub="By month · on a PO vs waiting for a PO"
            right={<Legend items={[[C.blue, "On a PO"], [C.orange, "Waiting for a PO"]]} />}>
            {!data.months.some((m) => m.completed_po || m.completed_no_po) ? <Empty /> : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.months} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bdzBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={C.blue} stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="bdzOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.orange} stopOpacity={0.35} /><stop offset="100%" stopColor={C.orange} stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} minTickGap={14} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip unit="services" />} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="completed_po" name="On a PO" stackId="s" stroke={C.blue} strokeWidth={2} fill="url(#bdzBlue)" activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                  <Area type="monotone" dataKey="completed_no_po" name="Waiting for a PO" stackId="s" stroke={C.orange} strokeWidth={2} fill="url(#bdzOrange)" activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* pipeline donut */}
          <Pipeline t={t} />

          {/* properties leaderboard */}
          <Panel className="span-8" title="Properties" sub="Click a property to filter the whole page"
            right={<Legend items={[[C.blue, "Invoiced"], [C.aqua, "Ready"], [C.orange, "No PO"]]} />}>
            {!data.properties.length ? <Empty /> : (
              <div className="bdz-props">
                {[...data.properties].sort((a, b) => b.completed_value - a.completed_value).map((p) => {
                  const on = props.length === 1 && props[0] === p.company_id;
                  const done = pct(p.completed, p.booked);
                  const total = p.invoiced_value + p.ready_value + p.no_po_completed_value || 1;
                  return (
                    <button key={p.company_id || p.property} type="button" className={`bdz-prop ${on ? "on" : ""}`}
                      onClick={() => p.company_id && set({ properties: on ? [] : [p.company_id] })}>
                      <span className="bdz-avatar" aria-hidden="true">{initials(p.property)}</span>
                      <span className="bdz-prop-name">
                        <strong>{p.property}</strong>
                        <small>{num(p.flats)} flats · {num(p.completed)}/{num(p.booked)} done{p.pending_flats ? ` · ${p.pending_flats} pending` : ""}</small>
                      </span>
                      <span className="bdz-prop-bar" title={`Invoiced ${money(p.invoiced_value)} · Ready ${money(p.ready_value)} · No PO ${money(p.no_po_completed_value)}`}>
                        <i style={{ width: `${(p.invoiced_value / total) * 100}%`, background: C.blue }} />
                        <i style={{ width: `${(p.ready_value / total) * 100}%`, background: C.aqua }} />
                        <i style={{ width: `${(p.no_po_completed_value / total) * 100}%`, background: C.orange }} />
                      </span>
                      <span className="bdz-prop-pct">{done}%</span>
                      <span className="bdz-prop-val" title={formatInr(p.completed_value)}>{money(p.completed_value)}</span>
                      {p.no_po_completed > 0 ? <span className="bdz-badge orange">{p.no_po_completed} no PO</span> : <span className="bdz-badge green">All on PO</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <div className="span-4 bdz-stack">
            <Collections data={data} t={t} readyIncl={readyIncl} navigate={navigate} />
            <Panel title="Service mix" sub="Services booked">
              {!data.service_mix.length ? <Empty /> : (
                <div className="bdz-mix">
                  {data.service_mix.slice(0, 7).map((s) => {
                    const max = data.service_mix[0]?.count || 1;
                    return (
                      <div key={s.service} className="bdz-mix-row" title={`${s.service}: ${num(s.count)} booked, ${num(s.completed)} done, ${formatInr(s.value)}`}>
                        <div><span>{s.service}</span><b>{num(s.count)}</b></div>
                        <span className="bdz-mix-bar"><i style={{ width: `${(s.count / max) * 100}%` }} /></span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          <section className="span-12 bdz-panel">
            <button type="button" className="bdz-toggle" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable}>
              <span>Detailed table by property</span><i aria-hidden="true">{showTable ? "Hide ▴" : "Show ▾"}</i>
            </button>
            {showTable && <PropertyTable data={data} t={t} />}
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- pieces ---------------- */

const initials = (name) => String(name || "?").replace(/^brigade\s+/i, "").trim().slice(0, 2).toUpperCase();

const ICONS = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
  rupee: <path d="M7 4h10M7 8h10M13 21 7 13h2a4 4 0 0 0 0-8" />,
};
function Icon({ name }) {
  return <svg className="bdz-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>;
}

function Ring({ value }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(value, 100));
  return (
    <svg className="bdz-ring" viewBox="0 0 76 76" role="img" aria-label={`${v}% completed`}>
      <defs><linearGradient id="bdzRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#2563eb" /></linearGradient></defs>
      <circle className="bdz-ring-track" cx="38" cy="38" r={r} fill="none" stroke="#e8eef7" strokeWidth="8" />
      <circle cx="38" cy="38" r={r} fill="none" stroke="url(#bdzRing)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      <text x="38" y="43" textAnchor="middle">{v}%</text>
    </svg>
  );
}

function HeroStat({ label, value, sub, title, accent = "" }) {
  return (
    <div className={`bdz-hstat ${accent}`}>
      <span>{label}</span>
      <b title={title}>{value}</b>
      <em>{sub}</em>
    </div>
  );
}

function Tile({ tone, icon, label, value, sub, action = null }) {
  return (
    <div className={`bdz-tile span-3 ${tone}`}>
      <div className="bdz-tile-top">
        <span className="bdz-tile-icon"><Icon name={icon} /></span>
        <span className="bdz-tile-label">{label}</span>
      </div>
      <b>{value}</b>
      <span className="bdz-tile-sub">{sub}</span>
      {action && <button type="button" className="bdz-tile-act" onClick={action[1]}>{action[0]} <span aria-hidden="true">→</span></button>}
    </div>
  );
}

function Panel({ title, sub, right = null, className = "", children }) {
  return (
    <section className={`bdz-panel ${className}`}>
      <div className="bdz-panel-head">
        <div><h3>{title}</h3>{sub && <span>{sub}</span>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty() {
  return <div className="bdz-empty">Nothing in this view</div>;
}

function Pipeline({ t }) {
  const notDone = Math.max(0, t.booked - t.completed);
  const parts = [
    { key: "inv", label: "Invoiced", color: C.blue, value: t.invoiced_value, count: t.invoiced_services || 0 },
    { key: "ready", label: "Ready to invoice", color: C.aqua, value: t.ready_value, count: t.ready || 0 },
    { key: "nopo", label: "Waiting for a PO", color: C.orange, value: t.no_po_completed_value, count: t.no_po_completed || 0 },
    { key: "open", label: "Not done yet", color: C.grey, value: null, count: notDone },
  ];
  const total = parts.reduce((s, p) => s + p.count, 0);
  return (
    <Panel className="span-4" title="Where the work stands" sub={`${num(t.booked)} services booked`}>
      {!total ? <Empty /> : (
        <>
          <div className="bdz-donut">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={parts.filter((p) => p.count)} dataKey="count" nameKey="label" innerRadius={62} outerRadius={86} paddingAngle={2} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270}>
                  {parts.filter((p) => p.count).map((p) => <Cell key={p.key} fill={p.color} />)}
                </Pie>
                <Tooltip content={<PieTip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="bdz-donut-mid"><b>{pct(t.completed, t.booked)}%</b><span>completed</span></div>
          </div>
          <div className="bdz-pipe-list">
            {parts.map((p) => (
              <div key={p.key}>
                <i style={{ background: p.color }} />
                <span>{p.label}</span>
                <b>{num(p.count)}</b>
                <small>{p.value !== null ? money(p.value) : `${pct(p.count, total)}%`}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function PieTip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bdz-tip">
      <div className="bdz-tip-row"><i style={{ background: p.payload.color }} /><b>{num(p.value)}</b><span>{p.name} · {pct(p.value, total)}%</span></div>
    </div>
  );
}

function Collections({ data, t, readyIncl, navigate }) {
  const ageMax = Math.max(...data.ageing.map((a) => a.amount), 1);
  return (
    <Panel title="Billing & collection" sub="incl. GST">
      {!t.invoices ? (
        <div className="bdz-coll-empty">
          <span className="bdz-coll-icon" aria-hidden="true"><Icon name="rupee" /></span>
          <strong>No Brigade invoices yet</strong>
          <p>{t.ready ? `${num(t.ready)} services (${money(readyIncl)}) are ready to invoice.` : "Invoices made from POs show here with their collection."}</p>
          {t.ready > 0 && <button type="button" className="bdz-btn" onClick={() => navigate("/brigade/billing")}>Generate invoices</button>}
        </div>
      ) : (
        <>
          <div className="bdz-coll-nums">
            <div><span>Invoiced</span><b title={formatInr(t.invoiced)}>{money(t.invoiced)}</b><small>{num(t.invoices)} invoices</small></div>
            <div><span>Collected</span><b title={formatInr(t.collected)}>{money(t.collected)}</b><small>{pct(t.collected, t.invoiced)}%</small></div>
            <div className={t.overdue ? "bad" : ""}><span>Outstanding</span><b title={formatInr(t.outstanding)}>{money(t.outstanding)}</b><small>{t.overdue ? `${money(t.overdue)} overdue` : "none overdue"}</small></div>
          </div>
          <div className="bdz-coll-bar" title={`Collected ${pct(t.collected, t.invoiced)}%`}><i style={{ width: `${Math.min(pct(t.collected, t.invoiced), 100)}%` }} /></div>
          <div className="bdz-age">
            {data.ageing.map((a, i) => (
              <div key={a.bucket} className="bdz-age-row" title={`${a.bucket} days: ${formatInr(a.amount)} (${a.count})`}>
                <span>{a.bucket} d</span>
                <span className="bdz-age-bar"><i style={{ width: `${(a.amount / ageMax) * 100}%`, opacity: 0.45 + i * 0.18 }} /></span>
                <b>{money(a.amount)}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function Legend({ items }) {
  return <div className="bdz-legend">{items.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;
}

function Tip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const sum = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="bdz-tip">
      <div className="bdz-tip-title">{monthLabel(label || payload[0]?.payload?.month)}</div>
      {payload.map((p) => <div key={p.dataKey} className="bdz-tip-row"><i style={{ background: p.stroke || p.color }} /><b>{num(p.value)}</b><span>{p.name}</span></div>)}
      {payload.length > 1 && <div className="bdz-tip-total"><b>{num(sum)}</b><span>{unit} completed</span></div>}
    </div>
  );
}

function PropertyTable({ data, t }) {
  return (
    <div className="bg-table-wrap">
      <table className="bgb-ledger bdx-table">
        <thead>
          <tr>
            <th>Property</th><th className="num">Flats</th><th className="num">Booked</th><th className="num">Completed</th>
            <th className="num">Value</th><th className="num">No PO</th><th className="num">Ready to invoice</th>
            <th className="num">Invoiced</th><th className="num">Collected</th><th className="num">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {data.properties.map((p) => (
            <tr key={p.company_id || p.property}>
              <td><strong>{p.property}</strong></td>
              <td className="num">{num(p.flats)}</td>
              <td className="num">{num(p.booked)}</td>
              <td className="num">{num(p.completed)}</td>
              <td className="num">{formatInr(p.completed_value)}</td>
              <td className="num">{num(p.no_po_completed)}</td>
              <td className="num">{formatInr(gstOn(p.ready_value).total)}</td>
              <td className="num">{formatInr(p.invoiced)}</td>
              <td className="num">{formatInr(p.collected)}</td>
              <td className="num">{formatInr(p.outstanding)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td><td className="num">{num(t.flats)}</td><td className="num">{num(t.booked)}</td><td className="num">{num(t.completed)}</td>
            <td className="num">{formatInr(t.completed_value)}</td><td className="num">{num(t.no_po_completed)}</td><td className="num">{formatInr(gstOn(t.ready_value).total)}</td>
            <td className="num">{formatInr(t.invoiced)}</td><td className="num">{formatInr(t.collected)}</td><td className="num">{formatInr(t.outstanding)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Dropdown with check boxes: none ticked = all. */
// Closes a popover on an outside click or Esc.
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return [open, setOpen, ref];
}

const Chevron = () => (
  <svg className="bdz-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);
const Tick = () => (
  <svg className="bdz-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

// One choice from a short list (the period).
function SinglePick({ icon, label, items, value, onChange }) {
  const [open, setOpen, ref] = usePopover();
  const shown = items.find(([k]) => k === value)?.[1] || items[0][1];
  return (
    <div className="bdz-pick" ref={ref}>
      <button type="button" className={`bdz-chip ${open ? "open" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${shown}`} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} />
        <span>{shown}</span>
        <Chevron />
      </button>
      {open && (
        <div className="bdz-pop bdz-pop-single" role="listbox" aria-label={label}>
          <div className="bdz-pop-list">
            {items.map(([k, l]) => (
              <button key={k} type="button" role="option" aria-selected={k === value} className={`bdz-opt ${k === value ? "on" : ""}`} onClick={() => { onChange(k); setOpen(false); }}>
                <span>{l.replace(/…$/, "")}</span>
                {k === value && <Tick />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Several choices (properties, services): tick, then Apply.
function MultiPick({ icon, all, items, value, onChange }) {
  const [open, setOpen, ref] = usePopover();
  const [draft, setDraft] = useState(value);
  const [q, setQ] = useState("");
  const shown = value.length === 0 ? all : value.length === 1 ? items.find((i) => i.value === value[0])?.label || "1 selected" : `${value.length} selected`;
  const list = q.trim() ? items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())) : items;
  const allOn = items.length > 0 && draft.length === items.length;
  return (
    <div className="bdz-pick" ref={ref}>
      <button type="button" className={`bdz-chip ${value.length ? "on" : ""} ${open ? "open" : ""}`} aria-expanded={open} onClick={() => { setDraft(value); setQ(""); setOpen((o) => !o); }}>
        <Icon name={icon} />
        <span>{shown}</span>
        <Chevron />
      </button>
      {open && (
        <div className="bdz-pop">
          <div className="bdz-pop-head">
            <b>{all}</b>
            {items.length > 0 && (
              <button type="button" onClick={() => setDraft(allOn ? [] : items.map((i) => i.value))}>{allOn ? "Unselect all" : "Select all"}</button>
            )}
          </div>
          {items.length > 7 && (
            <div className="bdz-pop-search">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search" autoFocus />
            </div>
          )}
          <div className="bdz-pop-list">
            {!items.length ? (
              <div className="bdz-pop-empty">Nothing to choose yet. It fills in once there are bookings.</div>
            ) : !list.length ? (
              <div className="bdz-pop-empty">No match</div>
            ) : list.map((i) => {
              const on = draft.includes(i.value);
              return (
                <label key={i.value} className={`bdz-opt ${on ? "on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => setDraft((d) => (d.includes(i.value) ? d.filter((x) => x !== i.value) : [...d, i.value]))} />
                  <span className="bdz-box" aria-hidden="true">{on && <Tick />}</span>
                  <span className="bdz-opt-text">{i.label}</span>
                </label>
              );
            })}
          </div>
          <div className="bdz-pop-foot">
            <button type="button" onClick={() => setDraft([])} disabled={!draft.length}>Clear</button>
            <button type="button" className="primary" onClick={() => { onChange(draft); setOpen(false); }} disabled={!items.length}>
              Apply{draft.length ? ` (${draft.length})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Seg({ value, items, onChange, label }) {
  return (
    <div className="bdz-seg" role="radiogroup" aria-label={label}>
      {items.map(([v, l]) => <button key={v || "all"} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="bdz-grid" role="status" aria-label="Loading">
      {[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel span-3" style={{ height: 150 }} />)}
      <span className="bdz-skel span-8" style={{ height: 360 }} />
      <span className="bdz-skel span-4" style={{ height: 360 }} />
    </div>
  );
}

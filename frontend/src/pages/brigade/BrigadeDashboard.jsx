import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminDashboard from "../AdminDashboard";
import ConfirmDialog from "../../components/ConfirmDialog";
import BrigadeBookingModal from "./BrigadeBookingModal";
import { apiFetch } from "../../api";
import { brigadeRequest, formatDate, formatInr, gstOn, statusLabel } from "./brigadeShared";
import { SearchIcon } from "./PoSheet";
import "./brigade.css";

// Brigade Executive dashboard: the shared jobs dashboard (backend limits it to
// Brigade Group, rows show the flat), Pending — flats saved without services
// (step 1 of a booking) — and a Flats view with what was done for each
// service. The view lives in the URL (?view=pending | ?view=flats).
export default function BrigadeDashboard() {
  const [params, setParams] = useSearchParams();
  const view = ["flats", "pending"].includes(params.get("view")) ? params.get("view") : "jobs";
  const [pendingCount, setPendingCount] = useState(null);

  useEffect(() => {
    brigadeRequest("/api/brigade/flat-requests")
      .then((rows) => setPendingCount(Array.isArray(rows) ? rows.length : 0))
      .catch(() => setPendingCount(null));
  }, [view]);

  return (
    <div className="bgf-wrap">
      <div className="bgf-switch" role="tablist" aria-label="Jobs view">
        <button
          type="button"
          role="tab"
          aria-selected={view === "jobs"}
          className={view === "jobs" ? "active" : ""}
          onClick={() => setParams({})}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          Jobs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "pending"}
          className={view === "pending" ? "active" : ""}
          onClick={() => setParams({ view: "pending" })}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Pending
          {pendingCount > 0 && <span className="bgf-switch-count">{pendingCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "flats"}
          className={view === "flats" ? "active" : ""}
          onClick={() => setParams({ view: "flats" })}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
          </svg>
          Flats
        </button>
      </div>
      {view === "flats" ? (
        <FlatsBoard />
      ) : view === "pending" ? (
        <PendingFlats onChanged={setPendingCount} />
      ) : (
        <AdminDashboard />
      )}
    </div>
  );
}

const STATE_LABEL = { completed: "Done", booked: "Booked", none: "Not booked" };

function FlatsBoard() {
  const navigate = useNavigate();
  const [data, setData] = useState({ sub_services: [], flats: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [property, setProperty] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | open | done
  const [openKey, setOpenKey] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [addFor, setAddFor] = useState(null); // flat to add services to
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    brigadeRequest("/api/brigade/flats-status")
      .then((d) => setData({ sub_services: d?.sub_services || [], flats: d?.flats || [] }))
      .catch((err) => setError(err.message || "Failed to load flats"))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const properties = useMemo(
    () => [...new Map(data.flats.map((f) => [f.company_id, f.property])).entries()],
    [data.flats]
  );

  const term = query.trim().toLowerCase();
  const shown = data.flats.filter(
    (f) =>
      (!property || f.company_id === property) &&
      (filter === "all" || (filter === "open" ? f.booked > 0 : f.booked === 0)) &&
      (!term || f.flat_number.toLowerCase().includes(term) || String(f.property || "").toLowerCase().includes(term))
  );

  // Excel report for the property + tab currently shown.
  async function downloadReport() {
    setDownloading(true);
    setError("");
    try {
      const q = new URLSearchParams({ state: filter });
      if (property) q.set("company_id", property);
      const res = await apiFetch(`/api/brigade/flats-report?${q}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Could not create the report");
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] ||
        `Brigade-Flats-Report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message || "Could not create the report");
    } finally {
      setDownloading(false);
    }
  }

  const totals = useMemo(
    () => ({
      flats: data.flats.length,
      completed: data.flats.reduce((s, f) => s + f.completed, 0),
      booked: data.flats.reduce((s, f) => s + f.booked, 0),
      open: data.flats.filter((f) => f.booked > 0).length,
    }),
    [data.flats]
  );

  const donePct = totals.completed + totals.booked ? Math.round((totals.completed / (totals.completed + totals.booked)) * 100) : null;
  const propCounts = useMemo(() => data.flats.reduce((m, f) => { m[f.company_id] = (m[f.company_id] || 0) + 1; return m; }, {}), [data.flats]);

  return (
    <div className="bg-page bdz bdz-embedded bfl">
      <section className="bdz-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Brigade · Flats</span>
            <h1>Flats</h1>
            <p>Every booked flat and what has been done for each Deep Cleaning service</p>
          </div>
          <button type="button" className="bpo-new" onClick={downloadReport} disabled={downloading || loading || !data.flats.length}
            title="Excel report of the flats shown (property + tab filters apply)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            {downloading ? "Preparing…" : "Download Excel"}
          </button>
        </div>
        {loading ? (
          <div className="bdz-hero-kpis bnp-kpis">{[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel dark" />)}</div>
        ) : (
          <div className="bdz-hero-kpis bnp-kpis">
            <div className="bdz-hstat blue"><span>Flats booked</span><b>{totals.flats.toLocaleString("en-IN")}</b><em>Across {properties.length} propert{properties.length === 1 ? "y" : "ies"}</em></div>
            <div className="bdz-hstat aqua"><span>Services done</span><b>{totals.completed.toLocaleString("en-IN")}</b><em>{donePct === null ? "Nothing booked yet" : `${donePct}% of booked work`}</em></div>
            <div className="bdz-hstat"><span>Services booked</span><b>{totals.booked.toLocaleString("en-IN")}</b><em>Scheduled or in progress</em></div>
            <div className={`bdz-hstat ${totals.open ? "red" : ""}`}><span>Flats with open work</span><b>{totals.open.toLocaleString("en-IN")}</b><em>{(totals.flats - totals.open).toLocaleString("en-IN")} with nothing pending</em></div>
          </div>
        )}
      </section>

      {error && <div className="bg-error">{error}</div>}

      <section className="bdz-panel bnp-panel">
        {properties.length > 1 && (
          <div className="bnp-props" role="radiogroup" aria-label="Property">
            <button type="button" role="radio" aria-checked={!property} className={!property ? "on" : ""} onClick={() => setProperty("")}>All properties <span>{data.flats.length}</span></button>
            {properties.map(([id, name]) => (
              <button key={id} type="button" role="radio" aria-checked={property === id} className={property === id ? "on" : ""} onClick={() => setProperty(property === id ? "" : id)}>
                <i aria-hidden="true">{initials(name)}</i>{name} <span>{propCounts[id] || 0}</span>
              </button>
            ))}
          </div>
        )}

        <div className="bnp-toolbar">
          <div className="bpm-seg" role="tablist" aria-label="Filter flats">
            {[["all", "All flats", data.flats.length], ["open", "Open work", totals.open], ["done", "Nothing pending", totals.flats - totals.open]].map(([key, label, count]) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>{label} <b>{count}</b></button>
            ))}
          </div>
          <div className="bnp-search">
            <SearchIcon />
            <input value={query} placeholder="Search flat, e.g. L-0123" aria-label="Search flat" onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          </div>
        </div>

        {loading ? (
          <div className="bpm-skel-grid" role="status" aria-label="Loading flats">
            {Array.from({ length: 7 }).map((_, i) => <span key={i} className="bdz-skel" style={{ height: 60, borderRadius: 12 }} />)}
          </div>
        ) : !data.flats.length ? (
          <div className="bnp-empty muted"><strong>No flats booked yet</strong><p>Flats appear here after their first Brigade booking.</p></div>
        ) : !shown.length ? (
          <div className="bnp-empty muted"><strong>No matching flats</strong><p>Try another property, filter or search.</p></div>
        ) : (
          <div className="bnp-scroll">
            <table className="bnp-table bfl-table">
              <thead>
                <tr>
                  <th>Flat</th>
                  <th>Services</th>
                  <th className="num">Progress</th>
                  <th>Last booking</th>
                  <th aria-label="Expand" />
                </tr>
              </thead>
              {shown.map((f) => {
                const key = `${f.company_id}|${f.flat_number}`;
                const open = openKey === key;
                const total = f.completed + f.booked;
                return (
                  <tbody key={key} className={open ? "open" : undefined}>
                    <tr tabIndex={0} aria-expanded={open} onClick={() => setOpenKey(open ? null : key)} onKeyDown={(e) => e.key === "Enter" && setOpenKey(open ? null : key)}>
                      <td>
                        <div className="bnp-who">
                          <span className="bnp-avatar" aria-hidden="true">{initials(f.property)}</span>
                          <span><strong>{f.flat_number}{f.bhk ? <em> · {f.bhk}</em> : null}</strong><small>{f.property || "—"}</small></span>
                        </div>
                      </td>
                      <td>
                        <div className="bfl-chips">
                          {f.services.map((s) => (
                            <span key={s.sub_service} className={`bfl-chip ${s.state}`} title={`${s.sub_service}: ${STATE_LABEL[s.state]}`}>
                              <i aria-hidden="true" />{s.sub_service}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num">
                        <span className="bfl-prog" title={`${f.completed} done, ${f.booked} booked`}>
                          <b>{f.completed}<small>/{total}</small></b>
                          <span className="bfl-prog-bar"><i style={{ width: `${total ? (f.completed / total) * 100 : 0}%` }} /></span>
                          {f.booked > 0 ? <em className="open">{f.booked} open</em> : <em>all done</em>}
                        </span>
                      </td>
                      <td className="bnp-date">{formatDate(f.last_activity)}</td>
                      <td className="bfl-caret" aria-hidden="true">{open ? "▴" : "▾"}</td>
                    </tr>
                    {open && (
                      <tr className="bfl-detail">
                        <td colSpan={5}>
                          <FlatDetail
                            flat={f}
                            allServices={data.sub_services}
                            onOpenJob={(id) => navigate(`/brigade/jobs/${id}`)}
                            onAddServices={() =>
                              setAddFor({
                                company_id: f.company_id,
                                site_id: f.site_id,
                                contact_id: f.contact_id,
                                flat_number: f.flat_number,
                                bhk: f.bhk,
                                property: f.property,
                              })
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
        <div className="bpo-legend"><span><i className="bfl-dot completed" />Done</span><span><i className="bfl-dot booked" />Booked, not done yet</span></div>
      </section>

      {addFor && (
        <BrigadeBookingModal
          isOpen
          forFlat={addFor}
          onClose={() => setAddFor(null)}
          onCreated={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

const initials = (name) => String(name || "?").replace(/^brigade\s+/i, "").trim().slice(0, 2).toUpperCase();

// Opened flat: one card per service — work first (booked, then done), and the
// never-booked ones as quiet cards at the end.
function FlatDetail({ flat, allServices, onOpenJob, onAddServices }) {
  const byName = Object.fromEntries(flat.services.map((s) => [s.sub_service, s]));
  const rank = { booked: 0, completed: 1, none: 2 };
  const cards = allServices
    .map((name) => byName[name] || { sub_service: name, state: "none", job: null })
    .sort((a, b) => rank[a.state] - rank[b.state] || allServices.indexOf(a.sub_service) - allServices.indexOf(b.sub_service));
  const notBooked = cards.filter((c) => c.state === "none").length;

  return (
    <div className="bgf-detail-box">
      <div className="bgf-legend">
        <span className="booked">{flat.booked} booked</span>
        <span className="completed">{flat.completed} done</span>
        <span className="none">{notBooked} not booked</span>
        <button type="button" className="bgf-add-btn" onClick={onAddServices} title="New booking for this flat - it goes to Pending">+ Book services</button>
      </div>
      <div className="bgf-cards">
        {cards.map((c) => (
          <div key={c.sub_service} className={`bgf-scard ${c.state}`}>
            <div className="bgf-scard-top">
              <span className="bgf-scard-name">{c.sub_service}</span>
              {c.state !== "none" && <span className={`bgf-state ${c.state}`}>{STATE_LABEL[c.state]}</span>}
            </div>
            {c.job ? (
              <>
                <div className="bgf-scard-meta">
                  <button type="button" className="bgb-code" onClick={() => onOpenJob(c.job.id)}>{c.job.code}</button>
                  <span>{c.state === "booked" ? statusLabel(c.job.status) : "Completed"}</span>
                </div>
                <div className="bgf-scard-date">{c.job.date ? formatDate(c.job.date) : "—"}</div>
                {c.state === "booked" && c.last_completed ? (
                  <div className="bgf-scard-extra">Last done {formatDate(c.last_completed.date)}</div>
                ) : c.times_booked > 1 ? (
                  <div className="bgf-scard-extra">Booked {c.times_booked} times</div>
                ) : null}
              </>
            ) : (
              <div className="bgf-scard-meta">Not booked yet</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Booked flats waiting to be scheduled: the services Brigade asked for, their value with
// GST and the PO. "Schedule & assign" sets visit dates + team and creates the jobs;
// Cancel takes the flat off the list.
function PendingFlats({ onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [addFor, setAddFor] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  useEffect(() => {
    brigadeRequest("/api/brigade/flat-requests")
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRows(list);
        setError("");
        onChanged?.(list.length);
      })
      .catch((err) => setError(err.message || "Failed to load pending flats"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function doCancel() {
    const row = cancelling;
    setCancelling(null);
    try {
      await brigadeRequest(`/api/brigade/flat-requests/${row.id}/cancel`, { method: "POST" });
      reload();
    } catch (err) {
      setError(err.message || "Could not cancel");
    }
  }

  const [property, setProperty] = useState("");
  const term = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!property || r.property === property) &&
      (!term || [r.flat_number, r.property, r.contact_name, r.client_po_number].some((v) => String(v || "").toLowerCase().includes(term)))
  );
  const oldest = rows.length ? rows[rows.length - 1].created_at : null;
  const props = [...new Set(rows.map((r) => r.property).filter(Boolean))].sort();
  const propCount = (p) => rows.filter((r) => r.property === p).length;
  const totalIncl = rows.reduce((s, r) => s + gstOn(r.services_total || 0).total, 0);
  const noServices = rows.filter((r) => !(r.services || []).length).length;
  const noPo = rows.filter((r) => !r.client_po_number).length;

  return (
    <div className="bg-page bdz bdz-embedded bpe">
      <section className="bdz-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Brigade · Pending</span>
            <h1>Pending</h1>
            <p>Bookings waiting to be scheduled · set the visit date and team to create the jobs</p>
          </div>
          <button type="button" className="bpo-new" onClick={() => setCreating(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            New booking
          </button>
        </div>
        {loading ? (
          <div className="bdz-hero-kpis bnp-kpis">{[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel dark" />)}</div>
        ) : (
          <div className="bdz-hero-kpis bnp-kpis">
            <div className="bdz-hstat red"><span>Flats waiting</span><b>{rows.length.toLocaleString("en-IN")}</b><em>{props.length} propert{props.length === 1 ? "y" : "ies"}</em></div>
            <div className="bdz-hstat aqua"><span>Value of the work</span><b title={formatInr(totalIncl)}>{totalIncl >= 1e5 ? `₹${(totalIncl / 1e5).toFixed(1)} L` : formatInr(totalIncl)}</b><em>incl. GST</em></div>
            <div className="bdz-hstat blue"><span>Without a PO</span><b>{noPo.toLocaleString("en-IN")}</b><em>{noServices ? `${noServices} with no services picked` : "All have services picked"}</em></div>
            <div className="bdz-hstat"><span>Oldest saved</span><b>{oldest ? formatDate(oldest) : "—"}</b><em>Schedule the oldest first</em></div>
          </div>
        )}
      </section>

      {error && <div className="bg-error">{error}</div>}

      <section className="bdz-panel bnp-panel">
        {props.length > 1 && (
          <div className="bnp-props" role="radiogroup" aria-label="Property">
            <button type="button" role="radio" aria-checked={!property} className={!property ? "on" : ""} onClick={() => setProperty("")}>All properties <span>{rows.length}</span></button>
            {props.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={property === p} className={property === p ? "on" : ""} onClick={() => setProperty(property === p ? "" : p)}>
                <i aria-hidden="true">{initials(p)}</i>{p} <span>{propCount(p)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="bnp-toolbar">
          <div className="bpe-count"><b>{shown.length}</b> flat{shown.length === 1 ? "" : "s"} waiting to be scheduled{property ? ` at ${property}` : ""}</div>
          <div className="bnp-search">
            <SearchIcon />
            <input value={query} placeholder="Search flat, property, person or PO" aria-label="Search pending flats" onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          </div>
        </div>

        {loading ? (
          <div className="bpm-skel-grid" role="status" aria-label="Loading pending flats">
            {Array.from({ length: 6 }).map((_, i) => <span key={i} className="bdz-skel" style={{ height: 72, borderRadius: 12 }} />)}
          </div>
        ) : !rows.length ? (
          <div className="bnp-empty">
            <span aria-hidden="true">✓</span>
            <strong>Nothing waiting to be scheduled</strong>
            <p>New Brigade bookings land here. Use “New booking” to add one.</p>
          </div>
        ) : !shown.length ? (
          <div className="bnp-empty muted"><strong>No matching flats</strong><p>Try another property or search.</p></div>
        ) : (
          <div className="bnp-scroll">
            <table className="bnp-table bpe-table">
              <thead>
                <tr>
                  <th>Flat</th>
                  <th>Services asked for</th>
                  <th className="num">Value incl. GST</th>
                  <th>Client PO</th>
                  <th>Requested</th>
                  <th className="num" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const services = r.services || [];
                  const money = gstOn(r.services_total || 0);
                  return (
                    <tr key={r.id} className="bpe-row">
                      <td>
                        <div className="bnp-who">
                          <span className="bnp-avatar" aria-hidden="true">{initials(r.property)}</span>
                          <span>
                            <strong>{r.flat_number}{r.bhk ? <em> · {r.bhk}</em> : null}</strong>
                            <small>{r.property}{r.site_name && r.site_name !== r.property ? ` · ${r.site_name}` : ""}</small>
                            {r.notes && <small className="bpe-note" title={r.notes}>{r.notes.length > 50 ? `${r.notes.slice(0, 50)}…` : r.notes}</small>}
                          </span>
                        </div>
                      </td>
                      <td>
                        {services.length ? (
                          <div className="bfl-chips">
                            {services.map((x) => (
                              <span key={x.sub_service} className="bfl-chip asked" title={x.price === null ? "No price" : formatInr(x.price)}>{x.sub_service}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="bpe-none">No services yet · pick them when scheduling</span>
                        )}
                      </td>
                      <td className="num">
                        {services.length ? (
                          <>
                            <strong className="bnp-price">{formatInr(money.total)}</strong>
                            <small className="bpo-sub">{formatInr(money.base)} + GST</small>
                          </>
                        ) : <span className="bnp-muted">—</span>}
                      </td>
                      <td>
                        {r.client_po_number ? (
                          <span className="bpe-po">
                            <strong>{r.client_po_number}</strong>
                            {r.po_amount !== null && <small>PO {formatInr(r.po_amount)}</small>}
                          </span>
                        ) : <span className="bpo-pill warn">No PO</span>}
                      </td>
                      <td>
                        <strong className="bpe-who">{r.contact_name || "—"}</strong>
                        <small className="bpo-sub">{formatDate(r.created_at)}{r.created_by ? ` · by ${r.created_by}` : ""}</small>
                      </td>
                      <td className="num">
                        <div className="bpe-actions">
                          <button type="button" className="bpe-cancel" onClick={() => setCancelling(r)} aria-label={`Cancel flat ${r.flat_number}`} title="Cancel this flat">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                          </button>
                          <button
                            type="button"
                            className="bpe-go"
                            onClick={() =>
                              setAddFor({
                                request_id: r.id,
                                company_id: r.company_id,
                                site_id: r.site_id,
                                contact_id: r.contact_id,
                                contact_name: r.contact_name,
                                flat_number: r.flat_number,
                                bhk: r.bhk,
                                property: r.property,
                                address: r.address,
                                po_number: r.client_po_number,
                                services,
                              })
                            }
                          >
                            Schedule &amp; assign
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <BrigadeBookingModal isOpen onClose={() => setCreating(false)} onCreated={reload} />
      )}
      {addFor && (
        <BrigadeBookingModal isOpen forFlat={addFor} onClose={() => setAddFor(null)} onCreated={reload} />
      )}

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel this flat?"
        message={cancelling ? `The booking for flat ${cancelling.flat_number} will be removed from Pending. No jobs were created for it.` : ""}
        confirmLabel="Cancel flat"
        onConfirm={doCancel}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

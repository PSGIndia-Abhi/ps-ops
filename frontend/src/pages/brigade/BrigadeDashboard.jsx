import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminDashboard from "../AdminDashboard";
import ConfirmDialog from "../../components/ConfirmDialog";
import BrigadeBookingModal from "./BrigadeBookingModal";
import { apiFetch } from "../../api";
import { brigadeRequest, formatDate, statusLabel } from "./brigadeShared";
import KpiTile from "./KpiTile";
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
      <div className="bgf-switch" role="tablist" aria-label="Dashboard view">
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

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <h2 className="bgb-h1">Flats</h2>
          <p className="bgb-lede">Every booked flat and what has been done for each Deep Cleaning service.</p>
        </div>
        <button
          type="button"
          className="bgf-download"
          onClick={downloadReport}
          disabled={downloading || loading || !data.flats.length}
          title="Excel report of the flats shown (property + tab filters apply)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
            <path d="M14 3v5h5M9 13l2 2 4-4" />
          </svg>
          {downloading ? "Preparing…" : "Download Excel"}
        </button>
      </div>

      {error && <div className="bg-error">{error}</div>}

      <section className="bgk-grid" aria-label="Flats summary">
        <KpiTile
          icon="home"
          tone="blue"
          label="Flats booked"
          value={totals.flats}
          note={`Across ${properties.length} propert${properties.length === 1 ? "y" : "ies"}`}
        />
        <KpiTile
          icon="check"
          tone="green"
          label="Services done"
          value={totals.completed}
          progress={totals.completed + totals.booked ? (totals.completed / (totals.completed + totals.booked)) * 100 : null}
          note={totals.completed + totals.booked ? `${Math.round((totals.completed / (totals.completed + totals.booked)) * 100)}% of booked work` : "Nothing booked yet"}
        />
        <KpiTile
          icon="calendar"
          tone="amber"
          label="Services booked"
          value={totals.booked}
          note="Scheduled or in progress"
        />
        <KpiTile
          icon="alert"
          tone="violet"
          label="Flats with open work"
          value={totals.open}
          note={`${totals.flats - totals.open} with nothing pending`}
        />
      </section>

      <section className="bgb-sheet">
        <div className="bgb-sheet-toolbar">
          <div className="bgb-tabs" role="tablist" aria-label="Filter flats">
            {[
              ["all", "All flats", data.flats.length],
              ["open", "Open work", totals.open],
              ["done", "Nothing pending", totals.flats - totals.open],
            ].map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={`bgb-tab ${filter === key ? "active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <div className="bgf-filters">
            <select value={property} onChange={(e) => setProperty(e.target.value)} aria-label="Property">
              <option value="">All properties</option>
              {properties.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <input
              value={query}
              placeholder="Search flat, e.g. L-0123"
              aria-label="Search flat"
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        {loading ? (
          <div className="bg-loading bgb-pad">Loading flats…</div>
        ) : !data.flats.length ? (
          <div className="bg-empty-state">
            <strong>No flats booked yet</strong>
            Flats appear here after their first Brigade booking.
          </div>
        ) : !shown.length ? (
          <div className="bg-empty-state">
            <strong>No matching flats</strong>
            Try another property, filter or search.
          </div>
        ) : (
          <div className="bg-table-wrap">
            <table className="bgb-ledger bgf-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }} aria-label="Expand" />
                  <th>Flat</th>
                  <th>Property</th>
                  <th>Services</th>
                  <th className="num">Done</th>
                  <th className="num">Booked</th>
                  <th>Last booking</th>
                </tr>
              </thead>
              {shown.map((f) => {
                const key = `${f.company_id}|${f.flat_number}`;
                const open = openKey === key;
                return (
                  <tbody key={key} className={open ? "open" : undefined}>
                    <tr
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? null : key)}
                      onKeyDown={(e) => e.key === "Enter" && setOpenKey(open ? null : key)}
                    >
                      <td className="bgf-caret">{open ? "▾" : "▸"}</td>
                      <td>
                        <span className="bgb-po-no">{f.flat_number}</span>
                        <span className="bgf-bhk">{f.bhk}</span>
                      </td>
                      <td>{f.property || "—"}</td>
                      <td>
                        <div className="bgf-chips">
                          {f.services.map((s) => (
                            <span key={s.sub_service} className={`bgf-chip ${s.state}`} title={`${s.sub_service}: ${STATE_LABEL[s.state]}`}>
                              {s.state === "completed" ? "✓ " : "● "}
                              {s.sub_service}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num">{f.completed}</td>
                      <td className="num">{f.booked}</td>
                      <td className="bgb-nowrap">{formatDate(f.last_activity)}</td>
                    </tr>
                    {open && (
                      <tr className="bgf-detail">
                        <td />
                        <td colSpan={6}>
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
        <button type="button" className="bgf-add-btn" onClick={onAddServices}>+ Add services</button>
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

// Flats saved in step 1 (no services yet). "Add services" opens step 2 for
// that flat; Cancel takes it off the list.
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

  const term = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      !term ||
      [r.flat_number, r.property, r.contact_name, r.client_po_number].some((v) => String(v || "").toLowerCase().includes(term))
  );
  const oldest = rows.length ? rows[rows.length - 1].created_at : null;

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <h2 className="bgb-h1">Pending flats</h2>
          <p className="bgb-lede">Flats saved without services. Add services, visit dates and team to create the jobs.</p>
        </div>
        <button type="button" className="primary bgf-new-flat" onClick={() => setCreating(true)}>
          + New flat
        </button>
      </div>

      {error && <div className="bg-error">{error}</div>}

      <section className="bgb-sheet">
        <div className="bgb-sheet-toolbar">
          <div className="bgf-pending-count">
            <strong>{rows.length}</strong> flat{rows.length === 1 ? "" : "s"} waiting for services
            {oldest && <span className="bgb-muted"> · oldest saved {formatDate(oldest)}</span>}
          </div>
          <div className="bgf-filters">
            <input
              value={query}
              placeholder="Search flat, property, person or PO"
              aria-label="Search pending flats"
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        {loading ? (
          <div className="bg-loading bgb-pad">Loading pending flats…</div>
        ) : !rows.length ? (
          <div className="bg-empty-state">
            <strong>No flats waiting for services</strong>
            Use “+ New flat” to save a flat now and add its services later.
          </div>
        ) : !shown.length ? (
          <div className="bg-empty-state">
            <strong>No matching flats</strong>
            Try another search.
          </div>
        ) : (
          <div className="bg-table-wrap">
            <table className="bgb-ledger">
              <thead>
                <tr>
                  <th>Flat</th>
                  <th>Property</th>
                  <th>Requested by</th>
                  <th>Client PO</th>
                  <th>Saved</th>
                  <th className="num" style={{ width: 220 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="bgb-po-no">{r.flat_number}</span>
                      <span className="bgf-bhk">{r.bhk}</span>
                      {r.notes && <div className="bgb-sub" title={r.notes}>{r.notes.length > 60 ? `${r.notes.slice(0, 60)}…` : r.notes}</div>}
                    </td>
                    <td>
                      <div>{r.property}</div>
                      {r.site_name && r.site_name !== r.property && <div className="bgb-sub">{r.site_name}</div>}
                    </td>
                    <td>
                      <div>{r.contact_name || "—"}</div>
                      {r.contact_phone && <div className="bgb-sub">{r.contact_phone}</div>}
                    </td>
                    <td>{r.client_po_number || <span className="bgb-muted">—</span>}</td>
                    <td className="bgb-nowrap">
                      <div>{formatDate(r.created_at)}</div>
                      {r.created_by && <div className="bgb-sub">by {r.created_by}</div>}
                    </td>
                    <td className="num">
                      <div className="bgf-row-actions">
                        <button type="button" className="bgb-btn-ghost bgf-cancel" onClick={() => setCancelling(r)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="primary bgf-add-services"
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
                            })
                          }
                        >
                          Add services
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
        message={cancelling ? `Flat ${cancelling.flat_number} will be removed from Pending. No jobs were created for it.` : ""}
        confirmLabel="Cancel flat"
        onConfirm={doCancel}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

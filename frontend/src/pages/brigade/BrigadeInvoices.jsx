import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineMagnifyingGlass, HiOutlineArrowDownTray, HiOutlineReceiptPercent } from "react-icons/hi2";
import StatusAlertModal from "../../components/StatusAlertModal";
import { brigadeRequest, listInvoices, downloadInvoice, formatInr, formatDate, round2 } from "./brigadeShared";
import "./brigade.css";

// Issued invoices (/brigade/invoices): every Brigade invoice already issued.
// The existing invoice API lists invoices per PO, so this loads the PO list
// (GET /api/brigade/pos), then the invoices of each PO that has anything
// invoiced. An invoice covering several POs is shown once, with all its POs.
const BATCH = 6;

const shortInr = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return formatInr(v).replace(/\.00$/, "");
};

export default function BrigadeInvoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [search, setSearch] = useState("");
  const [property, setProperty] = useState("");
  const [month, setMonth] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const pos = await brigadeRequest("/api/brigade/pos");
        const withInvoices = (Array.isArray(pos) ? pos : []).filter((p) => Number(p?.totals?.invoiced) > 0).map((p) => p.po_number);
        const byId = new Map();
        for (let i = 0; i < withInvoices.length; i += BATCH) {
          const chunk = withInvoices.slice(i, i + BATCH);
          const lists = await Promise.all(chunk.map((po) => listInvoices(po).then((rows) => [po, rows || []])));
          for (const [po, rows] of lists) {
            for (const inv of rows) {
              const seen = byId.get(inv.id);
              if (seen) seen.pos.push(po);
              else byId.set(inv.id, { ...inv, pos: [po] });
            }
          }
        }
        if (!live) return;
        const all = [...byId.values()].sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)) || String(b.created_at).localeCompare(String(a.created_at)));
        setInvoices(all);
      } catch (err) {
        if (live) setError(err.message || "Failed to load invoices");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const properties = useMemo(() => [...new Set(invoices.map((i) => i.property).filter(Boolean))].sort(), [invoices]);
  const months = useMemo(() => [...new Set(invoices.map((i) => String(i.invoice_date || "").slice(0, 7)).filter(Boolean))].sort().reverse(), [invoices]);

  const q = search.trim().toLowerCase();
  const rows = invoices.filter((i) => {
    if (property && i.property !== property) return false;
    if (month && !String(i.invoice_date || "").startsWith(month)) return false;
    if (!q) return true;
    return [i.invoice_number, i.property, i.created_by_name, ...i.pos].some((v) => String(v || "").toLowerCase().includes(q));
  });

  const totals = useMemo(() => ({
    total: round2(rows.reduce((s, i) => s + i.total, 0)),
    subtotal: round2(rows.reduce((s, i) => s + i.subtotal, 0)),
    gst: round2(rows.reduce((s, i) => s + i.cgst + i.sgst, 0)),
    lines: rows.reduce((s, i) => s + (i.lines || 0), 0),
  }), [rows]);

  async function download(inv) {
    setBusyId(inv.id);
    try {
      await downloadInvoice(inv);
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Could not download the invoice" });
    } finally {
      setBusyId(null);
    }
  }

  const filtered = Boolean(q || property || month);
  const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  return (
    <div className="bg-page bdz binv">
      <section className="bdz-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Brigade · Billing</span>
            <h1>Issued invoices</h1>
            <p>Every invoice generated for Brigade POs · amounts include GST</p>
          </div>
        </div>
        {loading ? (
          <div className="bdz-hero-kpis bnp-kpis">{[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel dark" />)}</div>
        ) : (
          <div className="bdz-hero-kpis bnp-kpis">
            <div className="bdz-hstat blue"><span>Invoices{filtered ? " (filtered)" : ""}</span><b>{rows.length.toLocaleString("en-IN")}</b><em>{totals.lines.toLocaleString("en-IN")} services billed</em></div>
            <div className="bdz-hstat aqua"><span>Total invoiced</span><b title={formatInr(totals.total)}>{shortInr(totals.total)}</b><em>incl. GST</em></div>
            <div className="bdz-hstat"><span>Service value</span><b title={formatInr(totals.subtotal)}>{shortInr(totals.subtotal)}</b><em>excl. GST</em></div>
            <div className="bdz-hstat red"><span>GST billed</span><b title={formatInr(totals.gst)}>{shortInr(totals.gst)}</b><em>CGST 9% + SGST 9%</em></div>
          </div>
        )}
      </section>

      {error && <div className="bg-error">{error}</div>}

      <section className="bdz-panel">
        <div className="bms-toolbar">
          <label className="bms-search">
            <HiOutlineMagnifyingGlass aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice no., PO, property or issued by" aria-label="Search invoices" />
          </label>
          {properties.length > 1 && (
            <select className="bms-select" value={property} onChange={(e) => setProperty(e.target.value)} aria-label="Property">
              <option value="">All properties</option>
              {properties.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {months.length > 1 && (
            <select className="bms-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              <option value="">All months</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <div className="binv-skel" role="status" aria-label="Loading invoices">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className="bdz-skel" style={{ height: 48, borderRadius: 12 }} />)}
          </div>
        ) : !rows.length ? (
          <div className="bms-empty">
            <span className="bms-empty-ico"><HiOutlineReceiptPercent aria-hidden="true" /></span>
            <strong>{invoices.length ? "No invoices match" : "No invoices issued yet"}</strong>
            {!invoices.length && <p>Invoices generated from Billing will appear here.</p>}
          </div>
        ) : (
          <div className="bg-table-wrap">
            <table className="bg-table binv-table">
              <thead>
                <tr>
                  <th>Invoice no.</th>
                  <th>Date</th>
                  <th>Property</th>
                  <th>PO</th>
                  <th className="num">Services</th>
                  <th className="num">Value</th>
                  <th className="num">GST</th>
                  <th className="num">Total</th>
                  <th className="num" aria-label="Download" />
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <span className="binv-no">{inv.invoice_number}</span>
                      {inv.created_by_name && <small className="binv-by">by {inv.created_by_name}</small>}
                    </td>
                    <td className="binv-nowrap">{formatDate(inv.invoice_date)}</td>
                    <td className="binv-prop">{inv.property || "—"}</td>
                    <td>
                      <div className="binv-pos">
                        {inv.pos.map((po) => (
                          <button key={po} type="button" className="binv-po" onClick={() => navigate(`/brigade/pos?po=${encodeURIComponent(po)}`)} title="Open the PO">{po}</button>
                        ))}
                      </div>
                    </td>
                    <td className="num">{inv.lines}</td>
                    <td className="num binv-nowrap">{formatInr(inv.subtotal)}</td>
                    <td className="num binv-nowrap">{formatInr(round2(inv.cgst + inv.sgst))}</td>
                    <td className="num binv-nowrap"><b>{formatInr(inv.total)}</b></td>
                    <td className="num">
                      <button type="button" className="binv-dl" onClick={() => download(inv)} disabled={busyId === inv.id} aria-label={`Download ${inv.invoice_number}`} title="Download PDF">
                        <HiOutlineArrowDownTray aria-hidden="true" /> {busyId === inv.id ? "…" : "PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <StatusAlertModal status={status} onClose={() => setStatus(null)} />
    </div>
  );
}

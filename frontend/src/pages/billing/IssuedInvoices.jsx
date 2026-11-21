import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { FiAlertCircle, FiDownload, FiExternalLink, FiFileText, FiLink, FiMail, FiMessageCircle, FiPrinter, FiSearch, FiShare2, FiXCircle } from "react-icons/fi";
import { EmptyRow, Pager } from "../accountant/ui";
import { exportCsv } from "../accountant/exportCsv";
import { downloadFile, openPdf, printPdf, qs, useBilling, useCustomerOptions } from "./billingApi";
import { amount, dmy, periodLabel, thisMonth, typeLabel } from "./format";
import { emailInvoice } from "./emailInvoice";
import CancelDialog from "./CancelDialog";
import { Modal, Msg, StatusBadge, TypeBadge } from "./ui";
import useDebounced from "./useDebounced";
import CustomerFilter from "./CustomerFilter";

const SHARED_AS = { EMAIL: ["Email sent", FiMail], WHATSAPP: ["WhatsApp", FiMessageCircle], LINK: ["Link sent", FiLink], PRINT: ["Printed", FiPrinter], OTHER: ["Shared", FiShare2] };

// Issued Invoices: numbered invoices with their collection status (from the receivables in the
// Accountant Panel), PDF, Print / Share and Cancel.

const PAGE_SIZE = 25;

export default function IssuedInvoices() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const customerOptions = useCustomerOptions();
  const [picked, setPicked] = useState([]); // customer filter: [] = all
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [type, setType] = useState("");
  const [status, setStatus] = useState("ISSUED,CANCELLED");
  const [page, setPage] = useState(0);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/invoices${qs({ status, month, type, q, company_ids: picked.join(","), page: page + 1, page_size: PAGE_SIZE })}`);
  const [emailing, setEmailing] = useState(null); // the invoice being emailed
  const [cancelling, setCancelling] = useState(null);
  const [msg, setMsg] = useState({});
  const rows = data?.rows || [];
  // Ticked invoices (kept across pages, cleared when the filters change). Cancelled ones are not printed.
  const [sel, setSel] = useState(() => new Set());
  const filterKey = `${status}|${month}|${type}|${q}|${picked.join(",")}`;
  const [selKey, setSelKey] = useState(filterKey);
  if (selKey !== filterKey) {
    setSelKey(filterKey);
    setSel(new Set());
  }
  const pickable = rows.filter((r) => r.status !== "CANCELLED");
  const allOn = pickable.length > 0 && pickable.every((r) => sel.has(r.id));
  const toggle = (id) => setSel((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setSel((cur) => {
    const next = new Set(cur);
    pickable.forEach((r) => (allOn ? next.delete(r.id) : next.add(r.id)));
    return next;
  });

  const pdf = (id) => openPdf(`/invoices/${id}/pdf`).catch((err) => setMsg({ error: err.message }));
  const [downloading, setDownloading] = useState("");
  // Selected invoices when any are ticked, otherwise every issued invoice of the month.
  const scope = () => (sel.size ? { ids: [...sel].join(",") } : { month });
  async function downloadAll() {
    setDownloading("original");
    setMsg({});
    try {
      const r = await downloadFile(`/invoices/download${qs({ ...scope(), copies: "original" })}`, sel.size ? "Invoices selected.pdf" : `Invoices ${month}.pdf`);
      setMsg({ ok: `Downloaded ${r.count ? `${r.count} invoice(s) - ` : ""}${r.name}` });
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setDownloading("");
    }
  }
  // Opens the browser's print window directly, with every copy set in the customer profiles.
  async function printAll() {
    setDownloading("print");
    setMsg({});
    try {
      await printPdf(`/invoices/download${qs({ ...scope(), copies: "print" })}`);
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setDownloading("");
    }
  }
  const exportRows = () =>
    exportCsv(`issued-invoices-${month || "all"}.csv`, [
      { header: "Invoice No", value: (r) => r.invoice_number },
      { header: "Date", value: (r) => dmy(r.invoice_date) },
      { header: "Customer", value: (r) => r.customer },
      { header: "Type", value: (r) => typeLabel(r.billing_type) },
      { header: "Period", value: (r) => `${periodLabel(r.period_start, r.period_end)}${r.is_manual ? " (manual bill)" : ""}` },
      { header: "Total", value: (r) => r.total },
      { header: "Advance adjusted", value: (r) => r.advance_adjusted },
      { header: "Receivable", value: (r) => (r.status === "CANCELLED" ? "Cancelled" : r.receivable_status) },
      { header: "PO", value: (r) => r.po_numbers.join(", ") },
    ], rows);

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Issued Invoices</h1>
          <p className="ac-sub">Final, numbered invoices. They also flow to the Accountant Panel (Invoice List, Outstanding, Payments) for collection.</p>
        </div>
        <div className="ac-actions">
          <button type="button" className="ac-btn bl-ibtn csv" disabled={!rows.length} onClick={exportRows} title="Export this list to Excel (CSV)"><FiFileText /> Export CSV</button>
          {/* All issued invoices of the month in one PDF: originals, or every print copy from the profiles. */}
          <button type="button" className="ac-btn bl-ibtn dl" disabled={(!sel.size && (!month || !data?.total)) || Boolean(downloading)} onClick={downloadAll} title={sel.size || month ? "" : "Choose a month or tick invoices"}>
            <FiDownload /> {downloading === "original" ? "Downloading…" : sel.size ? `Download selected (${sel.size})` : "Download all"}
          </button>
          <button type="button" className="ac-btn bl-ibtn print" disabled={(!sel.size && (!month || !data?.total)) || Boolean(downloading)} onClick={printAll} title="Opens the print window - every copy as set in the customer profiles">
            <FiPrinter /> {downloading === "print" ? "Preparing…" : sel.size ? `Print selected (${sel.size})` : "Print all"}
          </button>
        </div>
      </div>
      <Msg {...msg} />

      <div className="ac-card">
        <div className="bl-filterbar">
          <div className="bl-search">
            <FiSearch aria-hidden="true" />
            <input className="ac-input" placeholder="Search invoice no. or customer…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} aria-label="Search" />
          </div>
          <CustomerFilter options={customerOptions} value={picked} onChange={(v) => { setPicked(v); setPage(0); }} />
          <input type="month" className="ac-input" style={{ width: 170 }} value={month} onChange={(e) => { setMonth(e.target.value); setPage(0); }} aria-label="Month" title="Clear for all months" />
          <select className="ac-select" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} aria-label="Type">
            <option value="">All types</option>
            <option value="AMC">AMC</option>
            <option value="ONE_TIME">One-time</option>
            <option value="TERMITE">Termite</option>
            <option value="CHEMICAL">Chemical</option>
          </select>
          <select className="ac-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Status">
            <option value="ISSUED,CANCELLED">All statuses</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <Msg error={error} />
        {sel.size > 0 && (
          <div className="bl-selbar">
            <span><b>{sel.size}</b> invoice{sel.size === 1 ? "" : "s"} selected</span>
            <button type="button" className="bl-link" onClick={() => setSel(new Set())}>Clear selection</button>
          </div>
        )}
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th><input type="checkbox" className="bl-cb" checked={allOn} disabled={!pickable.length} onChange={toggleAll} aria-label="Select all on this page" /></th>
                <th>Invoice no.</th><th>Date</th><th>Customer</th><th>Type</th><th>Period</th>
                <th className="ac-num">Total (₹)</th><th className="ac-num">Advance adjusted (₹)</th><th>Receivable</th><th>Sent</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={11} loading={loading} text="No issued invoices for these filters." />
              ) : (
                rows.map((r) => {
                  const cancelled = r.status === "CANCELLED";
                  const paidSomething = (r.paid_amount || 0) - (r.advance_adjusted || 0) > 0.005; // a payment recorded in Billing
                  return (
                    <tr key={r.id} className={`bl-rowlink ${cancelled ? "bl-muted" : ""} ${sel.has(r.id) ? "bl-sel" : ""}`} onClick={() => navigate(`/billing/invoices/${r.id}`)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="bl-cb" checked={sel.has(r.id)} disabled={cancelled} onChange={() => toggle(r.id)} aria-label={`Select invoice ${r.invoice_number}`} title={cancelled ? "Cancelled invoices are not printed" : ""} />
                      </td>
                      <td className="bl-nowrap"><b>{r.invoice_number}</b></td>
                      <td className="bl-nowrap">{dmy(r.invoice_date)}</td>
                      <td>{r.customer}{r.po_numbers.length > 0 && <div className="bl-sub">PO {r.po_numbers.join(", ")}</div>}</td>
                      <td><TypeBadge type={r.billing_type} /></td>
                      <td>{periodLabel(r.period_start, r.period_end)}{r.is_manual && <div className="mi-kind">Manual bill</div>}</td>
                      <td className="bl-num">{cancelled ? <s>{amount(r.total)}</s> : amount(r.total)}</td>
                      <td className="bl-num">{r.advance_adjusted ? amount(r.advance_adjusted) : "—"}</td>
                      <td>{cancelled ? <StatusBadge value="CANCELLED" /> : <StatusBadge value={r.receivable_status || "PENDING"} />}</td>
                      <td>{r.last_shared ? (() => {
                        // a failed attempt (e.g. the email server refused) shows as failed, with the reason on hover
                        const failed = r.last_shared.status === "FAILED";
                        const [label, Icon] = failed ? [r.last_shared.channel === "EMAIL" ? "Email failed" : "Sending failed", FiAlertCircle] : SHARED_AS[r.last_shared.channel] || SHARED_AS.OTHER;
                        return <span className={`bl-sent ${failed ? "failed" : ""}`} title={failed && r.last_shared.error ? r.last_shared.error : undefined}><span className="bl-sent-ic"><Icon /></span><span><b>{label}</b><span className="bl-sub">{r.last_shared.by || "—"}{r.last_shared.at ? ` · ${new Date(r.last_shared.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}</span></span></span>; })() : <span className="ac-sub">Not sent</span>}</td>
                      <td>
                        <div className="bl-actgroup" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="bl-actg" onClick={() => pdf(r.id)} title="View PDF" aria-label="View PDF"><FiExternalLink /></button>
                          {!cancelled && me.can("SHARE_INVOICE") && (
                            <button type="button" className="bl-actg blue" disabled={emailing === r.id} title="Email to the customer" aria-label={`Email ${r.invoice_number} to the customer`}
                              onClick={async () => {
                                setEmailing(r.id);
                                setMsg({});
                                try { setMsg({ ok: await emailInvoice(r.id) }); } catch (err) { setMsg({ error: err.message }); } finally { setEmailing(null); reload(); }
                              }}>
                              {emailing === r.id ? <span className="sk-spin sm" aria-hidden="true" /> : <FiMail />}
                            </button>
                          )}
                          {!cancelled && me.can("CANCEL_INVOICE") && (
                            <button type="button" className="bl-actg red" disabled={paidSomething} title={paidSomething ? "A payment is recorded - remove it on the invoice page first" : "Cancel invoice"} aria-label="Cancel invoice" onClick={() => setCancelling(r)}>
                              <FiXCircle />
                            </button>
                          )}
                        </div>
                        
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {data && <Pager total={data.total} pageSize={PAGE_SIZE} page={page} onPage={setPage} />}
      </div>

      {cancelling && (
        <CancelDialog
          invoice={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setMsg({ ok: `Invoice ${cancelling.invoice_number} cancelled.` });
            setCancelling(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

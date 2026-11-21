import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { FiAlertTriangle, FiCheckCircle, FiClock, FiDownload, FiEdit3, FiFileText, FiInbox, FiMail, FiPlayCircle, FiPrinter, FiRefreshCw, FiSearch, FiSend } from "react-icons/fi";
import { billingGet, billingPost, downloadFile, qs, useBilling } from "./billingApi";
import { amount, dmy, monthLabel, periodLabel, rupees, rupeesShort, thisMonth } from "./format";
import IssueDialog from "./IssueDialog";
import Donut from "./Donut";
import CustomerFilter from "./CustomerFilter";
import { Kpi, Msg } from "./ui";
import useDebounced from "./useDebounced";
import { BILLING_HOME } from "./access";
import { RowsSkeleton } from "./Skeletons";

// Accounts dashboard: the month at a glance and the three one-click actions.
//   Generate all ready  -> drafts for every contract whose SOS is in and nothing blocks it
//   Issue all drafts    -> checks every draft, shows all warnings, issues (and emails per profile)
//   Download all issued -> every issued invoice of the month in one PDF (or with print copies)

const EMAIL_LABEL = { SENT: ["Email sent", "ok"], FAILED: ["Email failed", "err"] };

export default function AccountsDashboard() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const [picked, setPicked] = useState([]); // customer filter: [] = all customers
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/dashboard${qs({ month, company_ids: picked.join(","), q })}`);
  // Live: refreshed every 2 minutes (numbers and charts animate to the new values).
  const [updatedAt, setUpdatedAt] = useState(null);
  useEffect(() => {
    if (data) setUpdatedAt(new Date());
  }, [data]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 120000);
    return () => clearInterval(id);
  }, [reload]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({});
  const [issuing, setIssuing] = useState(null);
  const k = data?.kpis;
  const canGenerate = me.can("GENERATE_INVOICE");
  const canIssue = me.can("ISSUE_INVOICE");

  async function generateAll() {
    if (!data?.ready.length) return;
    setBusy("generate");
    setMsg({});
    try {
      const r = await billingPost("/runs", { month, contract_ids: data.ready.map((x) => x.contract_id) });
      setMsg({ ok: `${r.drafts.length} draft${r.drafts.length === 1 ? "" : "s"} created${r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped.map((s) => `${s.customer || s.contract_code}: ${s.reason}`).join("; ")})` : ""}. Review them, then Issue all.` });
      reload();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy("");
    }
  }

  async function issueAll() {
    setBusy("issue");
    setMsg({});
    try {
      const r = await billingGet("/invoices?status=DRAFT&page_size=200");
      if (!r.rows.length) setMsg({ ok: "There are no drafts to issue." });
      else setIssuing(r.rows); // every draft is checked in the dialog; ones with errors are listed, not issued
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy("");
    }
  }

  async function downloadAll(copies) {
    setBusy(copies);
    setMsg({});
    try {
      const r = await downloadFile(`/invoices/download${qs({ month, copies })}`, `Invoices ${monthLabel(month)}.pdf`);
      setMsg({ ok: `Downloaded ${r.count ? `${r.count} invoice(s) - ` : ""}${r.name}` });
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy("");
    }
  }

  const goRun = () => navigate(`${BILLING_HOME}/run`);
  const goSos = (r) => navigate(`${BILLING_HOME}/sos/${encodeURIComponent(r.company_id)}?month=${String(r.period_start).slice(0, 7)}`);
  const maxTrend = Math.max(1, ...(data?.trend || []).map((t) => t.value));

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Billing dashboard</h1>
          <p className="ac-sub ad-live">
            <span className="ad-live-dot" aria-hidden="true" /> Live · {monthLabel(month)}
            {updatedAt ? ` · updated ${updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
          </p>
        </div>
        <div className="ac-actions ad-filters">
          <div className="bl-search ad-search">
            <FiSearch aria-hidden="true" />
            <input className="ac-input" placeholder="Customer or invoice…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          </div>
          <CustomerFilter
            options={(data?.customers || []).map((c) => ({ id: c.company_id, name: c.name, group: c.group, outlets: c.outlets }))}
            value={picked}
            onChange={setPicked}
          />
          <input type="month" className="ac-input" style={{ width: 165, height: 42 }} value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} aria-label="Month" />
          <button type="button" className={`bl-refresh ${loading ? "spin" : ""}`} onClick={reload} disabled={loading} title="Refresh now" aria-label="Refresh now"><FiRefreshCw /></button>
        </div>
      </div>
      <Msg error={error} />

      {/* One-click actions */}
      <div className="ad-actions">
        <button type="button" className="ad-action blue" disabled={!canGenerate || busy || !k?.ready} onClick={generateAll}>
          <span className="ad-action-icon"><FiPlayCircle /></span>
          <span className="ad-action-text"><b>{busy === "generate" ? "Generating…" : `Generate all ready (${k?.ready ?? 0})`}</b><span>{k?.ready ? `${rupees(k.ready_value)} incl. GST · SOS received, nothing blocking` : "Nothing ready to bill"}</span></span>
        </button>
        <button type="button" className="ad-action green" disabled={!canIssue || busy || !k?.drafts} onClick={issueAll}>
          <span className="ad-action-icon"><FiSend /></span>
          <span className="ad-action-text"><b>{busy === "issue" ? "Loading…" : `Issue all drafts (${k?.drafts ?? 0})`}</b><span>{k?.drafts ? `${rupees(k.drafts_value)} · checked first, emailed as per profile` : "No drafts waiting"}</span></span>
        </button>
        <div className="ad-action purple as-group">
          <span className="ad-action-icon"><FiDownload /></span>
          <span className="ad-action-text"><b>Download all issued ({k?.issued ?? 0})</b><span>One PDF for {monthLabel(month)}</span></span>
          <span className="ad-action-btns">
            <button type="button" className="ac-btn sm" disabled={busy || !k?.issued} onClick={() => downloadAll("original")}><FiFileText /> {busy === "original" ? "…" : "Originals"}</button>
            <button type="button" className="ac-btn sm" disabled={busy || !k?.issued} onClick={() => downloadAll("print")}><FiPrinter /> {busy === "print" ? "…" : "Print copies"}</button>
          </span>
        </div>
      </div>
      <Msg {...msg} />

      <div className="ac-kpis ad-kpis">
        <Kpi color="blue" label="SOS received" icon={FiInbox} progress={k && k.sos_customers ? (k.sos_submitted * 100) / k.sos_customers : null} value={k ? `${k.sos_submitted} / ${k.sos_customers}` : "—"} note="from the Service Coordinator" onClick={() => navigate(`${BILLING_HOME}/sos?month=${month}`)} />
        <Kpi color="green" label="Ready to bill" icon={FiPlayCircle} value={k?.ready ?? "—"} note={k ? rupeesShort(k.ready_value) : ""} onClick={goRun} />
        <Kpi color="orange" label="Waiting for SOS" icon={FiClock} value={k?.waiting_sos ?? "—"} note="cannot bill yet" onClick={() => navigate(`${BILLING_HOME}/sos?month=${month}&status=NOT_STARTED`)} />
        <Kpi color="purple" label="Drafts" icon={FiEdit3} value={k?.drafts ?? "—"} note={k ? rupeesShort(k.drafts_value) : ""} onClick={() => navigate(`${BILLING_HOME}/drafts`)} />
        <Kpi color="blue" label="Issued" icon={FiFileText} value={k?.issued ?? "—"} note={k ? rupeesShort(k.issued_value) : ""} onClick={() => navigate(`${BILLING_HOME}/invoices`)} />
        <Kpi color="red" label="Late" icon={FiAlertTriangle} value={k?.late ?? "—"} note="past the bill-by day" />
      </div>

      <div className="ad-grid">
        <section className="ac-card ad-panel ad-chartcard">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}>Billing status - {monthLabel(month)}</h3></div>
          <Donut
            title="Billing status"
            centerValue={k ? k.issued : "—"}
            centerLabel={k ? `issued of ${k.issued + k.drafts + k.ready + k.waiting_sos}` : ""}
            emptyText="Nothing to bill"
            segments={[
              { key: "issued", label: "Issued", value: k?.issued || 0, color: "#e0a800" },
              { key: "drafts", label: "Drafts", value: k?.drafts || 0, color: "#eb6834" },
              { key: "ready", label: "Ready to bill", value: k?.ready || 0, color: "#1baf7a" },
              { key: "waiting", label: "Waiting for SOS", value: k?.waiting_sos || 0, color: "#3b82f6" },
            ]}
          />
        </section>

        <section className="ac-card ad-panel ad-chartcard">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}>Collections - {monthLabel(month)}</h3><span className="ac-sub">{rupeesShort(k?.issued_value || 0)} invoiced</span></div>
          <Donut
            title="Collections"
            centerValue={k && k.issued_value ? `${Math.round((k.collected * 100) / k.issued_value)}%` : "—"}
            centerLabel="collected"
            emptyText="Nothing invoiced"
            segments={[
              { key: "collected", label: "Collected", value: k?.collected || 0, display: rupeesShort(k?.collected || 0), color: "#0d9488" },
              { key: "pending", label: "Pending", value: k?.pending || 0, display: rupeesShort(k?.pending || 0), color: "#6d5ce8" },
            ]}
          />
        </section>

        <section className="ac-card ad-panel">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}>Invoiced - last 6 months</h3></div>
          <div className="ad-chart" role="img" aria-label="Invoiced value per month, last 6 months">
            {(data?.trend || []).map((t) => (
              <div key={t.month} className={`ad-bar-col ${t.month === month ? "current" : ""}`} tabIndex={0}>
                <div className="ad-tip"><b>{monthLabel(t.month)}</b><span>{rupees(t.value)}</span><span>{t.invoices} invoice{t.invoices === 1 ? "" : "s"}</span></div>
                <div className="ad-bar-track"><div className="ad-bar" style={{ height: `${t.value ? Math.max(4, (t.value * 100) / maxTrend) : 0}%` }} /></div>
                <span className="ad-bar-label">{monthLabel(t.month).slice(0, 3)}</span>
              </div>
            ))}
          </div>
          <table className="ad-sr-only">
            <caption>Invoiced per month</caption>
            <tbody>{(data?.trend || []).map((t) => <tr key={t.month}><th>{monthLabel(t.month)}</th><td>{amount(t.value)}</td><td>{t.invoices}</td></tr>)}</tbody>
          </table>
        </section>

        <section className="ac-card ad-panel ad-late">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}><FiAlertTriangle /> Late - bill-by day passed</h3><span className="bl-tag err">{data?.late.length ?? 0}</span></div>
          {loading && !data ? <RowsSkeleton rows={3} avatar /> : !data?.late.length ? <div className="ad-empty ok"><FiCheckCircle /> Nobody is late.</div> : (
            <div className="cd-list">
              {data.late.slice(0, 8).map((r) => (
                <button key={r.contract_id} type="button" className="cd-item" onClick={() => (r.sos === "PENDING" ? goSos(r) : goRun())}>
                  <span className="cd-item-main"><b>{r.customer}</b><span className="ac-sub">{r.contract_code} · {periodLabel(r.period_start, r.period_end)}{r.bill_by_day ? ` · bill by day ${r.bill_by_day}` : ""}</span></span>
                  <span className={`bl-tag ${r.sos === "PENDING" ? "warn" : r.already_drafted ? "info" : "err"}`}>{r.sos === "PENDING" ? "Waiting for SOS" : r.already_drafted ? "Draft - issue it" : "Not billed"}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="ac-card ad-panel">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}><FiPlayCircle /> Ready to bill</h3><button type="button" className="bl-link" onClick={goRun}>Bill Run →</button></div>
          {!data?.ready.length ? <div className="ad-empty">Nothing ready. Contracts appear here once their SOS is in.</div> : (
            <div className="cd-list">
              {data.ready.slice(0, 8).map((r) => (
                <div key={r.contract_id} className="cd-item static">
                  <span className="cd-item-main"><b>{r.customer}</b><span className="ac-sub">{r.contract_code} · {periodLabel(r.period_start, r.period_end)} · {{ FIXED: "Fixed amount", PER_SQFT: "Per sq. ft", PER_SQM: "Per sq. m" }[r.structure] || "Service based"}</span></span>
                  <b className="bl-num">{r.estimated_total === null ? "—" : rupees(r.estimated_total)}</b>
                </div>
              ))}
              {data.ready.length > 8 && <span className="ac-sub">+ {data.ready.length - 8} more</span>}
            </div>
          )}
        </section>

        <section className="ac-card ad-panel">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}><FiClock /> Waiting for SOS</h3><span className="bl-tag warn">{data?.waiting_sos.length ?? 0}</span></div>
          {!data?.waiting_sos.length ? <div className="ad-empty ok"><FiCheckCircle /> Every SOS is in.</div> : (
            <div className="cd-list">
              {data.waiting_sos.slice(0, 8).map((r) => (
                <button key={r.contract_id} type="button" className="cd-item" onClick={() => goSos(r)}>
                  <span className="cd-item-main"><b>{r.customer}</b><span className="ac-sub">{r.contract_code} · {periodLabel(r.period_start, r.period_end)}</span></span>
                  <span className="ac-sub">Open SOS →</span>
                </button>
              ))}
            </div>
          )}
          {data?.blocked.length > 0 && <div className="ac-sub" style={{ marginTop: 10 }}><FiAlertTriangle /> {data.blocked.length} more blocked (profile, PO or prices) - see the Bill Run.</div>}
        </section>

        <section className="ac-card ad-panel ad-span3">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}><FiMail /> Recently issued</h3><button type="button" className="bl-link" onClick={() => navigate(`${BILLING_HOME}/invoices`)}>All →</button></div>
          {!data?.recent.length ? <div className="ad-empty">Nothing issued in {monthLabel(month)} yet.</div> : (
            <div className="cd-list">
              {data.recent.map((r) => {
                const [label, cls] = EMAIL_LABEL[r.email_status] || ["Not emailed", ""];
                return (
                  <div key={r.id} className="cd-item static">
                    <span className="cd-item-main"><b>{r.invoice_number}</b><span className="ac-sub">{r.customer} · {dmy(r.invoice_date)}</span></span>
                    <span className={`bl-tag ${cls}`}>{label}</span>
                    <b className="bl-num">{rupees(r.total)}</b>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {issuing && <IssueDialog drafts={issuing} onDone={() => reload()} onClose={() => { setIssuing(null); reload(); }} />}
    </div>
  );
}

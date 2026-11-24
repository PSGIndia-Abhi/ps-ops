import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiChevronRight, FiPauseCircle, FiPlus, FiSearch, FiXCircle } from "react-icons/fi";
import { LuArrowRight, LuBuilding2, LuNetwork } from "react-icons/lu";
import { EmptyRow } from "../accountant/ui";
import { qs, useBilling, useCustomerOptions } from "./billingApi";
import { dmy, thisMonth, initials } from "./format";
import { Kpi, Modal, Msg, StatusBadge, TypeBadge, BackButton } from "./ui";
import useDebounced from "./useDebounced";
import CustomerFilter from "./CustomerFilter";

// Contracts & Price Lists: how each customer is billed (type, frequency, timing, PO), whether its
// billing details (Bill To, GSTIN, state) are complete, and what comes next.

const STATUS = [["ACTIVE", "Active"], ["PAUSED", "Paused"], ["ENDED", "Ended"], ["", "All"]];
const STEP_NAMES = { 1: "Customer", 2: "Contract", 3: "Purchase order", 4: "Services & prices", 6: "Print & email", 5: "Review" };

// Unfinished New Contract drafts kept in this browser by NewContract.jsx (same keys and rules:
// version 1, a customer chosen, saved within the last 30 days). One per kind: service based / group.
const draftKeys = () => {
  const me = localStorage.getItem("userId") || "me";
  return [[`bl-new-contract:${me}`, false], [`bl-new-contract-group:${me}`, true]];
};
function readDrafts() {
  try {
    return draftKeys().map(([key, group]) => {
      const d = JSON.parse(localStorage.getItem(key) || "null");
      return d && d.v === 1 && Date.now() - d.savedAt < 30 * 86400000 && d.companyId ? { ...d, key, group } : null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}
const savedLabel = (t) => new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Contracts() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const [choosing, setChoosing] = useState(false); // New contract: group based or service based
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [dueOnly, setDueOnly] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [picked, setPicked] = useState([]); // customer filter: [] = all
  const customerOptions = useCustomerOptions();
  const q = useDebounced(search);
  // Every status is loaded (for the cards); the status filter is applied here.
  const { data, error, loading } = useBilling(`/contracts${qs({ q, type, due_month: dueOnly ? thisMonth() : "" })}`);
  const { data: customers } = useBilling("/customers");
  const complete = useMemo(() => new Map((customers || []).map((c) => [c.company_id, Boolean(c.profile_complete)])), [customers]);
  // Billing details of a contract: a group based contract uses the group's Bill To (not its companies' profiles).
  const detailsOk = (c) => (c.contract_kind === "GROUP" ? c.group_bill_to_complete : complete.get(c.company_id));
  const all = (data || []).filter((c) => !picked.length || picked.includes(c.company_id));
  const count = (st) => all.filter((c) => c.status === st).length;
  const missing = all.filter((c) => customers && detailsOk(c) === false);
  const rows = all.filter((c) => (!status || c.status === status) && (!missingOnly || (customers && detailsOk(c) === false)));
  const open = (c) => navigate(`/billing/contracts/${c.id}`);

  // Unfinished drafts: on top of Active / All, alone under Draft. Hidden by the other filters
  // that a draft cannot meet (due this month, details missing).
  const canDraft = me.can("MANAGE_BILLING_MASTERS");
  const [drafts, setDrafts] = useState(() => (canDraft ? readDrafts() : []));
  const [discarding, setDiscarding] = useState(null);
  const needle = q.trim().toLowerCase();
  const shownDrafts = drafts.filter((d) => (!picked.length || picked.includes(Number(d.companyId)) || picked.includes(d.companyId))
    && (!type || d.terms?.billing_type === type) && (!needle || (d.customerName || "").toLowerCase().includes(needle)));
  const draftRows = (status === "DRAFT" || status === "ACTIVE" || status === "") && !missingOnly && !dueOnly ? shownDrafts : [];
  const contractRows = status === "DRAFT" ? [] : rows;
  const continueDraft = (d) => navigate(`/billing/contracts/new?${d.group ? "type=group&" : ""}resume=1`);
  function discardDraft(d) {
    try { localStorage.removeItem(d.key); } catch { /* ignore */ }
    const left = readDrafts();
    setDrafts(left);
    setDiscarding(null);
    if (status === "DRAFT" && !left.length) setStatus("ACTIVE");
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <div className="bl-backrow"><BackButton to="/billing/masters" label="Masters" /></div>
          <h1 className="ac-title">Contracts &amp; Price Lists</h1>
        </div>
        {me.can("MANAGE_BILLING_MASTERS") && (
          <div className="ac-actions">
            <button type="button" className="ac-btn ac-btn-primary" onClick={() => setChoosing(true)}><FiPlus /> New contract</button>
          </div>
        )}
      </div>

      {/* New contract: first choose the kind. Company based = the steps for one customer (company);
          group based = companies of a group, one Bill To for the group. */}
      {choosing && (
        <Modal onClose={() => setChoosing(false)} narrow label="New contract">
          <div className="bl-m-head">
            <div><h3>New contract</h3><div className="ac-sub">What kind of contract is it?</div></div>
            <button type="button" className="bl-x" onClick={() => setChoosing(false)} aria-label="Close">✕</button>
          </div>
          <div className="bl-m-body">
            <div className="nc-kind-pick">
              <button type="button" className="nc-kind-card blue" onClick={() => navigate("/billing/contracts/new")}>
                <span className="nc-kind-ic"><LuBuilding2 /></span>
                <span className="nc-kind-txt">
                  <b>Company based</b>
                  <span>One company, its outlets and services. Billed to the company.</span>
                </span>
                <ul className="nc-kind-points">
                  <li>Bill To of the company</li>
                  <li>Per outlet or whole company</li>
                </ul>
                <span className="nc-kind-go">Start <LuArrowRight /></span>
              </button>
              <button type="button" className="nc-kind-card violet" onClick={() => navigate("/billing/contracts/new?type=group")}>
                <span className="nc-kind-ic"><LuNetwork /></span>
                <span className="nc-kind-txt">
                  <b>Group based</b>
                  <span>Several companies of one group on a single invoice.</span>
                </span>
                <ul className="nc-kind-points">
                  <li>One Bill To for the group</li>
                  <li>Tick the companies to include</li>
                </ul>
                <span className="nc-kind-go">Start <LuArrowRight /></span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="ac-kpis">
        <Kpi color="green" icon={FiCheckCircle} label="Active" value={data ? count("ACTIVE") : "—"} note="billing every period" onClick={() => { setStatus("ACTIVE"); setMissingOnly(false); }} active={status === "ACTIVE" && !missingOnly} />
        <Kpi color="orange" icon={FiPauseCircle} label="Paused" value={data ? count("PAUSED") : "—"} note="not billed while paused" onClick={() => { setStatus("PAUSED"); setMissingOnly(false); }} active={status === "PAUSED" && !missingOnly} />
        <Kpi color="purple" icon={FiXCircle} label="Ended" value={data ? count("ENDED") : "—"} note="no more invoices" onClick={() => { setStatus("ENDED"); setMissingOnly(false); }} active={status === "ENDED" && !missingOnly} />
        <Kpi color="red" icon={FiAlertTriangle} label="Billing details missing" value={data && customers ? missing.length : "—"} note="cannot be invoiced yet" onClick={() => { setStatus(""); setMissingOnly(true); }} active={missingOnly} />
      </div>

      <div className="ac-card">
        <div className="bl-filterbar">
          <div className="bl-search">
            <FiSearch aria-hidden="true" />
            <input className="ac-input" placeholder="Search customer or contract code…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          </div>
          <CustomerFilter options={customerOptions} value={picked} onChange={setPicked} />
          <select className="ac-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            <option value="AMC">AMC</option>
            <option value="ONE_TIME">One-time</option>
            <option value="TERMITE">Termite</option>
            <option value="CHEMICAL">Chemical</option>
          </select>
          <div className="bl-seg2" role="group" aria-label="Status">
            {STATUS.map(([v, l]) => (
              <button key={v} type="button" className={status === v ? "active" : ""} aria-pressed={status === v} onClick={() => setStatus(v)}>
                {l}<span className="bl-seg2-n">{data ? (v ? count(v) : all.length) : "…"}</span>
              </button>
            ))}
            {drafts.length > 0 && (
              <button type="button" className={`bl-seg2-draft ${status === "DRAFT" ? "active" : ""}`} aria-pressed={status === "DRAFT"} onClick={() => { setStatus("DRAFT"); setMissingOnly(false); setDueOnly(false); }}>
                Draft<span className="bl-seg2-n">{drafts.length}</span>
              </button>
            )}
          </div>
          <button type="button" className={`bl-chiptoggle ${dueOnly ? "on" : ""}`} aria-pressed={dueOnly} onClick={() => setDueOnly((x) => !x)}><FiCalendar /> Due this month</button>
          <button type="button" className={`bl-chiptoggle warn ${missingOnly ? "on" : ""}`} aria-pressed={missingOnly} onClick={() => setMissingOnly((x) => !x)}><FiAlertTriangle /> Details missing</button>
        </div>
        <Msg error={error} />
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack bl-tabstack bl-ctable">
            <thead>
              <tr><th>Customer</th><th>Type</th><th>Structure</th><th>Next period</th><th>Bill date</th><th>PO</th><th>Billing details</th><th>Status</th><th>Last invoice</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <EmptyRow cols={10} loading text="" />
              ) : !contractRows.length && !draftRows.length ? (
                <EmptyRow cols={10} text={status === "DRAFT" ? "No unfinished contracts match." : missingOnly ? "Every contract's customer has its billing details." : "No contracts match."} />
              ) : [...draftRows.map((d) => (
                <tr key={d.key} className="bl-rowlink bl-draftrow" onClick={() => continueDraft(d)} title="Continue this contract">
                  <td>
                    <div className="bl-cell2">
                      <span className="bl-avatar-sm">{initials(d.customerName || "?")}</span>
                      <div>
                        <b>{d.customerName || "Customer chosen"}</b>
                        <div className="bl-draft-sub">At “{STEP_NAMES[d.step] || "Customer"}” · saved {savedLabel(d.savedAt)}</div>
                      </div>
                    </div>
                  </td>
                  <td>{d.terms?.billing_type ? <TypeBadge type={d.terms.billing_type} frequency={d.terms.frequency_months} unit={d.terms.frequency_unit} /> : <span className="ac-sub">—</span>}</td>
                  <td><span className="bl-soft">{d.group ? "Group based" : d.terms?.billing_type === "TERMITE" ? "Per area" : d.terms?.shortfall_billing === "FULL" ? "Fixed amount" : "Service based"}</span></td>
                  <td><span className="ac-sub">—</span></td>
                  <td><span className="bl-soft">{d.terms?.bill_day ? `Day ${d.terms.bill_day}` : "—"}</span></td>
                  <td><span className="ac-sub">—</span></td>
                  <td><span className="ac-sub">Not finished</span></td>
                  <td><span className="bl-draft-badge">Draft</span></td>
                  <td colSpan={2}>
                    <div className="bl-draft-acts">
                      <button type="button" className="ac-btn sm" onClick={(e) => { e.stopPropagation(); setDiscarding(d); }}>Discard</button>
                      <button type="button" className="ac-btn sm ac-btn-primary" onClick={(e) => { e.stopPropagation(); continueDraft(d); }}>Continue →</button>
                    </div>
                  </td>
                </tr>
              )), ...contractRows.map((c) => (
                <tr key={c.id} className="bl-rowlink" onClick={() => open(c)}>
                  <td>
                    <div className="bl-cell2" title={c.contract_code}>
                      <span className="bl-avatar-sm">{initials(c.group_name || c.customer)}</span>
                      <b>{c.group_name || c.customer}</b>
                    </div>
                  </td>
                  <td><TypeBadge type={c.billing_type} frequency={c.frequency_months} unit={c.frequency_unit} /></td>
                  <td><span className="bl-soft">{c.billing_type === "TERMITE" ? `Per ${c.area_unit === "sq.ft" ? "sq. ft" : "sq. m"}` : c.shortfall_billing === "FULL" ? "Fixed amount" : "Service based"}</span></td>
                  <td><span className="bl-date">{dmy(c.next_period_start)}</span></td>
                  <td><span className="bl-soft">{c.bill_day ? `Day ${c.bill_day}` : "—"}</span></td>
                  <td>{c.po_required ? <StatusBadge value="PARTIAL" label="Required" /> : <span className="ac-sub">—</span>}</td>
                  <td>
                    {!customers ? <span className="ac-sub">…</span> : detailsOk(c)
                      ? <span className="bl-okline"><FiCheckCircle /> Complete</span>
                      : <span className="bl-okline bad"><FiAlertTriangle /> Missing</span>}
                  </td>
                  <td><StatusBadge value={c.status} /></td>
                  <td>{c.last_invoice_number ? <span className="bl-mono">{c.last_invoice_number}</span> : <span className="ac-sub">—</span>}</td>
                  <td><FiChevronRight style={{ color: "#94a3b8" }} /></td>
                </tr>
              ))]}
            </tbody>
          </table>
        </div>
      </div>

      {discarding && (
        <Modal onClose={() => setDiscarding(null)} narrow label="Discard unfinished contract">
          <div className="bl-m-head">
            <h3>Delete this unfinished contract?</h3>
            <button type="button" className="bl-x" onClick={() => setDiscarding(null)} aria-label="Close">✕</button>
          </div>
          <div className="bl-m-body">
            <p className="ac-sub" style={{ margin: 0 }}>Everything typed for {discarding.customerName || "this customer"} will be removed. This cannot be undone.</p>
          </div>
          <div className="bl-m-foot"><span /><div className="ac-actions">
            <button type="button" className="ac-btn" onClick={() => setDiscarding(null)}>Keep it</button>
            <button type="button" className="ac-btn ac-btn-danger" onClick={() => discardDraft(discarding)}>Delete draft</button>
          </div></div>
        </Modal>
      )}
    </div>
  );
}

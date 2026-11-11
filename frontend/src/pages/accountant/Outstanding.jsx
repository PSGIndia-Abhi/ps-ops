import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiActivity, FiAlertTriangle, FiCalendar, FiClock, FiDownload, FiFileText, FiList, FiPlusCircle, FiSearch } from "react-icons/fi";
import { DataError, EmptyRow, Pager, Skeleton } from "./ui";
import { money } from "./format";
import { sortGroups, daysOverdue, showDate, useAccountantData, usePaged } from "./data";
import { exportCsv } from "./exportCsv";
import MultiSelect from "../../components/accountant/MultiSelect";

const CHIPS = [
  { key: "ALL", label: "All Unpaid", icon: <FiList />, test: () => true },
  { key: "OVERDUE", label: "Overdue", icon: <FiAlertTriangle />, test: (i) => (daysOverdue(i.due_date) ?? -1) > 0 },
  { key: "TODAY", label: "Due Today", icon: <FiClock />, test: (i) => daysOverdue(i.due_date) === 0 },
  { key: "WEEK", label: "Due This Week", icon: <FiCalendar />, test: (i) => { const d = daysOverdue(i.due_date); return d != null && d <= 0 && d >= -7; } },
  { key: "MONTH", label: "Due This Month", icon: <FiCalendar />, test: (i) => { const d = daysOverdue(i.due_date); return d != null && d <= 0 && d >= -30; } },
];

const BUCKETS = [
  { key: "NOTDUE", label: "Not Due", test: (d) => d <= 0 },
  { key: "1-30", label: "1 – 30 Days", test: (d) => d >= 1 && d <= 30 },
  { key: "31-60", label: "31 – 60 Days", test: (d) => d >= 31 && d <= 60 },
  { key: "60+", label: "60+ Days", test: (d) => d > 60 },
];

const sum = (list, key) => list.reduce((s, i) => s + (Number(i[key]) || 0), 0);

function severity(days) {
  if (days == null || days <= 0) return "";
  if (days <= 30) return "ac-sev-1";
  if (days <= 60) return "ac-sev-2";
  return "ac-sev-3";
}

export default function Outstanding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoices, loading, error, reload } = useAccountantData();
  const [chip, setChip] = useState("ALL");
  const [search, setSearch] = useState("");
  // "Open in Outstanding" from Customer Outstanding arrives filtered to that customer.
  // Several customers can be ticked; [] means all customers.
  const [picked, setPicked] = useState(location.state?.customer ? [location.state.customer] : []);
  const [pickedSites, setPickedSites] = useState([]); // [] = all sites
  const [buckets, setBuckets] = useState([]); // ageing keys; [] = all
  const [minAmount, setMinAmount] = useState("");

  // Unpaid invoices only, most overdue first.
  const unpaid = useMemo(
    () =>
      invoices
        .filter((i) => i.status !== "CANCELLED" && i.pending_amount > 0)
        .sort((a, b) => (daysOverdue(b.due_date) ?? -Infinity) - (daysOverdue(a.due_date) ?? -Infinity)),
    [invoices]
  );

  const [groups, setGroups] = useState([]); // [] = all groups
  // "No Group" goes last.
  const groupOptions = useMemo(
    () => sortGroups(unpaid.map((i) => i.group_name)),
    [unpaid]
  );
  const inGroups = (i) => !groups.length || groups.includes(i.group_name);
  // Only the customers of the ticked groups.
  const customers = useMemo(
    () => [...new Set(unpaid.filter((i) => !groups.length || groups.includes(i.group_name)).map((i) => i.customer_name))].sort(),
    [unpaid, groups]
  );
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const customerMatch = (i) => !pickedSet.size || pickedSet.has(i.customer_name);
  // Narrowed to the selected customers' own sites, so the Site dropdown never
  // offers a site that belongs to someone else.
  const sites = useMemo(
    () => [...new Set(unpaid
      .filter((i) => (!groups.length || groups.includes(i.group_name)) && (!pickedSet.size || pickedSet.has(i.customer_name)))
      .map((i) => i.site_name).filter(Boolean))].sort(),
    [unpaid, groups, pickedSet]
  );

  const activeChip = CHIPS.find((c) => c.key === chip);
  const activeBuckets = BUCKETS.filter((b) => buckets.includes(b.key));

  const rows = unpaid.filter((i) => {
    if (!activeChip.test(i)) return false;
    if (!inGroups(i)) return false;
    if (!customerMatch(i)) return false;
    if (pickedSites.length && !pickedSites.includes(i.site_name)) return false;
    if (minAmount && i.pending_amount < Number(minAmount)) return false;
    if (activeBuckets.length) {
      const d = daysOverdue(i.due_date);
      if (d == null || !activeBuckets.some((b) => b.test(d))) return false;
    }
    const q = search.trim().toLowerCase();
    return !q || `${i.invoice_number} ${i.customer_name}`.toLowerCase().includes(q);
  });
  const { pageRows, page, setPage, pageSize } = usePaged(rows, 25); // 25 invoices a page

  // The 5 tiles reflect whatever is currently filtered (chip, search, customer,
  // site, ageing bucket, min. pending) -- the same set the table below shows.
  const overdueRows = rows.filter((i) => (daysOverdue(i.due_date) ?? -1) > 0);
  const weekRows = rows.filter((i) => CHIPS[3].test(i));
  const avgDays = overdueRows.length
    ? Math.round(overdueRows.reduce((s, i) => s + daysOverdue(i.due_date), 0) / overdueRows.length)
    : null;
  const hasData = unpaid.length > 0;

  const cards = [
    { key: "orange", icon: <FiClock />, label: "Total Outstanding", value: money(sum(rows, "pending_amount")) },
    { key: "red", icon: <FiAlertTriangle />, label: "Overdue Amount", value: money(sum(overdueRows, "pending_amount")) },
    { key: "purple", icon: <FiCalendar />, label: "Due This Week", value: money(sum(weekRows, "pending_amount")) },
    { key: "blue", icon: <FiFileText />, label: "Unpaid Invoices", value: rows.length },
    { key: "light", icon: <FiActivity />, label: "Avg. Days Overdue", value: avgDays == null ? "—" : `${avgDays} days` },
  ];

  const filterChange = (setter) => (e) => { setter(e.target.value); setPage(0); };
  // Unticks sites that no longer belong to the ticked groups / customers.
  const pruneSites = (groupList, customerList) => {
    const keep = pickedSites.filter((s) => unpaid.some((i) => i.site_name === s
      && (!groupList.length || groupList.includes(i.group_name))
      && (!customerList.length || customerList.includes(i.customer_name))));
    if (keep.length !== pickedSites.length) setPickedSites(keep);
  };
  // Ticking groups unticks customers and sites that are not in them.
  const changeGroups = (list) => {
    setGroups(list);
    let customerList = picked;
    if (list.length) {
      customerList = picked.filter((c) => unpaid.some((i) => i.customer_name === c && list.includes(i.group_name)));
      if (customerList.length !== picked.length) setPicked(customerList);
    }
    pruneSites(list, customerList);
    setPage(0);
  };
  const changeCustomers = (list) => {
    setPicked(list);
    pruneSites(groups, list);
    setPage(0);
  };

  function exportRows() {
    exportCsv("outstanding-invoices.csv", [
      { header: "Invoice No", value: (i) => i.invoice_number },
      { header: "Group", value: (i) => i.group_name },
      { header: "Customer", value: (i) => i.customer_name },
      { header: "Site", value: (i) => i.site_name },
      { header: "Due Date", value: (i) => i.due_date },
      { header: "Days Overdue", value: (i) => { const d = daysOverdue(i.due_date); return d != null && d > 0 ? d : 0; } },
      { header: "Invoice Amount", value: (i) => i.invoice_amount },
      { header: "Paid", value: (i) => i.paid_amount },
      { header: "Pending", value: (i) => i.pending_amount },
    ], rows);
  }

  return (
    <div className="ac-page ac-outstanding">
      <div className="ac-head">
        <div>
          <h2 className="ac-title ac-title-icon"><FiClock /> Outstanding</h2>
          <p className="ac-sub">Unpaid invoices to collect, most overdue first</p>
        </div>
        <button type="button" className="ac-btn" onClick={exportRows} disabled={!rows.length}><FiDownload /> Export</button>
      </div>

      <DataError error={error} onRetry={reload} />

      <div className="ac-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {cards.map((c) => (
          <div key={c.label} className={`ac-kpi ${c.key}`}>
            <span className="ac-kpi-icon" aria-hidden="true">{c.icon}</span>
            <div className="ac-kpi-label">{c.label}</div>
            <div className="ac-kpi-value" style={{ fontSize: 20 }}>{loading ? <Skeleton width="60%" height={22} /> : hasData ? c.value : "—"}</div>
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-chips" style={{ marginBottom: 14 }}>
          {CHIPS.map((c) => (
            <button key={c.key} type="button" className={`ac-chip ${chip === c.key ? "active" : ""}`} onClick={() => { setChip(c.key); setPage(0); }}>
              <span className="ac-tab-icon">{c.icon}</span>{c.label} ({unpaid.filter(c.test).length})
            </button>
          ))}
        </div>

        <div className="ac-filters-6" style={{ marginBottom: 14 }}>
          <div className="ac-search"><FiSearch /><input className="ac-input" placeholder="Search invoice no or customer" value={search} onChange={filterChange(setSearch)} /></div>
          <MultiSelect options={groupOptions} value={groups} onChange={changeGroups} allLabel="All Groups" ariaLabel="Groups" />
          <MultiSelect options={customers} value={picked} onChange={changeCustomers} allLabel="All Customers" ariaLabel="Customers" />
          <MultiSelect options={sites} value={pickedSites} onChange={(list) => { setPickedSites(list); setPage(0); }} allLabel="All Sites" ariaLabel="Sites" />
          <MultiSelect options={BUCKETS.map((b) => ({ value: b.key, label: b.label }))} value={buckets}
            onChange={(list) => { setBuckets(list); setPage(0); }} allLabel="All Ageing" ariaLabel="Ageing" />
          <input className="ac-input" type="number" min="0" placeholder="Min. pending (₹)" value={minAmount} onChange={filterChange(setMinAmount)} />
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th>Invoice No</th><th>Customer / Site</th><th>Due Date</th><th className="ac-num">Days Overdue</th>
                <th className="ac-num">Invoice Amount</th><th className="ac-num">Paid</th><th className="ac-num">Pending</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((i) => {
                const d = daysOverdue(i.due_date);
                return (
                  <tr key={i.id}>
                    <td>
                      <button type="button" className="ac-link" onClick={() => navigate(`/accountant/invoices/${i.id}`)}>{i.invoice_number}</button>
                    </td>
                    <td>{i.customer_name}{i.site_name && <div className="ac-sub">{i.site_name}</div>}</td>
                    <td>{showDate(i.due_date) || "—"}</td>
                    <td className={`ac-num ${severity(d)}`}>{d == null ? "—" : d > 0 ? d : "Not due"}</td>
                    <td className="ac-num">{money(i.invoice_amount)}</td>
                    <td className="ac-num">{money(i.paid_amount)}</td>
                    <td className="ac-num ac-money-red">{money(i.pending_amount)}</td>
                    <td>
                      <div className="ac-actions" style={{ flexWrap: "nowrap" }}>
                        <button type="button" className="ac-link" title="Record payment" aria-label="Record payment"
                          onClick={() => navigate("/accountant/payments/record", { state: { customerId: i.customer_id } })}><FiPlusCircle /></button>
                      </div>
                    </td>
                  </tr>
                );
              }) : <EmptyRow cols={8} loading={loading} text="No outstanding invoices" />}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>Total pending for all {rows.length} row{rows.length === 1 ? "" : "s"} shown</td>
                <td className="ac-num ac-money-red">{money(sum(rows, "pending_amount"))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>
    </div>
  );
}

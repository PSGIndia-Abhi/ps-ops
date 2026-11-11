import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiCalendar, FiCheckCircle, FiChevronDown, FiDownload, FiFlag, FiGrid, FiLayers, FiSearch, FiUser, FiX } from "react-icons/fi";
import { OPERATIONS, PRIORITIES, PRIORITY, actionText, exportTickets, formatDay, getPeople, isPast, listTickets, monthLabel } from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import { Card, Empty, ErrorBox, Loading, PageHead, PriorityChip, Segmented, TicketStatusChip, Tiles } from "./ui";

const PAGE_SIZE = 25;

// One filter as a rounded chip: icon, short label, then the control. Light blue while it filters.
function FilterChip({ icon, label, active, caret = true, children }) {
  return (
    <label className={`fb-fchip ${active ? "is-on" : ""}`}>
      <span className="fb-fchip-icon" aria-hidden="true">{icon}</span>
      <span className="fb-fchip-label">{label}</span>
      {children}
      {caret && <FiChevronDown aria-hidden="true" className="fb-fchip-caret" />}
    </label>
  );
}

export default function TicketList() {
  const navigate = useNavigate();
  const { isDesk, departmentList, deptOnly, ticketsBase } = useFeedbackAccess();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "ALL";
  const priority = params.get("priority") || "";
  const owner = params.get("owner") || "";
  const month = params.get("month") || "";
  const department = params.get("department") || "";
  const page = Number(params.get("page")) || 1;
  const q = params.get("q") || "";
  const [search, setSearch] = useState(q);

  const [data, setData] = useState(null);
  const [owners, setOwners] = useState([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const setParam = useCallback(
    (changes) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === "" || v === undefined) next.delete(k);
          else next.set(k, v);
        }
        if (!("page" in changes)) next.delete("page");
        return next;
      });
    },
    [setParams],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== search.trim()) setParam({ q: search.trim() });
    }, 350);
    return () => clearTimeout(t);
  }, [search, q, setParam]);

  useEffect(() => {
    getPeople()
      .then((p) => {
        // Owners: desk users, and the supervisors / salespeople steps are assigned to.
        const all = new Map([...p.owners, ...(p.supervisors || []), ...(p.sales || [])].map((u) => [u.id, u]));
        setOwners([...all.values()].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, []);

  const filters = { status: status === "ALL" ? "" : status, priority, owner_user_id: owner, month, q, department };
  const filterKey = JSON.stringify(filters);

  const load = useCallback(() => {
    listTickets({ ...JSON.parse(filterKey), page, page_size: PAGE_SIZE })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [filterKey, page]);

  useEffect(load, [load]);

  async function download() {
    setExporting(true);
    setError("");
    try {
      await exportTickets(JSON.parse(filterKey));
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const counts = data?.status_counts || {};
  const allTickets = (counts.ACTION_PENDING || 0) + (counts.CLOSED || 0);
  const rows = data?.tickets || [];
  const overdue = rows.filter((t) => t.status === "ACTION_PENDING" && t.action_due_at && isPast(t.action_due_at)).length;

  return (
    <>
      <PageHead
        title="Feedback tickets"
        actions={
          <button type="button" className="fb-btn" onClick={download} disabled={exporting}>
            <FiDownload /> {exporting ? "Preparing…" : "Export Excel"}
          </button>
        }
      />

      <Tiles
        items={[
          { label: "Action pending", value: counts.ACTION_PENDING || 0, tone: "warn", icon: FiAlertCircle, share: allTickets ? (counts.ACTION_PENDING || 0) / allTickets : 0, sub: overdue ? `${overdue} overdue on this page` : undefined, active: status === "OPEN", onClick: () => setParam({ status: "OPEN" }) },
          { label: "Closed", value: counts.CLOSED || 0, tone: "ok", icon: FiCheckCircle, share: allTickets ? (counts.CLOSED || 0) / allTickets : 0, active: status === "CLOSED", onClick: () => setParam({ status: "CLOSED" }) },
          { label: "All tickets", value: allTickets, tone: "dark", icon: FiLayers, active: status === "ALL", onClick: () => setParam({ status: "ALL" }) },
        ]}
      />

      <ErrorBox error={error} />

      <Card bodyClass="is-flush">
        <div className="fb-filterbar">
          <Segmented
            label="Status"
            options={[
              { value: "ALL", label: "All" },
              { value: "OPEN", label: "Open" },
              { value: "CLOSED", label: "Closed" },
            ]}
            value={status}
            onChange={(v) => setParam({ status: v })}
          />
          <div className="fb-fsearch">
            <FiSearch aria-hidden="true" />
            <input placeholder="Search ticket no., customer or site" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tickets" />
            {search && (
              <button type="button" className="fb-fsearch-clear" onClick={() => setSearch("")} aria-label="Clear search">
                <FiX />
              </button>
            )}
          </div>
          <FilterChip icon={<FiFlag />} label="Priority" active={Boolean(priority)}>
            <select value={priority} onChange={(e) => setParam({ priority: e.target.value })} aria-label="Priority">
              <option value="">All</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </select>
          </FilterChip>
          {!deptOnly && departmentList.length > 0 && (
            <FilterChip icon={<FiGrid />} label="Department" active={Boolean(department)}>
              <select value={department} onChange={(e) => setParam({ department: e.target.value })} aria-label="Department">
                <option value="">All</option>
                {departmentList.map((d) => (
                  <option key={d.kind} value={d.kind}>
                    {d.name}
                  </option>
                ))}
              </select>
            </FilterChip>
          )}
          {isDesk && (
            <FilterChip icon={<FiUser />} label="Owner" active={Boolean(owner)}>
              <select value={owner} onChange={(e) => setParam({ owner: e.target.value })} aria-label="Owner">
                <option value="">All</option>
                {owners.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </FilterChip>
          )}
          <FilterChip icon={<FiCalendar />} label="Month" active={Boolean(month)} caret={false}>
            <input type="month" className={month ? "" : "is-empty"} value={month} onChange={(e) => setParam({ month: e.target.value })} aria-label="Month" />
          </FilterChip>
          {(priority || owner || month || q || department) && (
            <button
              type="button"
              className="fb-fclear"
              onClick={() => {
                setSearch("");
                setParam({ priority: "", owner: "", month: "", q: "", department: "" });
              }}
            >
              <FiX aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>

        {!data ? (
          error ? null : <Loading />
        ) : !rows.length ? (
          <Empty title={status === "OPEN" ? "No open tickets" : "No tickets match"} text={status === "OPEN" ? "Nothing needs action right now." : "Try other filters."} />
        ) : (
          <div className="fb-table-wrap">
            <table className="fb-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Customer · Site</th>
                  <th>Departments</th>
                  <th>Priority</th>
                  <th>Next step</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const late = t.status === "ACTION_PENDING" && t.action_due_at && isPast(t.action_due_at);
                  return (
                    <tr key={t.id} className="is-link" onClick={() => navigate(`${ticketsBase}/${t.id}`)}>
                      <td>
                        <span className="fb-link">{t.ticket_number}</span>
                        <div className="fb-small fb-muted">{formatDay(t.created_at)}</div>
                      </td>
                      <td>
                        <div className="fb-strong">{t.customer.name}</div>
                        <div className="fb-small fb-muted">
                          {t.site.name} · {monthLabel(t.month)}
                        </div>
                      </td>
                      <td>
                        <span className="fb-dept-chips">
                          {(t.parts?.length ? t.parts : [{ kind: OPERATIONS, label: "Operations" }]).map((p) => (
                            <span key={p.kind} className={`fb-dept-chip ${p.kind === OPERATIONS ? "is-ops" : p.kind === "ACCOUNTS" ? "is-acc" : p.kind === "SALES" ? "is-sales" : "is-other"} ${p.kind !== OPERATIONS && p.status === "DONE" ? "is-done" : ""}`}>
                              {p.label || p.kind}
                              {p.kind !== OPERATIONS && p.status === "DONE" ? " ✓" : ""}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td>
                        <PriorityChip priority={t.priority} />
                      </td>
                      <td style={{ maxWidth: 220 }}>{t.parts?.length && !t.parts.some((p) => p.kind === OPERATIONS) ? t.parts.map((p) => `${p.label}${p.status === "DONE" ? " ✓" : ""}`).join(", ") : actionText(t)}</td>
                      <td>{t.action_owner?.name || <span className="fb-muted">—</span>}</td>
                      <td className="fb-small" style={{ whiteSpace: "nowrap" }}>
                        {t.action_due_at ? <span className={late ? "fb-danger-text" : ""}>{formatDay(t.action_due_at)}{late ? " · overdue" : ""}</span> : <span className="fb-muted">—</span>}
                      </td>
                      <td>
                        <TicketStatusChip status={t.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > PAGE_SIZE && (
          <div className="fb-pager">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
            </span>
            <div className="fb-row" style={{ gap: 8 }}>
              <button type="button" className="fb-btn fb-btn-sm" disabled={page <= 1} onClick={() => setParam({ page: page - 1 })}>
                Previous
              </button>
              <button type="button" className="fb-btn fb-btn-sm" disabled={page * PAGE_SIZE >= data.total} onClick={() => setParam({ page: page + 1 })}>
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

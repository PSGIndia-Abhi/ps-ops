import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiCalendar, FiCheck, FiCheckCircle, FiChevronDown, FiDownload, FiFlag, FiGrid, FiLayers, FiSearch, FiX } from "react-icons/fi";
import { OPERATIONS, PRIORITIES, PRIORITY, actionText, exportTickets, formatDay, isPast, listTickets, monthLabel } from "./feedbackApi";
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

const PRIORITY_DOT = { VERY_HIGH: "#991b1b", HIGH: "#dc2626", MEDIUM: "#ea580c", LOW: "#4f46e5" };

// A filter chip that opens its own styled list (the browser's option list cannot be styled).
// options: [{ value, label, dot? }] - the first is "All" (value ""). Long lists get a search box.
function FilterMenu({ icon, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const selected = options.find((o) => o.value === value) || options[0];
  const shown = find ? options.filter((o) => o.label.toLowerCase().includes(find.toLowerCase())) : options;
  const withSearch = options.length > 8;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  function toggle(next) {
    if (next) {
      setFind("");
      setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    }
    setOpen(next);
  }
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  function pick(o) {
    onChange(o.value);
    setOpen(false);
  }
  function onKey(e) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) && e.target.tagName === "BUTTON") {
        e.preventDefault();
        toggle(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[hi]) pick(shown[hi]);
    }
  }

  return (
    <div className={`fb-fmenu ${open ? "is-open" : ""}`} ref={boxRef} onKeyDown={onKey}>
      <button type="button" className={`fb-fchip ${value ? "is-on" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => toggle(!open)}>
        <span className="fb-fchip-icon" aria-hidden="true">{icon}</span>
        <span className="fb-fchip-label">{label}</span>
        <span className="fb-fchip-value">
          {selected?.dot && <span className="fb-fmenu-dot" style={{ background: selected.dot }} aria-hidden="true" />}
          {selected?.label}
        </span>
        <FiChevronDown aria-hidden="true" className="fb-fchip-caret" />
      </button>
      {open && (
        <div className="fb-fmenu-pop">
          {withSearch && (
            <div className="fb-fmenu-find">
              <FiSearch aria-hidden="true" />
              <input
                autoFocus
                placeholder={`Find ${label.toLowerCase()}`}
                value={find}
                onChange={(e) => {
                  setFind(e.target.value);
                  setHi(0);
                }}
                aria-label={`Find ${label.toLowerCase()}`}
              />
            </div>
          )}
          <ul className="fb-fmenu-list" role="listbox" aria-label={label} ref={listRef}>
            {shown.map((o, i) => (
              <li
                key={o.value || "all"}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                className={`fb-fmenu-opt ${o.value === value ? "is-sel" : ""} ${i === hi ? "is-hi" : ""}`}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
              >
                {o.dot ? <span className="fb-fmenu-dot" style={{ background: o.dot }} aria-hidden="true" /> : <span className="fb-fmenu-dot is-none" aria-hidden="true" />}
                <span className="fb-fmenu-text">{o.label}</span>
                {o.value === value && <FiCheck aria-hidden="true" className="fb-fmenu-check" />}
              </li>
            ))}
            {!shown.length && <li className="fb-fmenu-empty">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function TicketList() {
  const navigate = useNavigate();
  const { departmentList, deptOnly, ticketsBase } = useFeedbackAccess();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "ALL";
  const priority = params.get("priority") || "";
  const month = params.get("month") || "";
  const department = params.get("department") || "";
  const page = Number(params.get("page")) || 1;
  const q = params.get("q") || "";
  const [search, setSearch] = useState(q);

  const [data, setData] = useState(null);
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

  const filters = { status: status === "ALL" ? "" : status, priority, month, q, department };
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
          <FilterMenu
            icon={<FiFlag />}
            label="Priority"
            value={priority}
            onChange={(v) => setParam({ priority: v })}
            options={[{ value: "", label: "All" }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label, dot: PRIORITY_DOT[p] }))]}
          />
          {!deptOnly && departmentList.length > 0 && (
            <FilterMenu
              icon={<FiGrid />}
              label="Department"
              value={department}
              onChange={(v) => setParam({ department: v })}
              options={[{ value: "", label: "All" }, ...departmentList.map((d) => ({ value: d.kind, label: d.name }))]}
            />
          )}
          <FilterChip icon={<FiCalendar />} label="Month" active={Boolean(month)} caret={false}>
            <input type="month" className={month ? "" : "is-empty"} value={month} onChange={(e) => setParam({ month: e.target.value })} aria-label="Month" />
          </FilterChip>
          {(priority || month || q || department) && (
            <button
              type="button"
              className="fb-fclear"
              onClick={() => {
                setSearch("");
                setParam({ priority: "", month: "", q: "", department: "" });
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
                        {/* Each department's issues and the note written for it. */}
                        {(t.parts || [])
                          .filter((p) => p.kind !== OPERATIONS && (p.issue_summary || (p.issues || []).length))
                          .map((p) => {
                            const text = [(p.issues || []).map((i) => (i.text ? `${i.name} (${i.text})` : i.name)).join(", "), p.issue_summary].filter(Boolean).join(" - ");
                            return (
                              <div key={p.kind} className="fb-list-note" title={`${p.label}: ${text}`}>
                                {(t.parts || []).length > 1 && <b>{p.label}: </b>}
                                {text}
                              </div>
                            );
                          })}
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

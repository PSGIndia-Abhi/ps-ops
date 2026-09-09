import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch, safeJson } from "../api";
import { formatDate } from "../utils/date";
import { DATASETS } from "./analysisDatasets";
import "./AnalysisDataPage.css";

const PAGE_SIZE = 25;

const STATUS_LABELS = {
  CREATED: "Created",
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

// "right"/"center" both need an actual CSS class — plain left alignment is
// the table's default, so no class for that case.
function alignClass(align) {
  if (align === "right") return "adp-align-right";
  if (align === "center") return "adp-align-center";
  return undefined;
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// Human-readable summary of whatever [from,to]/branchId/status/companyId
// filters came in on the URL (carried over from the dashboard's own
// filter state), shown at the top of the page so it's clear this list is
// scoped the same way the card was. Branch/customer show as ids rather
// than resolved names — good enough to confirm "yes, a filter is active"
// without an extra round-trip just to look up their labels.
function buildContextLabel(searchParams) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const parts = [];
  if (from && to) {
    parts.push(from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`);
  }
  if (searchParams.get("status")) {
    const status = searchParams.get("status");
    parts.push(`Status: ${STATUS_LABELS[status] || status}`);
  }
  if (searchParams.get("branchId")) parts.push(`Branch #${searchParams.get("branchId")}`);
  if (searchParams.get("companyId")) parts.push(`Customer #${searchParams.get("companyId")}`);
  return parts;
}

export default function AnalysisDataPage() {
  const { dataset } = useParams();
  const [searchParams] = useSearchParams();
  const config = DATASETS[dataset];

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(config?.defaultSort || null);
  const [page, setPage] = useState(1);

  const queryString = searchParams.toString();

  useEffect(() => {
    if (!config) return undefined;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await apiFetch(`${config.endpoint}?${queryString}`);
        if (!res?.ok) throw new Error("Failed to load data");
        const data = await safeJson(res);
        if (!mounted) return;
        setRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load data");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [config, queryString]);

  // A new search term, a re-sort, or landing on a different dataset can
  // all shrink the visible row set below the current page number.
  useEffect(() => {
    setPage(1);
  }, [search, sort, dataset]);

  const filteredRows = useMemo(() => {
    if (!config) return [];
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      config.searchKeys.some((key) => String(row[key] ?? "").toLowerCase().includes(query))
    );
  }, [rows, search, config]);

  const sortedRows = useMemo(() => {
    if (!sort || !config) return filteredRows;
    const column = config.columns.find((c) => c.key === sort.key);
    const getValue = column?.sortValue || ((row) => row[sort.key]);
    const sorted = [...filteredRows].sort((a, b) => compareValues(getValue(a), getValue(b)));
    return sort.dir === "desc" ? sorted.reverse() : sorted;
  }, [filteredRows, sort, config]);

  // Monthly Service Summary is a report view (a bounded few years of
  // months, not an open-ended record list) rather than a paginated list
  // like the other five — it shows every row at once, no Prev/Page/Next.
  const paginated = !config?.noPagination;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = paginated ? sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : sortedRows;

  // colWidths can carry one extra trailing entry beyond `columns` — a
  // blank spacer column (no header/cell) so the last real column doesn't
  // sit flush against the page's right edge under table-layout: fixed.
  const spacerCount = Math.max(0, (config?.colWidths?.length || 0) - (config?.columns?.length || 0));

  // Proportional to column count — a 2-column table (Employee Workload)
  // shouldn't be forced as wide as a 7-column one (Overdue Services) just
  // to get the same "don't squeeze on mobile" floor. See .adp-table's
  // min-width fallback in the CSS for when this can't be computed.
  const tableMinWidth = config
    ? Math.max(320, (config.colWidths?.length || config.columns.length) * 100)
    : undefined;

  function toggleSort(column) {
    if (column.sortable === false) return;
    setSort((prev) => {
      if (!prev || prev.key !== column.key) return { key: column.key, dir: "asc" };
      return { key: column.key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  if (!config) {
    return (
      <div className="adp-page">
        <Link to="/admin/analysis" className="adp-back-link">← Back to Analysis</Link>
        <p className="adp-state">Unknown report: "{dataset}"</p>
      </div>
    );
  }

  const contextParts = buildContextLabel(searchParams);

  return (
    <div className="adp-page">
      <Link to="/admin/analysis" className="adp-back-link">← Back to Analysis</Link>

      <div className="adp-header">
        <h1>{config.title}</h1>
        {contextParts.length > 0 && (
          <div className="adp-context">
            {contextParts.map((part) => (
              <span className="adp-context-chip" key={part}>{part}</span>
            ))}
          </div>
        )}
      </div>

      <div className="adp-toolbar">
        <input
          type="text"
          className="adp-search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="adp-count">
          {sortedRows.length} record{sortedRows.length === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <div className="adp-state adp-state-error">{error}</div>
      ) : loading ? (
        <div className="adp-state">Loading…</div>
      ) : sortedRows.length === 0 ? (
        <div className="adp-state">{config.emptyMessage}</div>
      ) : (
        <>
          <div className="adp-table-scroll">
            <table className="adp-table" style={{ minWidth: tableMinWidth }}>
              {config.colWidths && (
                <colgroup>
                  {config.colWidths.map((w, i) => (
                    <col key={i} style={{ width: `${w}%` }} />
                  ))}
                </colgroup>
              )}
              <thead>
                <tr>
                  {config.columns.map((col) => (
                    <th
                      key={col.key}
                      className={alignClass(col.align)}
                      onClick={() => toggleSort(col)}
                      data-sortable={col.sortable === false ? undefined : "true"}
                    >
                      {col.label}
                      {sort?.key === col.key && (
                        <span className="adp-sort-arrow">{sort.dir === "asc" ? " ▲" : " ▼"}</span>
                      )}
                    </th>
                  ))}
                  {spacerCount > 0 && <th aria-hidden="true" />}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={config.rowKey(row)}>
                    {config.columns.map((col) => (
                      <td key={col.key} className={alignClass(col.align)}>
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                    {spacerCount > 0 && <td aria-hidden="true" />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginated && (
            <div className="adp-pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

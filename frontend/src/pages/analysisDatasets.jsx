import { Link } from "react-router-dom";
import { FaEye } from "react-icons/fa";
import { formatDate } from "../utils/date";

// Config for the /admin/analysis/:dataset full-list pages — one entry per
// dashboard card's "View All" / "View Full Report" link.
//
// `colWidths` is a fixed set of percentages (summing to 100, one per entry
// in `columns`, an optional trailing entry is a blank spacer column with
// no header/cell) rendered as a <colgroup> under table-layout: fixed — see
// AnalysisDataPage.jsx. That's what keeps a column's data directly under
// its own header instead of drifting into a neighboring column.
//
// Dates render via the shared formatDate() (DD/MM/YYYY) so every date on
// these pages matches the dashboard's own date formatting.

function statusBadgeClass(status) {
  if (status === "Overdue") return "adp-badge adp-badge-overdue";
  if (status === "Pending") return "adp-badge adp-badge-pending";
  return "adp-badge adp-badge-upcoming";
}

function onTimeTone(pct) {
  if (pct >= 90) return "adp-good";
  if (pct >= 75) return "adp-warn";
  return "adp-bad";
}

export const DATASETS = {
  "pending-customers": {
    title: "Customer Pending Services",
    endpoint: "/api/dashboard/pending-customers",
    rowKey: (row) => row.companyId,
    searchKeys: ["companyName", "status"],
    defaultSort: { key: "oldestDue", dir: "asc" },
    emptyMessage: "No pending services in this period.",
    colWidths: [30, 15, 25, 30],
    columns: [
      { key: "companyName", label: "Customer" },
      { key: "pending", label: "Pending", align: "right" },
      { key: "oldestDue", label: "Oldest due", render: (row) => formatDate(row.oldestDue) },
      {
        key: "status",
        label: "Status",
        render: (row) => <span className={statusBadgeClass(row.status)}>{row.status}</span>,
      },
    ],
  },

  "at-risk-customers": {
    title: "Customers At Risk",
    endpoint: "/api/dashboard/at-risk-customers",
    rowKey: (row) => row.companyId,
    searchKeys: ["companyName"],
    defaultSort: { key: "overdueCount", dir: "desc" },
    emptyMessage: "No customers at risk in this period.",
    colWidths: [25, 15, 15, 20, 25],
    columns: [
      { key: "companyName", label: "Customer" },
      { key: "overdueCount", label: "Overdue", align: "right" },
      { key: "pendingCount", label: "Pending", align: "right" },
      { key: "lateCompletedCount", label: "Late Completions", align: "right" },
      {
        key: "reasons",
        label: "Risk Criteria",
        sortable: false,
        render: (row) => row.reasons.join(", ") || "-",
      },
    ],
  },

  // Employee Performance's dashboard card was trimmed to 4 columns
  // (Employee, Assigned, Completed, On-Time %) to fit the card width —
  // this mirrors exactly that, not the full 6-column set the API returns.
  // The 15% spacer keeps "On-Time %" from sitting flush against the page
  // edge now that the table is fixed-width across the full page.
  "employee-performance": {
    title: "Employee Performance",
    endpoint: "/api/dashboard/employee-performance",
    rowKey: (row) => row.technicianId,
    searchKeys: ["technicianName"],
    defaultSort: { key: "onTimePct", dir: "asc" },
    emptyMessage: "No technicians found.",
    colWidths: [25, 20, 20, 20, 15],
    columns: [
      { key: "technicianName", label: "Employee" },
      { key: "assigned", label: "Assigned", align: "right" },
      { key: "completed", label: "Completed", align: "right" },
      {
        key: "onTimePct",
        label: "On-Time %",
        align: "right",
        render: (row) => <span className={onTimeTone(row.onTimePct)}>{row.onTimePct}%</span>,
      },
    ],
  },

  // Employee Workload's dashboard card only ever shows a name + assigned
  // count (as a bar), so that's the full extent of its columns here too.
  "employee-workload": {
    title: "Employee Workload",
    endpoint: "/api/dashboard/employee-performance",
    rowKey: (row) => row.technicianId,
    searchKeys: ["technicianName"],
    defaultSort: { key: "assigned", dir: "desc" },
    emptyMessage: "No technicians found.",
    colWidths: [60, 40],
    columns: [
      { key: "technicianName", label: "Employee" },
      { key: "assigned", label: "Assigned", align: "right" },
    ],
  },

  "overdue-services": {
    title: "Overdue Services - Action Required",
    endpoint: "/api/dashboard/overdue-services",
    rowKey: (row) => row.jobId,
    searchKeys: ["companyName", "siteName", "service", "employee"],
    defaultSort: { key: "daysLate", dir: "desc" },
    emptyMessage: "No overdue services in this period.",
    colWidths: [18, 15, 27, 13, 12, 8, 7],
    columns: [
      { key: "companyName", label: "Customer" },
      { key: "siteName", label: "Site" },
      { key: "service", label: "Service" },
      { key: "dueDate", label: "Due date", render: (row) => formatDate(row.dueDate) },
      { key: "employee", label: "Employee" },
      { key: "daysLate", label: "Days late", align: "right", render: (row) => <span className="adp-bad">{row.daysLate}</span> },
      {
        key: "action",
        label: "Action",
        align: "center",
        sortable: false,
        render: (row) => (
          <Link to={`/admin/jobs/${row.jobId}`} className="adp-icon-btn" title="View job">
            <FaEye />
          </Link>
        ),
      },
    ],
  },

  // Unlike the other five, this is a report view rather than a paginated
  // record list (see AnalysisDataPage.jsx's `noPagination`), and shows the
  // full column set the API returns — the dashboard card only trims down
  // to 4 columns to fit; "View Full Report" is where the rest lives.
  "monthly-summary": {
    title: "Monthly Service Summary",
    endpoint: "/api/dashboard/monthly-summary",
    rowKey: (row) => row.month,
    searchKeys: ["label"],
    defaultSort: { key: "month", dir: "desc" },
    emptyMessage: "No data in this period.",
    noPagination: true,
    colWidths: [16, 14, 14, 14, 14, 14, 14],
    columns: [
      { key: "label", label: "Month" },
      { key: "scheduled", label: "Scheduled", align: "right" },
      { key: "completed", label: "Completed", align: "right" },
      { key: "pending", label: "Pending", align: "right" },
      { key: "overdue", label: "Overdue", align: "right" },
      {
        key: "completionPct",
        label: "Completion %",
        align: "right",
        render: (row) => <span className={onTimeTone(row.completionPct)}>{row.completionPct}%</span>,
      },
      {
        key: "onTimePct",
        label: "On-Time %",
        align: "right",
        render: (row) => <span className={onTimeTone(row.onTimePct)}>{row.onTimePct}%</span>,
      },
    ],
  },
};

// TaskPro — constants and SAMPLE data.
//
// Everything in this folder runs on sample data until the task backend is
// ready. The only file that touches this data is tasksApi.js — when the real
// endpoints exist, that one file is replaced and the screens stay as they are.

// The sample org, arranged like the real hierarchy: two top admins (CEO and
// Managing Director) who see everything, heads who manage a team, and
// employees who each report to exactly one head (managerId).
export const STATUS = {
  OPEN: { label: "Open", color: "#2563eb", soft: "#e8f0ff" },
  IN_PROGRESS: { label: "In Progress", color: "#7c3aed", soft: "#f0e9ff" },
  PAUSED: { label: "Paused", color: "#d97706", soft: "#fff3dc" },
  COMPLETED: { label: "Completed", color: "#16a34a", soft: "#e2f7e9" },
  CANCELLED: { label: "Cancelled", color: "#64748b", soft: "#eef1f5" },
};

export const PRIORITY = {
  LOW: { label: "Low", color: "#475569", soft: "#eef1f5", rank: 1 },
  MEDIUM: { label: "Medium", color: "#b45309", soft: "#fff3dc", rank: 2 },
  HIGH: { label: "High", color: "#dc2626", soft: "#fdeaea", rank: 3 },
  URGENT: { label: "Urgent", color: "#ffffff", soft: "#dc2626", rank: 4 },
};

export const TASK_TYPES = ["Follow-up", "Call", "Review", "Reminder", "Approval", "Inspection", "Report"];

export const USERS = [
  { id: "u5", name: "Vikram Mehta", role: "CEO", managerId: null },
  { id: "u6", name: "Anita Rao", role: "Managing Director", managerId: null },
  { id: "u2", name: "Priya Nair", role: "Operations Head", managerId: "u5" },
  { id: "u8", name: "Meera Iyer", role: "Finance Head", managerId: "u5" },
  { id: "u7", name: "Karan Shah", role: "Sales Head", managerId: "u5" },
  { id: "u1", name: "Rahul Sharma", role: "Accountant", managerId: "u8" },
  { id: "u9", name: "Deepak Rane", role: "Accounts Executive", managerId: "u8" },
  { id: "u3", name: "Amit Verma", role: "Technician", managerId: "u2" },
  { id: "u4", name: "Sneha Kulkarni", role: "Sales Executive", managerId: "u7" },
];

export const userById = (id) => USERS.find((u) => u.id === id) || null;

const H = 3600 * 1000;
const D = 24 * H;

// Dates are relative to "now" so the overdue / upcoming lists always have content.
function at(daysFromNow, hour = 10, minute = 0) {
  const d = new Date(Date.now() + daysFromNow * D);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

let seq = 0;
const id = (p) => `${p}${++seq}`;

function created(task, byId = "u5") {
  const to = userById(task.assignedTo);
  return [
    {
      id: id("a"),
      kind: "updated",
      title: "Task updated",
      detail: `Priority set to ${PRIORITY[task.priority].label}`,
      at: task.createdAt + 60 * 1000,
    },
    {
      id: id("a"),
      kind: "assigned",
      title: "Task assigned",
      detail: `Task assigned to ${to ? to.name : "—"}`,
      at: task.createdAt + 30 * 1000,
    },
    {
      id: id("a"),
      kind: "created",
      title: "Task created",
      detail: `${task.no} was created by ${userById(byId)?.name || "—"}`,
      at: task.createdAt,
    },
  ];
}

function make(n, t) {
  const createdAt = t.createdAt ?? Date.now() - 2 * D;
  const task = {
    id: `t${n}`,
    no: `TSK-2026-${String(120 + n).padStart(5, "0")}`,
    description: "",
    type: "Follow-up",
    tags: [],
    status: "OPEN",
    priority: "MEDIUM",
    schedule: "One Time",
    createdBy: "u5",
    managerCanEdit: false,
    createdAt,
    updatedAt: createdAt + 60 * 1000,
    startedAt: null,
    runningSince: null,
    workedMs: 0,
    completedAt: null,
    related: null,
    comments: [],
    attachments: [],
    notes: "",
    ...t,
  };
  task.activity = t.activity || created(task, task.createdBy);
  return task;
}

export function buildSeed() {
  seq = 0;
  const hero = make(5, {
    title: "Payment Follow-up - ABC Hotels",
    description:
      "Call customer for pending payment of ₹50,000.\nCustomer requested to call this week.",
    tags: ["Follow-up", "Invoice", "Customer"],
    priority: "HIGH",
    assignedTo: "u1",
    managerCanEdit: true,
    dueAt: at(2, 10, 0),
    createdAt: at(-3, 11, 20),
    related: {
      type: "Invoice",
      ref: "INV-1001",
      customer: "ABC Hotels",
      customerCode: "CUST-001",
      amount: 50000,
      pending: 50000,
    },
    comments: [
      {
        id: id("c"),
        by: "u5",
        text: "Call customer for pending payment of ₹50,000.",
        at: at(-3, 11, 21),
      },
      {
        id: id("c"),
        by: "u2",
        text: "Accounts manager confirmed the invoice was delivered on 28 Aug.",
        at: at(-2, 15, 5),
      },
    ],
    attachments: [{ id: id("f"), name: "INV-1001.pdf", size: "182 KB" }],
    notes:
      "Keep the customer updated and record their response in the comments. Once the call is completed, update the status to In Progress or Complete the task.",
  });
  const c = (n, t) => make(n, t);

  return [
    hero,
    c(6, {
      title: "Send GST invoice copy - Sunrise Residency",
      description: "Customer asked for the GST invoice copy of the last quarter to be emailed today.",
      type: "Reminder",
      tags: ["Invoice", "Email"],
      assignedTo: "u1",
      createdBy: "u8",
      dueAt: at(0, 17, 30),
      createdAt: at(-1, 9, 10),
      related: {
        type: "Invoice",
        ref: "INV-0982",
        customer: "Sunrise Residency",
        customerCode: "CUST-014",
        amount: 28400,
        pending: 0,
      },
    }),
    c(7, {
      title: "Renewal call - Green Valley Apartments AMC",
      description: "AMC expires in 12 days. Discuss the renewal quote and get a decision.",
      type: "Call",
      tags: ["AMC", "Renewal"],
      priority: "HIGH",
      status: "IN_PROGRESS",
      assignedTo: "u1",
      createdBy: "u8",
      dueAt: at(0, 15, 0),
      createdAt: at(-2, 10, 0),
      startedAt: Date.now() - 40 * 60 * 1000,
      runningSince: Date.now() - 40 * 60 * 1000,
    }),
    c(8, {
      title: "Reconcile Razorpay payments - September",
      description: "Match the September Razorpay settlements against recorded payments.",
      type: "Review",
      tags: ["Payments"],
      assignedTo: "u1",
      dueAt: at(-1, 18, 0),
      createdAt: at(-6, 9, 0),
    }),
    c(9, {
      title: "Collect cheque - Metro Mall",
      description: "Cheque for invoice INV-0964 is ready at the mall office. Collect and deposit.",
      type: "Follow-up",
      tags: ["Cheque", "Collection"],
      priority: "URGENT",
      assignedTo: "u1",
      createdBy: "u8",
      dueAt: at(-3, 12, 0),
      createdAt: at(-8, 10, 30),
      related: {
        type: "Invoice",
        ref: "INV-0964",
        customer: "Metro Mall",
        customerCode: "CUST-007",
        amount: 96500,
        pending: 96500,
      },
    }),
    c(10, {
      title: "Quarterly audit report",
      description: "Prepare the Q3 collections summary for the audit meeting.",
      type: "Report",
      tags: ["Audit"],
      priority: "LOW",
      assignedTo: "u1",
      dueAt: at(6, 16, 0),
      createdAt: at(-1, 14, 0),
    }),
    c(11, {
      title: "TDS filing - Q2",
      description: "File the Q2 TDS return and share the acknowledgement with the MD.",
      type: "Approval",
      tags: ["Compliance"],
      assignedTo: "u1",
      dueAt: at(10, 12, 0),
      createdAt: at(-2, 11, 0),
    }),
    c(12, {
      title: "Site inspection follow-up - Lakeview Towers",
      description: "Verify that the pest-control corrections listed after the last inspection are done.",
      type: "Inspection",
      tags: ["Site", "Inspection"],
      priority: "HIGH",
      status: "IN_PROGRESS",
      assignedTo: "u3",
      createdBy: "u2",
      dueAt: at(1, 11, 0),
      createdAt: at(-2, 9, 30),
      startedAt: Date.now() - 3 * H,
      runningSince: Date.now() - 3 * H,
    }),
    c(13, {
      title: "Customer feedback call - Hotel Orchid",
      description: "Collect feedback on the last fumigation service.",
      type: "Call",
      tags: ["Feedback"],
      status: "PAUSED",
      assignedTo: "u4",
      createdBy: "u7",
      managerCanEdit: true,
      dueAt: at(2, 14, 0),
      createdAt: at(-4, 10, 0),
      startedAt: at(-1, 11, 0),
      workedMs: 25 * 60 * 1000,
    }),
    c(14, {
      title: "Lead follow-up - Sharma Residence",
      description: "Lead asked for a callback about cockroach treatment pricing.",
      type: "Follow-up",
      tags: ["Lead", "CRM"],
      priority: "MEDIUM",
      assignedTo: "u4",
      createdBy: "u7",
      dueAt: at(1, 10, 30),
      createdAt: at(0, 8, 45),
    }),
    c(15, {
      title: "Fumigation certificate - Harbour View",
      description: "The certificate is pending signature and is now overdue.",
      type: "Approval",
      tags: ["Certificate"],
      priority: "HIGH",
      assignedTo: "u3",
      dueAt: at(-2, 17, 0),
      createdAt: at(-7, 10, 0),
    }),
    c(16, {
      title: "Update pricing sheet",
      description: "Add the new termite treatment packages to the pricing sheet.",
      type: "Review",
      tags: ["Pricing"],
      priority: "LOW",
      status: "COMPLETED",
      assignedTo: "u2",
      dueAt: at(-1, 12, 0),
      createdAt: at(-5, 10, 0),
      startedAt: at(-2, 10, 0),
      workedMs: 95 * 60 * 1000,
      completedAt: at(-2, 12, 0),
    }),
    c(18, {
      title: "Prepare GST return workpapers",
      description: "Collect the sales and purchase registers and prepare the workpapers for the GST return.",
      type: "Report",
      tags: ["GST", "Compliance"],
      assignedTo: "u9",
      createdBy: "u8",
      dueAt: at(3, 15, 0),
      createdAt: at(-1, 12, 0),
    }),
    c(19, {
      title: "Review branch expansion budget",
      description: "Review the draft budget for the new branch and send comments to the CEO.",
      type: "Review",
      tags: ["Budget"],
      priority: "HIGH",
      assignedTo: "u2",
      dueAt: at(4, 12, 0),
      createdAt: at(-1, 16, 0),
    }),
    c(17, {
      title: "Vendor payment approval",
      description: "Approve the chemicals vendor payment for August.",
      type: "Approval",
      tags: ["Vendor", "Payments"],
      status: "COMPLETED",
      assignedTo: "u1",
      createdBy: "u8",
      dueAt: at(-1, 10, 0),
      createdAt: at(-4, 10, 0),
      startedAt: at(-1, 9, 0),
      workedMs: 40 * 60 * 1000,
      completedAt: at(-1, 9, 45),
    }),
  ];
}

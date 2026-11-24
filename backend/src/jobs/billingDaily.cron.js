const cron = require("node-cron");
const { pool } = require("../../db");
const { notifyUsers } = require("../services/notifications.service");

// Invoice Generation daily jobs:
//   00:05  service plan versions whose effective date has come become ACTIVE (the previous one ENDS)
//   07:00  PO expiry alerts 15 days, 7 days and on the day, to Accounts Head / Accounts Executive (once each)
// Both are safe to run again; a missing billing table (migration not run yet) is skipped quietly.

const ACCOUNTS_ROLES = ["Accounts Head", "Accounts Executive"];

const missingTables = (err) => err?.code === "ER_NO_SUCH_TABLE";

async function activateServicePlans() {
  try {
    await pool.query(
      `UPDATE billing_service_plans old_p
         JOIN billing_service_plans new_p
           ON new_p.company_id = old_p.company_id AND new_p.status = 'SCHEDULED' AND new_p.effective_from <= CURDATE()
          SET old_p.status = 'ENDED'
        WHERE old_p.status = 'ACTIVE' AND old_p.effective_from < new_p.effective_from`
    );
    const [started] = await pool.query("UPDATE billing_service_plans SET status = 'ACTIVE' WHERE status = 'SCHEDULED' AND effective_from <= CURDATE()");
    if (started.affectedRows) console.log(`Billing: ${started.affectedRows} service plan version(s) started`);
  } catch (err) {
    if (!missingTables(err)) console.error("Billing service plan job failed:", err);
  }
}

async function poExpiryAlerts() {
  try {
    const [pos] = await pool.query(
      `SELECT po.id, po.po_number, c.name AS customer, DATE_FORMAT(po.expiry_date, '%d-%m-%Y') AS expiry,
              CASE DATEDIFF(po.expiry_date, CURDATE()) WHEN 15 THEN 'D15' WHEN 7 THEN 'D7' ELSE 'D0' END AS alert_kind,
              DATEDIFF(po.expiry_date, CURDATE()) AS days
         FROM customer_pos po JOIN companies c ON c.id = po.company_id
        WHERE po.status = 'ACTIVE' AND DATEDIFF(po.expiry_date, CURDATE()) IN (15, 7, 0)
          AND NOT EXISTS (SELECT 1 FROM billing_po_alerts a WHERE a.po_id = po.id
                            AND a.alert_kind = CASE DATEDIFF(po.expiry_date, CURDATE()) WHEN 15 THEN 'D15' WHEN 7 THEN 'D7' ELSE 'D0' END)`
    );
    if (!pos.length) return;
    const [users] = await pool.query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN (?) AND (u.is_active IS NULL OR u.is_active = 1)",
      [ACCOUNTS_ROLES]
    );
    for (const po of pos) {
      const [claimed] = await pool.query("INSERT IGNORE INTO billing_po_alerts (po_id, alert_kind) VALUES (?, ?)", [po.id, po.alert_kind]);
      if (!claimed.affectedRows) continue; // another server already sent it
      const when = Number(po.days) === 0 ? "expires today" : `expires in ${po.days} days (${po.expiry})`;
      await notifyUsers(users.map((u) => u.id), {
        type: "PO_EXPIRY",
        title: `PO ${po.po_number} ${Number(po.days) === 0 ? "expires today" : "is expiring"}`,
        message: `PO ${po.po_number} of ${po.customer} ${when}. Get the renewed PO before the next invoice.`,
        entityType: "customer_po",
        entityId: po.id,
      });
    }
  } catch (err) {
    if (!missingTables(err)) console.error("Billing PO expiry job failed:", err);
  }
}

// 09:30 - bills that missed their contract's Bill date (the date has passed and it is not issued yet):
// one notification per customer per month to Accounts. Uses the Bill Run's due list (missed_days).
async function lateBillingAlerts() {
  try {
    const { dueList } = require("../services/billing/draft.service");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const month = today.slice(0, 7);
    // still not issued (a draft waiting to be issued counts too, as on the Accounts dashboard)
    const due = (await dueList(pool, month)).rows.filter((r) => r.missed_days > 0);
    if (!due.length) return;
    const dmy = (d) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
    const [users] = await pool.query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN (?) AND (u.is_active IS NULL OR u.is_active = 1)",
      [ACCOUNTS_ROLES]
    );
    const perCustomer = new Map();
    for (const r of due) {
      if (!perCustomer.has(r.company_id)) perCustomer.set(r.company_id, []);
      perCustomer.get(r.company_id).push(r);
    }
    for (const [companyId, rows] of perCustomer) {
      const [claimed] = await pool.query("INSERT IGNORE INTO billing_late_alerts (company_id, month) VALUES (?, ?)", [companyId, `${month}-01`]);
      if (!claimed.affectedRows) continue; // already alerted this month
      const waiting = rows.some((r) => r.sos === "PENDING");
      const first = rows.reduce((a, r) => (r.bill_date < a.bill_date ? r : a), rows[0]);
      const late = first.missed_days;
      await notifyUsers(users.map((u) => u.id), {
        type: "BILLING_LATE",
        title: `Missed bill date: ${rows[0].customer}`,
        message: `Bill date ${dmy(first.bill_date)} has passed (${late} day${late === 1 ? "" : "s"} late) and ${rows.map((r) => r.contract_code).join(", ")} ${rows.length > 1 ? "are" : "is"} not billed yet${waiting ? " - waiting for the Service Coordinator's SOS" : ""}. Open the Bill Run.`,
        entityType: "billing_contract",
        entityId: rows[0].contract_id,
      });
    }
  } catch (err) {
    if (!missingTables(err)) console.error("Billing late alerts job failed:", err);
  }
}

function startBillingDailyCron() {
  activateServicePlans(); // also on start, so a restart after midnight catches up
  cron.schedule("5 0 * * *", activateServicePlans, { timezone: "Asia/Kolkata" });
  cron.schedule("0 7 * * *", poExpiryAlerts, { timezone: "Asia/Kolkata" });
  cron.schedule("30 9 * * *", lateBillingAlerts, { timezone: "Asia/Kolkata" });
}

module.exports = { startBillingDailyCron, activateServicePlans, poExpiryAlerts, lateBillingAlerts };

const cron = require("node-cron");
const { syncInvoiceStatuses } = require("../services/InvoiceStatus.service");

async function runInvoiceStatusSync() {
  try {
    const { markedOverdue, restored } = await syncInvoiceStatuses();
    if (markedOverdue || restored) console.log(`Invoice status sync: ${markedOverdue} marked OVERDUE, ${restored} restored`);
  } catch (err) {
    console.error("Invoice status cron failed:", err);
  }
}

function startInvoiceStatusCron() {
  runInvoiceStatusSync(); // immediate run, so invoices are right as soon as the server starts
  cron.schedule("5 0 * * *", runInvoiceStatusSync); // every day just after midnight, when due dates roll over
}

module.exports = { startInvoiceStatusCron };

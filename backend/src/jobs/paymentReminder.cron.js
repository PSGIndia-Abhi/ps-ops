const cron = require("node-cron");
const { sendDueReminderAlerts } = require("../services/PaymentFollowUp.service");

let running = false;

// Sends the "payment reminder due" notifications. A run that is still going when the next
// minute starts is skipped, so the same reminder is never picked up twice.
async function runPaymentReminderAlerts() {
  if (running) return;
  running = true;
  try {
    const sent = await sendDueReminderAlerts();
    if (sent) console.log(`Payment reminders: ${sent} alert(s) sent`);
  } catch (err) {
    console.error("Payment reminder cron failed:", err);
  } finally {
    running = false;
  }
}

function startPaymentReminderCron() {
  runPaymentReminderAlerts(); // immediate run, so a reminder that came due while the server was down is not missed
  cron.schedule("* * * * *", runPaymentReminderAlerts); // every minute, so the alert arrives at the chosen time
}

module.exports = { startPaymentReminderCron };

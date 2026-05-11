require('dotenv').config({
  path: '.env.production'
});

const express = require('express');
const cors = require('cors');
const app = express();
const { testConnection, pool } = require('./db');
const { startRecurringScheduler } = require("./src/services/recurring.service");
const jobsRoutes = require('./src/routes/jobs.routes');
const debugRoutes = require('./src/routes/debug.routes');
const usersRoutes = require("./src/routes/users.routes");
const contactRoutes = require("./src/routes/contacts.routes");
const companiesRoutes = require("./src/routes/companies.routes");
const groupsRoutes = require("./src/routes/groups.routes");
const sitesRoutes = require("./src/routes/sites.routes");
const branchesRoutes = require("./src/routes/branches.routes");
const attachmentsRouter = require("./src/routes/attachments.routes");
const authroutes = require("./src/routes/auth.routes");
const teamRoutes = require("./src/routes/teams.routes");
const dashboardRoutes = require("./src/routes/dashboard.routes");
const bookingsRoutes = require('./src/routes/bookings.routes');
const visitRoutes = require('./src/routes/visits.routes');
const clientInviteRoutes = require("./src/routes/clientInvite.routes");
const inviteAcceptRoutes = require("./src/routes/invite.accept.routes");
const ticketsRoutes = require("./src/routes/tickets.routes");
const notificationsRoutes = require("./src/routes/notifications.routes");
const rolesRoutes = require("./src/routes/roles.routes");
const { startVisitMissedCron } = require("./src/jobs/visitMissed.cron");

// Middleware


app.use(cors());
app.use(express.json());  

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Root check
app.get('/', (req, res) => {
  res.json({
    service: 'PS Ops Platform Backend',
    status: 'running'
  });
});

// API routes
app.use('/api/jobs', jobsRoutes);
app.use('/debug', debugRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/branches", branchesRoutes);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/auth", authroutes);
app.use("/api/teams", teamRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use(express.json());
app.use("/api/bookings", bookingsRoutes);
app.use("/api/visits", visitRoutes);
app.use("/api/tickets", ticketsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api", clientInviteRoutes);
app.use("/api/invite", inviteAcceptRoutes);





const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await testConnection();
    console.log('MySQL connected successfully');
    startRecurringScheduler(pool);
    startVisitMissedCron();
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    process.exit(1);
  }
})();

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

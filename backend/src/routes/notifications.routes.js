const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
// Notifications always belong to the logged-in user. Besides the job permissions, a user who works with
// invoices (the accountant) may use them too.
const allowNotifications = (jobPermission) => (req, res, next) =>
  req.user?.permissions?.includes(PERMISSIONS.VIEW_INVOICE)
    ? next()
    : requirePermission(jobPermission)(req, res, next);

const {
  listNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../services/notifications.service");

router.get(
  "/",
  auth,
  allowNotifications(PERMISSIONS.VIEW_JOB),
  async (req, res) => {
    try {
      const notifications = await listNotificationsForUser(req.user.id, {
        limit: req.query.limit,
        unreadOnly: req.query.unreadOnly === "true",
      });
      res.json(notifications);
    } catch (err) {
      console.error("Failed to load notifications:", err);
      res.status(500).json({ error: "Failed to load notifications" });
    }
  }
);

router.get(
  "/unread-count",
  auth,
  allowNotifications(PERMISSIONS.VIEW_JOB),
  async (req, res) => {
    try {
      const count = await getUnreadNotificationCount(req.user.id);
      res.json({ count });
    } catch (err) {
      console.error("Failed to load unread notification count:", err);
      res.status(500).json({ error: "Failed to load unread notification count" });
    }
  }
);

router.patch(
  "/:id/read",
  auth,
  allowNotifications(PERMISSIONS.UPDATE_JOB),
  async (req, res) => {
    try {
      const updated = await markNotificationRead(req.user.id, req.params.id);
      if (!updated) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  }
);

router.post(
  "/read-all",
  auth,
  allowNotifications(PERMISSIONS.UPDATE_JOB),
  async (req, res) => {
    try {
      const updated = await markAllNotificationsRead(req.user.id);
      res.json({ success: true, updated });
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  }
);



module.exports = router;

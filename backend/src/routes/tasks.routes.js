const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { listTasks, getTask, createTask, updateTask } = require("../controllers/tasks.controller");

router.get("/", auth, requirePermission(PERMISSIONS.VIEW_TASK), listTasks);
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_TASK), getTask);
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_TASK), createTask);
router.put("/:id", auth, requirePermission(PERMISSIONS.UPDATE_TASK), updateTask);

module.exports = router;

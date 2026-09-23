const { pool } = require("../../db");
const { v4: uuid } = require("uuid");

async function listTasks(req, res) {
  const { role, id: userId } = req.user;
  const connection = await pool.getConnection();
  try {
    let where = "";
    let params = [];
    if (role !== "admin") {
      where = "WHERE (t.assigned_to = ? OR t.created_by = ?)";
      params = [userId, userId];
    }

    const [rows] = await connection.query(
      `SELECT t.*, u1.name AS assigned_to_name, u2.name AS created_by_name
       FROM tasks t
       LEFT JOIN users u1 ON u1.id = t.assigned_to
       LEFT JOIN users u2 ON u2.id = t.created_by
       ${where}
       ORDER BY (t.due_date IS NULL), t.due_date ASC, t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error("Failed to list tasks:", err);
    res.status(500).json({ error: "Failed to load tasks" });
  } finally {
    connection.release();
  }
}

async function getTask(req, res) {
  const { role, id: userId } = req.user;
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    const [[task]] = await connection.query(
      `SELECT t.*, u1.name AS assigned_to_name, u2.name AS created_by_name
       FROM tasks t
       LEFT JOIN users u1 ON u1.id = t.assigned_to
       LEFT JOIN users u2 ON u2.id = t.created_by
       WHERE t.id = ?`,
      [id]
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (role !== "admin" && task.assigned_to !== userId && task.created_by !== userId) {
      return res.status(404).json({ error: "Task not found" });
    }

    const [reminders] = await connection.query(
      "SELECT * FROM task_reminders WHERE task_id = ? ORDER BY reminder_date, reminder_time",
      [id]
    );

    res.json({ ...task, reminders });
  } catch (err) {
    console.error("Failed to get task:", err);
    res.status(500).json({ error: "Failed to load task" });
  } finally {
    connection.release();
  }
}

async function createTask(req, res) {
  const { reference_type, reference_id, task_type, title, notes, priority, assigned_to, due_date, due_time } = req.body;

  if (!reference_type || !reference_id || !task_type || !title) {
    return res.status(400).json({ error: "reference_type, reference_id, task_type and title are required" });
  }

  const connection = await pool.getConnection();
  try {
    if (reference_type === "INVOICE") {
      const [[invoice]] = await connection.query("SELECT id FROM invoices WHERE id = ?", [reference_id]);
      if (!invoice) return res.status(400).json({ error: "Invalid invoice reference" });
    }

    const id = uuid();
    await connection.query(
      `INSERT INTO tasks
       (id, reference_type, reference_id, task_type, title, notes, priority, assigned_to, due_date, due_time, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        reference_type,
        reference_id,
        task_type,
        title,
        notes || null,
        priority || "NORMAL",
        assigned_to || null,
        due_date || null,
        due_time || null,
        req.user.id,
      ]
    );

    res.json({ success: true, id });
  } catch (err) {
    console.error("Failed to create task:", err);
    res.status(500).json({ error: "Failed to create task" });
  } finally {
    connection.release();
  }
}

async function updateTask(req, res) {
  const { role, id: userId } = req.user;
  const { id } = req.params;
  const { title, notes, priority, status, assigned_to, due_date, due_time } = req.body;

  const connection = await pool.getConnection();
  try {
    const [[task]] = await connection.query("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (role !== "admin" && task.assigned_to !== userId && task.created_by !== userId) {
      return res.status(404).json({ error: "Task not found" });
    }

    const completedAt =
      status === "COMPLETED" && task.status !== "COMPLETED"
        ? new Date()
        : status && status !== "COMPLETED"
          ? null
          : task.completed_at;

    await connection.query(
      `UPDATE tasks
       SET title = ?, notes = ?, priority = ?, status = ?, assigned_to = ?, due_date = ?, due_time = ?, completed_at = ?
       WHERE id = ?`,
      [
        title !== undefined ? title : task.title,
        notes !== undefined ? notes : task.notes,
        priority || task.priority,
        status || task.status,
        assigned_to !== undefined ? assigned_to : task.assigned_to,
        due_date !== undefined ? due_date : task.due_date,
        due_time !== undefined ? due_time : task.due_time,
        completedAt,
        id,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to update task:", err);
    res.status(500).json({ error: "Failed to update task" });
  } finally {
    connection.release();
  }
}

module.exports = { listTasks, getTask, createTask, updateTask };

const express = require('express');
const router = express.Router();
const { pool } = require('../../db');
const minioClient = require('../lib/minio');
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");

router.get('/db-check', auth, requirePermission(PERMISSIONS.VIEW_GLOBAL_ANALYTICS), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ db: 'connected', result: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/minio-check', auth, requirePermission(PERMISSIONS.VIEW_GLOBAL_ANALYTICS), async (req, res) => {
  try {
    const bucket = process.env.MINIO_BUCKET;
    if (!bucket) {
      return res.status(500).json({ error: 'MINIO_BUCKET is not set' });
    }

    const exists = await minioClient.bucketExists(bucket);
    res.json({
      minio: 'connected',
      bucket,
      exists,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

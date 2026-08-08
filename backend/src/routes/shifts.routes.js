const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const { redis } = require("../utils/redis");

async function getActiveVisitForTechnician(executor, technicianId) {
  const [[visit]] = await executor.query(
    `
    SELECT
      v.id,
      v.job_id,
      v.visit_number,
      v.status,
      v.started_at,
      j.sub_service AS job_title
    FROM job_visits v
    JOIN visit_technicians vt
      ON vt.visit_id = v.id
    JOIN jobs j
      ON j.id = v.job_id
    WHERE vt.technician_id = ?
      AND v.status = 'IN_PROGRESS'
    ORDER BY v.started_at DESC, v.updated_at DESC
    LIMIT 1
    `,
    [technicianId]
  );

  return visit || null;
}


// =====================================================
// START SHIFT
// POST /api/shifts/start
// =====================================================
router.post(
  "/start",
  auth,
  requirePermission(PERMISSIONS.START_SHIFT),
  async (req, res) => {
    const technicianId = req.user.id;
    const { latitude, longitude } = req.body || {};

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        error: "Current location is required to start shift",
      });
    }

    try {
      // Check if an active shift already exists
      const [[existingShift]] = await pool.query(
        `
        SELECT *
        FROM technician_shifts
        WHERE technician_id = ?
          AND status = 'ACTIVE'
        LIMIT 1
        `,
        [technicianId]
      );

      if (existingShift) {
        return res.json({
          active: true,
          shift: existingShift,
        });
      }

      const shiftId = uuid();

      await pool.query(
        `
        INSERT INTO technician_shifts (
          id,
          technician_id,
          started_at,
          start_latitude,
          start_longitude,
          status
        )
        VALUES (?, ?, NOW(), ?, ?, 'ACTIVE')
        `,
        [shiftId, technicianId, latitude, longitude]
      );

      const [[shift]] = await pool.query(
        `
        SELECT *
        FROM technician_shifts
        WHERE id = ?
        `,
        [shiftId]
      );

      return res.status(201).json({
        active: true,
        shift,
      });

    } catch (err) {
      console.error("Error starting shift:", err);

      return res.status(500).json({
        error: "Failed to start shift",
      });
    }
  }
);


// =====================================================
// CURRENT SHIFT
// GET /api/shifts/current
// =====================================================
router.get(
  "/current",
  auth,
  requirePermission(PERMISSIONS.VIEW_OWN_SHIFT),
  async (req, res) => {
    const technicianId = req.user.id;

    try {
      const [[shift]] = await pool.query(
        `
        SELECT *
        FROM technician_shifts
        WHERE technician_id = ?
          AND status = 'ACTIVE'
        ORDER BY started_at DESC
        LIMIT 1
        `,
        [technicianId]
      );

      if (!shift) {
        return res.json({
          active: false,
          shift: null,
          activeVisit: null,
        });
      }

      const activeVisit = await getActiveVisitForTechnician(
        pool,
        technicianId
      );

      return res.json({
        active: true,
        shift,
        activeVisit,
      });

    } catch (err) {
      console.error("Error fetching current shift:", err);

      return res.status(500).json({
        error: "Failed to fetch current shift",
      });
    }
  }
);


// =====================================================
// END SHIFT
// POST /api/shifts/end
// =====================================================
router.post(
  "/end",
  auth,
  requirePermission(PERMISSIONS.END_SHIFT),
  async (req, res) => {
    const technicianId = req.user.id;
    const { latitude, longitude } = req.body || {};

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        error: "Current location is required to end shift",
      });
    }

    try {
      // Find active shift
      const [[shift]] = await pool.query(
        `
        SELECT *
        FROM technician_shifts
        WHERE technician_id = ?
          AND status = 'ACTIVE'
        ORDER BY started_at DESC
        LIMIT 1
        `,
        [technicianId]
      );

      if (!shift) {
        return res.status(404).json({
          error: "No active shift found",
        });
      }

      await pool.query(
        `
        UPDATE technician_shifts
        SET
          ended_at = NOW(),
          end_latitude = ?,
          end_longitude = ?,
          status = 'ENDED'
        WHERE id = ?
        `,
        [latitude, longitude, shift.id]
      );

      const [[endedShift]] = await pool.query(
        `
        SELECT *
        FROM technician_shifts
        WHERE id = ?
        `,
        [shift.id]
      );

      return res.json({
        active: false,
        shift: endedShift,
      });

    } catch (err) {
      console.error("Error ending shift:", err);

      return res.status(500).json({
        error: "Failed to end shift",
      });
    }
  }
);

// =====================================================
// UPDATE TECHNICIAN LOCATION
// POST /api/shifts/location
// =====================================================
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // metres

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.post(
  "/location",
  auth,
  requirePermission(PERMISSIONS.VIEW_OWN_SHIFT),
  async (req, res) => {
    const technicianId = req.user.id;
    const {
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
    } = req.body || {};


    if (latitude == null || longitude == null) {
      return res.status(400).json({
        error: "Latitude and longitude are required",
      });
    }

    try {
      // Make sure technician has an active shift
      const [[shift]] = await pool.query(
        `
        SELECT id
        FROM technician_shifts
        WHERE technician_id = ?
          AND status = 'ACTIVE'
        ORDER BY started_at DESC
        LIMIT 1
        `,
        [technicianId]
      );

      if (!shift) {
        return res.status(403).json({
          error: "No active shift",
        });
      }

      const activeVisit = await getActiveVisitForTechnician(
        pool,
        technicianId
      );

      // Store latest location in Redis (always)
      const key = `technician:location:${technicianId}`;

      const locationData = {
        technicianId,
        shiftId: shift.id,
        activeVisitId: activeVisit?.id || null,
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy != null ? Number(accuracy) : null,
        speed: speed != null ? Number(speed) : null,
        heading: heading != null ? Number(heading) : null,
        updatedAt: new Date().toISOString(),
      };

      await redis.set(
        key,
        JSON.stringify(locationData),
        {
          EX: 3600,
        }
      );

      let shouldStore = false;

      if (activeVisit) {
        const [[lastPoint]] = await pool.query(
          `
          SELECT
            latitude,
            longitude
          FROM technician_location_history
          WHERE shift_id = ?
            AND technician_id = ?
          ORDER BY recorded_at DESC
          LIMIT 1
          `,
          [shift.id, technicianId]
        );

        if (!lastPoint) {
          shouldStore = true;
        } else {
          const distance = getDistanceMeters(
            Number(lastPoint.latitude),
            Number(lastPoint.longitude),
            Number(latitude),
            Number(longitude)
          );

          if (distance >= 30) {
            shouldStore = true;
          }
        }
      }

      if (shouldStore) {
        await pool.query(
          `
          INSERT INTO technician_location_history (
            shift_id,
            technician_id,
            latitude,
            longitude,
            accuracy,
            speed,
            heading
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            shift.id,
            technicianId,
            Number(latitude),
            Number(longitude),
            accuracy ?? null,
            speed ?? null,
            heading ?? null,
          ]
        );
      }

      return res.json({
        success: true,
        stored: shouldStore,
        trackingActive: Boolean(activeVisit),
        activeVisitId: activeVisit?.id || null,
        location: locationData,
      });



    } catch (err) {
      console.error("Error updating technician location:", err);

      return res.status(500).json({
        error: "Failed to update technician location",
      });
    }
  }
);


// =====================================================
// GET ALL TECHNICIANS (ONLINE + OFFLINE)
// GET /api/shifts/technicians
// =====================================================
router.get(
  "/technicians",
  auth,
  async (req, res) => {
    try {
      const [technicians] = await pool.query(`
        SELECT
          u.id,
          u.name
        FROM users u
        LEFT JOIN roles r
          ON r.id = u.role_id
        WHERE u.is_active = 1
          AND (
            LOWER(r.name) = 'technician'
            OR LOWER(u.role) = 'technician'
          )
        ORDER BY u.name ASC
      `);

      const results = await Promise.all(
        technicians.map(async (tech) => {
          // Active Shift
          const [[shift]] = await pool.query(
            `
            SELECT
              id,
              started_at
            FROM technician_shifts
            WHERE technician_id = ?
              AND status = 'ACTIVE'
            LIMIT 1
            `,
            [tech.id]
          );

          if (shift) {
            const key = `technician:location:${tech.id}`;

            const rawLocation = await redis.get(key);

            return {
              technician_id: tech.id,
              name: tech.name,
              online: true,
              started_at: shift.started_at,
              location: rawLocation
                ? JSON.parse(rawLocation)
                : null,
            };
          }

          // Last Shift
          const [[lastShift]] = await pool.query(
            `
            SELECT
              ended_at
            FROM technician_shifts
            WHERE technician_id = ?
            ORDER BY ended_at DESC
            LIMIT 1
            `,
            [tech.id]
          );

          return {
            technician_id: tech.id,
            name: tech.name,
            online: false,
            last_shift_end: lastShift?.ended_at || null,
          };
        })
      );

      return res.json({
        online: results.filter((t) => t.online),
        offline: results.filter((t) => !t.online),
      });

    } catch (err) {
      console.error("Error fetching technicians:", err);

      return res.status(500).json({
        error: "Failed to fetch technicians",
      });
    }
  }
);

// =====================================================
// TECHNICIAN HISTORY
// GET /api/shifts/history/:technicianId?date=2026-08-06
// =====================================================
router.get(
  "/history/:technicianId",
  auth,
  async (req, res) => {
    const { technicianId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        error: "date query parameter is required (YYYY-MM-DD)",
      });
    }

    try {
      // Build date range
      const startDate = `${date} 00:00:00`;
      const endDate = `${date} 23:59:59`;

      // -------------------------------------------------
      // Technician
      // -------------------------------------------------
      const [[technician]] = await pool.query(
        `
        SELECT
          id,
          name,
          email
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [technicianId]
      );

      if (!technician) {
        return res.status(404).json({
          error: "Technician not found",
        });
      }

      // -------------------------------------------------
      // Shift
      // -------------------------------------------------
      const [[shift]] = await pool.query(
        `
        SELECT *
        FROM technician_shifts
        WHERE technician_id = ?
          AND started_at BETWEEN ? AND ?
        ORDER BY started_at DESC
        LIMIT 1
        `,
        [
          technicianId,
          startDate,
          endDate,
        ]
      );

      if (!shift) {
        return res.json({
          technician,
          shift: null,
          locations: [],
          visits: [],
        });
      }

      // -------------------------------------------------
      // GPS History
      // -------------------------------------------------
      const [locations] = await pool.query(
        `
        SELECT
          latitude,
          longitude,
          accuracy,
          speed,
          heading,
          source,
          recorded_at
        FROM technician_location_history
        WHERE shift_id = ?
        ORDER BY recorded_at ASC
        `,
        [shift.id]
      );

      const trackingEnd = shift.ended_at || endDate;
      const [visits] = await pool.query(
        `
        SELECT
          v.id,
          v.job_id,
          v.visit_number,
          v.status,
          v.started_at,
          v.completed_at,
          v.updated_at,
          v.scheduled_date,
          j.sub_service AS job_title,
          j.code AS job_code,
          s.name AS site_name
        FROM job_visits v
        JOIN visit_technicians vt
          ON vt.visit_id = v.id
        JOIN jobs j
          ON j.id = v.job_id
        LEFT JOIN sites s
          ON s.id = j.company_id
        WHERE vt.technician_id = ?
          AND (
            v.scheduled_date BETWEEN ? AND ?
            OR v.started_at BETWEEN ? AND ?
            OR (
              v.started_at <= ?
              AND COALESCE(v.completed_at, v.updated_at, ?) >= ?
            )
          )
        ORDER BY COALESCE(v.started_at, v.scheduled_date) ASC, v.visit_number ASC
        `,
        [
          technicianId,
          startDate,
          endDate,
          startDate,
          endDate,
          trackingEnd,
          trackingEnd,
          startDate,
        ]
      );

      return res.json({
        technician,
        shift,
        locations,
        visits,
      });

    } catch (err) {
      console.error("Error fetching technician history:", err);

      return res.status(500).json({
        error: "Failed to fetch technician history",
      });
    }
  }
);


// =====================================================
// GET ACTIVE TECHNICIAN LOCATIONS
// GET /api/shifts/active
// =====================================================
router.get(
  "/active",
  auth,
  async (req, res) => {
    try {
      const [shifts] = await pool.query(`
        SELECT
          ts.id AS shift_id,
          ts.technician_id,
          ts.started_at,
          u.name AS technician_name
        FROM technician_shifts ts
        JOIN users u ON u.id = ts.technician_id
        WHERE ts.status = 'ACTIVE'
        ORDER BY ts.started_at ASC
      `);

      const technicians = await Promise.all(
        shifts.map(async (shift) => {
          const key = `technician:location:${shift.technician_id}`;

          const rawLocation = await redis.get(key);

          return {
            ...shift,
            location: rawLocation
              ? JSON.parse(rawLocation)
              : null,
          };
        })
      );

      return res.json({
        technicians,
      });
    } catch (err) {
      console.error(
        "Error fetching active technician locations:",
        err
      );

      return res.status(500).json({
        error: "Failed to fetch active technician locations",
      });
    }
  }
);


module.exports = router;

// Sales Executive Field Tracking - building one executive's day from the stored rows.
// Used by routes/sales-field-tracking.routes.js (team list + day view).
//
// GPS km is the sum of straight-line hops between consecutive *valid* points:
//  - a point with accuracy worse than MAX_ACCURACY_M is ignored (poor fix);
//  - a point that would need more than MAX_SPEED_KMPH from the last good point is ignored (GPS jump);
//  - hops shorter than MIN_HOP_M are not counted (GPS jitter while standing still) - the anchor
//    stays put until the executive has really moved.
// Petrol km (home -> each client -> home, by road) and the road route line are worked out by the
// web page with Google's Routes API from the waypoints returned here, once per closed day, and
// saved in sales_field_day_routes (see the route-save endpoint in sales-field-tracking.routes.js).

const crypto = require("crypto");

const MAX_ACCURACY_M = 100;
const MAX_SPEED_KMPH = 150;
const MIN_HOP_M = 30;
// No point for this long during an open shift = a tracking gap (phone off, GPS off, app killed).
const GAP_MINUTES = 20;
// Staying within STOP_RADIUS_M for at least STOP_MINUTES = a stop.
const STOP_RADIUS_M = 150;
const STOP_MINUTES = 20;

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function num(value) {
  return value === null || value === undefined ? null : Number(value);
}
function latLng(lat, lng) {
  return lat === null || lat === undefined || lng === null || lng === undefined
    ? null
    : { latitude: Number(lat), longitude: Number(lng) };
}
function metersBetween(a, b) {
  return a && b ? Math.round(distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude)) : null;
}
const round2 = (n) => Math.round(n * 100) / 100;

// Marks each point valid/invalid and adds up GPS km. Points must be in time order.
function analysePoints(points) {
  let meters = 0;
  let lastGood = null; // last valid point (for speed check)
  let anchor = null; // last point a hop was counted from (for jitter)
  for (const p of points) {
    if (p.accuracy !== null && p.accuracy > MAX_ACCURACY_M) {
      p.valid = false;
      p.reason = "LOW_ACCURACY";
      continue;
    }
    if (lastGood && lastGood.shiftId === p.shiftId) {
      const d = distanceMeters(lastGood.latitude, lastGood.longitude, p.latitude, p.longitude);
      const hours = (p.ts - lastGood.ts) / 3600;
      if (hours > 0 && d / 1000 / hours > MAX_SPEED_KMPH) {
        p.valid = false;
        p.reason = "GPS_JUMP";
        continue;
      }
    }
    p.valid = true;
    if (!anchor || anchor.shiftId !== p.shiftId) {
      anchor = p; // a new shift starts a new line - no distance across the break
    } else {
      const hop = distanceMeters(anchor.latitude, anchor.longitude, p.latitude, p.longitude);
      if (hop >= MIN_HOP_M) {
        meters += hop;
        anchor = p;
      }
    }
    lastGood = p;
  }
  return round2(meters / 1000);
}

// Periods with no point for GAP_MINUTES+ inside a shift (from shift start, between points, up to
// shift end - or now for an open shift).
function findGaps(shifts, points, nowTs) {
  const gaps = [];
  for (const shift of shifts) {
    const times = points.filter((p) => p.shiftId === shift.id).map((p) => p.ts);
    const endTs = shift.endTs ?? nowTs;
    const marks = [shift.startTs, ...times, endTs];
    for (let i = 1; i < marks.length; i += 1) {
      const minutes = (marks[i] - marks[i - 1]) / 60;
      if (minutes >= GAP_MINUTES) gaps.push({ fromTs: marks[i - 1], toTs: marks[i], minutes: Math.round(minutes) });
    }
  }
  return gaps;
}

// Places the executive stayed for STOP_MINUTES+ (valid points only).
function findStops(points) {
  const stops = [];
  const good = points.filter((p) => p.valid);
  let i = 0;
  while (i < good.length) {
    let j = i;
    while (
      j + 1 < good.length &&
      good[j + 1].shiftId === good[i].shiftId &&
      distanceMeters(good[i].latitude, good[i].longitude, good[j + 1].latitude, good[j + 1].longitude) <= STOP_RADIUS_M
    ) {
      j += 1;
    }
    const minutes = (good[j].ts - good[i].ts) / 60;
    if (minutes >= STOP_MINUTES) {
      stops.push({ latitude: good[i].latitude, longitude: good[i].longitude, fromTs: good[i].ts, toTs: good[j].ts, minutes: Math.round(minutes) });
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return stops;
}

// Computed epoch seconds -> 'YYYY-MM-DD HH:MM:SS' wall-clock strings on the DB clock (the same
// clock every other time in the response is read from), in one query.
async function tsToLocal(executor, values) {
  if (!values.length) return [];
  const [[row]] = await executor.query(
    `SELECT ${values.map((_, i) => `DATE_FORMAT(FROM_UNIXTIME(?), '%Y-%m-%d %H:%i:%s') AS c${i}`).join(", ")}`,
    values
  );
  return values.map((_, i) => row[`c${i}`]);
}

// user: { id, name, phone? }. date: 'YYYY-MM-DD'.
async function computeDay(executor, user, date) {
  const [[homeRow]] = await executor.query(
    "SELECT latitude, longitude, address FROM sales_home_locations WHERE user_id = ?",
    [user.id]
  );
  const home = homeRow ? { ...latLng(homeRow.latitude, homeRow.longitude), address: homeRow.address } : null;

  const [shiftRows] = await executor.query(
    `SELECT id, status,
            DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at, UNIX_TIMESTAMP(started_at) AS start_ts,
            DATE_FORMAT(ended_at, '%Y-%m-%d %H:%i:%s') AS ended_at, UNIX_TIMESTAMP(ended_at) AS end_ts,
            start_latitude, start_longitude, end_latitude, end_longitude
       FROM sales_field_shifts
      WHERE user_id = ? AND DATE(started_at) = ?
      ORDER BY started_at ASC`,
    [user.id, date]
  );
  const shifts = shiftRows.map((s) => {
    const start = latLng(s.start_latitude, s.start_longitude);
    const end = latLng(s.end_latitude, s.end_longitude);
    return {
      id: s.id,
      status: s.status,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      startTs: Number(s.start_ts),
      endTs: s.end_ts === null ? null : Number(s.end_ts),
      start,
      end,
      startFromHomeM: metersBetween(start, home),
      endFromHomeM: metersBetween(end, home),
    };
  });

  let points = [];
  if (shifts.length) {
    const [pointRows] = await executor.query(
      `SELECT shift_id, UNIX_TIMESTAMP(captured_at) AS ts, DATE_FORMAT(captured_at, '%Y-%m-%d %H:%i:%s') AS captured_at,
              latitude, longitude, accuracy_m, speed_kmph, battery_percent
         FROM sales_field_points
        WHERE shift_id IN (?)
        ORDER BY captured_at ASC, id ASC`,
      [shifts.map((s) => s.id)]
    );
    points = pointRows.map((p) => ({
      shiftId: p.shift_id,
      ts: Number(p.ts),
      capturedAt: p.captured_at,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      accuracy: num(p.accuracy_m),
      speedKmph: num(p.speed_kmph),
      batteryPercent: num(p.battery_percent),
    }));
  }
  const gpsKm = analysePoints(points);

  // Client punches that day. An unplanned visit is created and checked in by one statement, so
  // its scheduled_at equals its check_in_at; a planned meeting is scheduled earlier.
  const [visitRows] = await executor.query(
    `SELECT m.id, m.lead_id, m.status, m.meeting_type, m.outcome_notes,
            DATE_FORMAT(m.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
            DATE_FORMAT(m.check_in_at, '%Y-%m-%d %H:%i:%s') AS check_in_at,
            DATE_FORMAT(m.check_out_at, '%Y-%m-%d %H:%i:%s') AS check_out_at,
            m.check_in_lat, m.check_in_lng, m.check_out_lat, m.check_out_lng,
            (m.scheduled_at = m.check_in_at) AS unplanned,
            l.lead_number, l.company_name, l.customer_name, l.location AS lead_address,
            l.latitude AS lead_latitude, l.longitude AS lead_longitude
       FROM crm_lead_meetings m
       JOIN crm_leads l ON l.id = m.lead_id
      WHERE m.sales_employee_id = ? AND m.check_in_at IS NOT NULL AND DATE(m.check_in_at) = ?
      ORDER BY m.check_in_at ASC`,
    [user.id, date]
  );
  const visits = visitRows.map((v) => {
    const checkIn = latLng(v.check_in_lat, v.check_in_lng);
    const leadLocation = latLng(v.lead_latitude, v.lead_longitude);
    return {
      meetingId: v.id,
      leadId: v.lead_id,
      leadNumber: v.lead_number,
      company: v.company_name || v.customer_name,
      address: v.lead_address,
      status: v.status,
      unplanned: Boolean(Number(v.unplanned)),
      scheduledAt: v.scheduled_at,
      checkInAt: v.check_in_at,
      checkOutAt: v.check_out_at,
      checkIn,
      checkOut: latLng(v.check_out_lat, v.check_out_lng),
      leadLocation,
      distanceFromLeadM: metersBetween(checkIn, leadLocation),
      outcomeNotes: v.outcome_notes,
    };
  });

  const [[nowRow]] = await executor.query("SELECT UNIX_TIMESTAMP(NOW()) AS now_ts");
  const gaps = findGaps(shifts, points, Number(nowRow.now_ts));
  const stops = findStops(points);

  // Turn the computed epoch times back into DB wall-clock strings in one round trip.
  const epochs = [...gaps.flatMap((g) => [g.fromTs, g.toTs]), ...stops.flatMap((s) => [s.fromTs, s.toTs])];
  const local = await tsToLocal(executor, epochs);
  let k = 0;
  const gapsOut = gaps.map((g) => ({ from: local[k++], to: local[k++], minutes: g.minutes }));
  const stopsOut = stops.map((s) => ({
    latitude: s.latitude, longitude: s.longitude, from: local[k++], to: local[k++], minutes: s.minutes,
  }));

  // Petrol route: always from and back to the registered home, through each client in punch order
  // (check-in GPS, else the lead's saved location). No home or no visits = nothing to measure.
  const stopsForPetrol = visits.map((v) => v.checkIn || v.leadLocation).filter(Boolean);
  const petrolRoute = home && stopsForPetrol.length
    ? [{ latitude: home.latitude, longitude: home.longitude }, ...stopsForPetrol, { latitude: home.latitude, longitude: home.longitude }]
    : null;

  // What the road route and petrol km are worked out from: the valid GPS track, the client stops,
  // and whether a home was set. A saved route (sales_field_day_routes) is used only while this
  // still matches - late points from an offline phone, or a home set afterwards, make it
  // be worked out again. Moving an existing home later does not change a saved day.
  const fingerprint = crypto
    .createHash("sha1")
    .update(JSON.stringify([
      points.filter((p) => p.valid).map((p) => [p.latitude, p.longitude, p.ts]),
      stopsForPetrol.map((p) => [p.latitude, p.longitude]),
      Boolean(home),
    ]))
    .digest("hex");
  // Closed = the executive started a shift that day and every shift of it has ended.
  const closed = shifts.length > 0 && shifts.every((s) => s.status !== "ACTIVE");
  const [[savedRow]] = await executor.query(
    `SELECT fingerprint, petrol_km, road_path, DATE_FORMAT(computed_at, '%Y-%m-%d %H:%i:%s') AS computed_at
       FROM sales_field_day_routes WHERE user_id = ? AND work_date = ?`,
    [user.id, date]
  );
  const savedRoute = savedRow && savedRow.fingerprint === fingerprint
    ? { petrolKm: num(savedRow.petrol_km), roadPath: savedRow.road_path, computedAt: savedRow.computed_at }
    : null;

  const firstStart = shifts.length ? shifts[0].startedAt : null;
  const lastShift = shifts[shifts.length - 1];
  const durationMin = shifts.reduce(
    (sum, s) => sum + Math.max(0, ((s.endTs ?? Number(nowRow.now_ts)) - s.startTs) / 60),
    0
  );

  return {
    user: { id: user.id, name: user.name },
    date,
    home,
    shifts: shifts.map(({ startTs, endTs, ...rest }) => rest),
    points: points.map(({ ts, ...rest }) => rest),
    visits,
    stops: stopsOut,
    gaps: gapsOut,
    petrolRoute,
    closed,
    fingerprint,
    // The road route / petrol km saved for this day, or null (not worked out yet, or out of date).
    savedRoute,
    summary: {
      petrolKm: savedRoute ? savedRoute.petrolKm : null,
      firstStart,
      lastEnd: lastShift ? lastShift.endedAt : null,
      durationMin: Math.round(durationMin),
      gpsKm,
      pointCount: points.length,
      validPointCount: points.filter((p) => p.valid).length,
      visitCount: visits.length,
      unplannedVisitCount: visits.filter((v) => v.unplanned).length,
      gapCount: gapsOut.length,
    },
  };
}

module.exports = { computeDay, distanceMeters };

// Sales Executive Field Tracking - building one executive's day from the stored rows.
// Used by routes/sales-field-tracking.routes.js (team list + day view).
//
// GPS km is the sum of straight-line hops between consecutive *valid* points:
//  - a point with accuracy worse than MAX_ACCURACY_M is ignored (poor fix);
//  - a point that would need more than MAX_SPEED_KMPH from the last good point is ignored (GPS jump);
//  - hops shorter than MIN_HOP_M are not counted (GPS jitter while standing still) - the anchor
//    stays put until the executive has really moved.
//
// Petrol km is counted per leg, from where the shift was started (no home location):
//    Start -> client 1 -> client 2 -> ... -> last client -> (return) end of the shift
// Each shift of a day is counted on its own and the shifts are added up; the time between two
// shifts is off duty - not travel, not missing GPS.
// Each leg pays what the GPS shows was travelled on it, but never more than the direct road km
// between its two places + ALLOWANCE (traffic, diversions, one-way roads) - a personal detour
// between clients is not paid. With no GPS on a leg, its direct road km is paid (and flagged).
// The return leg (after the last client) pays the trip to where the shift ended, but never more
// than the road km from the last client back to the shift's start point - travel elsewhere after
// the last meeting is not paid.
// The direct road km of every leg comes from Google's Routes API, asked once by the manager's
// browser (no server key) and saved in sales_field_day_routes.leg_road_m; all the rules above are
// applied here, on the server.

const crypto = require("crypto");

const MAX_ACCURACY_M = 100;
const MAX_SPEED_KMPH = 150;
const MIN_HOP_M = 30;
// No point for this long during an open shift = a tracking gap (phone off, GPS off, app killed).
const GAP_MINUTES = 20;
// Staying within STOP_RADIUS_M for at least STOP_MINUTES = a stop.
const STOP_RADIUS_M = 150;
const STOP_MINUTES = 20;
// A leg pays at most its direct road km x ALLOWANCE (25% extra).
const ALLOWANCE = 1.25;

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

/**
 * GPS km travelled between two moments: from `from` (place + time) through the valid points
 * recorded in between to `to`. km is null when the leg is not covered - a stretch of GAP_MINUTES+
 * with no point (phone off, GPS off) - so its real travel is unknown.
 */
function legGps(points, from, to) {
  const inside = points.filter((p) => p.valid && p.ts > from.ts && p.ts < to.ts);
  const marks = [from.ts, ...inside.map((p) => p.ts), to.ts];
  for (let i = 1; i < marks.length; i += 1) {
    if ((marks[i] - marks[i - 1]) / 60 >= GAP_MINUTES) return { km: null, points: inside.length };
  }
  const path = [from.place, ...inside, to.place].filter(Boolean);
  let meters = 0;
  let anchor = path[0];
  for (const p of path.slice(1)) {
    const hop = distanceMeters(anchor.latitude, anchor.longitude, p.latitude, p.longitude);
    if (hop >= MIN_HOP_M) {
      meters += hop;
      anchor = p;
    }
  }
  return { km: round2(meters / 1000), points: inside.length };
}

/**
 * The petrol legs of a day, and the places Google measures the direct road km between:
 *   waypoints = [start, client 1, ..., client N, start]
 *   road leg i = waypoints[i] -> waypoints[i + 1]  (the last one: last client -> start, the return cap)
 * roadMeters: those N+1 distances (saved), or null when not worked out yet.
 */
function petrolLegs({ start, visits, points, dayEnd, open }, roadMeters) {
  const stops = visits
    .map((v) => ({ v, place: v.checkIn || v.leadLocation }))
    .filter((s) => s.place);
  if (!start || stops.length === 0) return { waypoints: null, legs: [], km: null, final: false };

  const waypoints = [start.place, ...stops.map((s) => s.place), start.place];
  const roadKm = (i) => (roadMeters && Number.isFinite(roadMeters[i]) ? round2(roadMeters[i] / 1000) : null);
  const pay = (gpsKm, road) => {
    if (road === null) return { paidKm: null, status: "PENDING" };
    if (gpsKm === null) return { paidKm: road, status: "NO_GPS" };
    if (gpsKm > road * ALLOWANCE) return { paidKm: round2(road * ALLOWANCE), status: "CAPPED" };
    return { paidKm: gpsKm, status: "OK" };
  };

  const legs = [];
  let from = { ts: start.ts, place: start.place, label: "Shift start", time: start.time };
  stops.forEach((s, i) => {
    const to = { ts: s.v.checkInTs, place: s.place, label: s.v.company, time: s.v.checkInAt };
    const gps = legGps(points, from, to);
    const road = roadKm(i);
    legs.push({ kind: "TRAVEL", from: from.label, to: to.label, fromAt: from.time, toAt: to.time, gpsKm: gps.km, roadKm: road, maxKm: road === null ? null : round2(road * ALLOWANCE), ...pay(gps.km, road) });
    // the next leg starts when they leave this client
    from = {
      ts: s.v.checkOutTs ?? s.v.checkInTs,
      place: s.v.checkOut || s.place,
      label: s.v.company,
      time: s.v.checkOutAt || s.v.checkInAt,
    };
  });

  // Return: from the last client to where (and when) the day ended - capped at the road km back to
  // the start point. While the shift is still open it is not counted yet.
  const capRoad = roadKm(stops.length);
  if (open) {
    legs.push({ kind: "RETURN", from: from.label, to: "End of shift", fromAt: from.time, toAt: null, gpsKm: null, roadKm: capRoad, maxKm: capRoad === null ? null : round2(capRoad * ALLOWANCE), paidKm: null, status: "OPEN" });
  } else {
    const after = points.filter((p) => p.valid && p.ts > from.ts && p.ts <= dayEnd.ts);
    const endPlace = dayEnd.place || (after.length ? after[after.length - 1] : null);
    const gps = endPlace ? legGps(points, from, { ts: dayEnd.ts, place: endPlace }) : { km: null };
    legs.push({ kind: "RETURN", from: from.label, to: "Shift end", fromAt: from.time, toAt: dayEnd.time, gpsKm: gps.km, roadKm: capRoad, maxKm: capRoad === null ? null : round2(capRoad * ALLOWANCE), ...pay(gps.km, capRoad) });
  }

  const counted = legs.filter((l) => l.status !== "OPEN");
  const ready = counted.every((l) => l.paidKm !== null);
  return {
    waypoints,
    legs,
    km: ready ? round2(counted.reduce((s, l) => s + l.paidKm, 0)) : null,
    final: ready && !open,
  };
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

/**
 * user: { id, name, phone? }. date: 'YYYY-MM-DD'.
 * roadMetersOverride: leg road distances just measured by the browser (see the route-save endpoint)
 * - used instead of the saved ones to work the petrol out.
 */
async function computeDay(executor, user, date, roadMetersOverride = null) {
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
  const shifts = shiftRows.map((s) => ({
    id: s.id,
    status: s.status,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    startTs: Number(s.start_ts),
    endTs: s.end_ts === null ? null : Number(s.end_ts),
    start: latLng(s.start_latitude, s.start_longitude),
    end: latLng(s.end_latitude, s.end_longitude),
  }));

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
            DATE_FORMAT(m.check_in_at, '%Y-%m-%d %H:%i:%s') AS check_in_at, UNIX_TIMESTAMP(m.check_in_at) AS check_in_ts,
            DATE_FORMAT(m.check_out_at, '%Y-%m-%d %H:%i:%s') AS check_out_at, UNIX_TIMESTAMP(m.check_out_at) AS check_out_ts,
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
      checkInTs: Number(v.check_in_ts),
      checkOutTs: v.check_out_ts === null ? null : Number(v.check_out_ts),
      checkIn,
      checkOut: latLng(v.check_out_lat, v.check_out_lng),
      leadLocation,
      distanceFromLeadM: metersBetween(checkIn, leadLocation),
      outcomeNotes: v.outcome_notes,
    };
  });

  const [[nowRow]] = await executor.query("SELECT UNIX_TIMESTAMP(NOW()) AS now_ts");
  const nowTs = Number(nowRow.now_ts);
  const gaps = findGaps(shifts, points, nowTs);
  const stops = findStops(points);

  // Turn the computed epoch times back into DB wall-clock strings in one round trip.
  const epochs = [...gaps.flatMap((g) => [g.fromTs, g.toTs]), ...stops.flatMap((s) => [s.fromTs, s.toTs])];
  const local = await tsToLocal(executor, epochs);
  let k = 0;
  const gapsOut = gaps.map((g) => ({ from: local[k++], to: local[k++], minutes: g.minutes }));
  const stopsOut = stops.map((s) => ({
    latitude: s.latitude, longitude: s.longitude, from: local[k++], to: local[k++], minutes: s.minutes,
  }));

  // Closed = the executive started a shift that day and every shift of it has ended.
  const open = shifts.some((s) => s.status === "ACTIVE");
  const closed = shifts.length > 0 && !open;
  const firstShift = shifts[0];
  const lastShift = shifts[shifts.length - 1];

  // Petrol is worked out PER SHIFT - each its own start -> clients -> return - and added up. The
  // time between two shifts (End Shift ... Start Shift again) is off duty: it is never counted as
  // travel or as missing GPS. A visit belongs to the last shift that started before its check-in.
  const shiftOf = (ts) => {
    let n = 0;
    shifts.forEach((s, i) => {
      if (s.startTs <= ts) n = i;
    });
    return n;
  };
  visits.forEach((v) => {
    v.shiftIndex = shiftOf(v.checkInTs);
  });
  const perShift = (roadGroups) =>
    shifts.map((s, i) =>
      petrolLegs(
        {
          start: s.start ? { place: s.start, ts: s.startTs, time: s.startedAt } : null,
          visits: visits.filter((v) => v.shiftIndex === i),
          points: points.filter((p) => p.shiftId === s.id),
          dayEnd: { place: s.end, ts: s.endTs ?? nowTs, time: s.endedAt },
          open: s.status === "ACTIVE",
        },
        roadGroups ? roadGroups[i] : null
      )
    );

  // The places Google is asked about, per shift ([start, client 1, ..., client N, start], or null
  // for a shift with no visit). The saved road km are used only while these and the GPS track still
  // match (fingerprint) - late points from an offline phone or a later punch make the day be worked
  // out again.
  const shape = perShift(null);
  const fingerprint = crypto
    .createHash("sha1")
    .update(JSON.stringify([
      points.filter((p) => p.valid).map((p) => [p.latitude, p.longitude, p.ts]),
      shape.map((g) => (g.waypoints || []).map((p) => [p.latitude, p.longitude])),
      visits.map((v) => [v.checkInTs, v.checkOutTs]),
      shifts.map((s) => [s.startTs, s.endTs, s.end && s.end.latitude, s.end && s.end.longitude]),
    ]))
    .digest("hex");

  const [[savedRow]] = await executor.query(
    `SELECT fingerprint, petrol_km, road_path, leg_road_m, DATE_FORMAT(computed_at, '%Y-%m-%d %H:%i:%s') AS computed_at
       FROM sales_field_day_routes WHERE user_id = ? AND work_date = ?`,
    [user.id, date]
  );
  const savedLegs = savedRow && savedRow.fingerprint === fingerprint && savedRow.leg_road_m
    ? (typeof savedRow.leg_road_m === "string" ? JSON.parse(savedRow.leg_road_m) : savedRow.leg_road_m)
    : null;
  const savedRoute = savedRow && savedRow.fingerprint === fingerprint
    ? { petrolKm: num(savedRow.petrol_km), roadPath: savedRow.road_path, computedAt: savedRow.computed_at }
    : null;
  // Road metres per shift group. An older flat list (one-group save) no longer matches the
  // fingerprint, so it never gets here.
  const roadMeters = roadMetersOverride || (Array.isArray(savedLegs) && savedLegs.every((g) => g === null || Array.isArray(g)) ? savedLegs : null);
  const groups = perShift(roadMeters);
  const counted = groups.filter((g) => g.legs.length > 0);
  const petrolKm = counted.length && counted.every((g) => g.km !== null) ? round2(counted.reduce((s, g) => s + g.km, 0)) : null;
  const petrol = {
    km: petrolKm,
    final: petrolKm !== null && !open,
    // every trip of the day, each tagged with its shift (1, 2, ...)
    legs: groups.flatMap((g, i) => g.legs.map((l) => ({ ...l, shift: i + 1 }))),
    shifts: groups.map((g, i) => ({
      shift: i + 1,
      startedAt: shifts[i].startedAt,
      endedAt: shifts[i].endedAt,
      km: g.legs.length ? g.km : null,
      tripCount: g.legs.length,
    })),
  };

  const durationMin = shifts.reduce((sum, s) => sum + Math.max(0, ((s.endTs ?? nowTs) - s.startTs) / 60), 0);

  return {
    user: { id: user.id, name: user.name },
    date,
    shifts: shifts.map(({ startTs, endTs, ...rest }) => rest),
    points: points.map(({ ts, ...rest }) => rest),
    visits: visits.map(({ checkInTs, checkOutTs, shiftIndex, ...rest }) => ({ ...rest, shift: shiftIndex + 1 })),
    stops: stopsOut,
    gaps: gapsOut,
    // Petrol: the trips (GPS km / direct road km / paid km / status, each with its shift), a total
    // per shift and, while the road km are not worked out yet, the places to ask Google about - one
    // group per shift: [start, client 1, ..., client N, start], null for a shift with no visit.
    petrol: {
      km: petrol.km,
      final: petrol.final,
      allowancePercent: Math.round((ALLOWANCE - 1) * 100),
      legs: petrol.legs,
      shifts: petrol.shifts,
      waypoints: roadMeters || !shape.some((g) => g.waypoints) ? null : shape.map((g) => g.waypoints),
    },
    closed,
    fingerprint,
    // The road route line saved for this day, or null (not worked out yet, or out of date).
    savedRoute,
    summary: {
      petrolKm: petrol.km,
      petrolFinal: petrol.final,
      firstStart: firstShift ? firstShift.startedAt : null,
      lastEnd: lastShift ? lastShift.endedAt : null,
      durationMin: Math.round(durationMin),
      gpsKm,
      pointCount: points.length,
      validPointCount: points.filter((p) => p.valid).length,
      visitCount: visits.length,
      unplannedVisitCount: visits.filter((v) => v.unplanned).length,
      gapCount: gapsOut.length,
      flaggedLegCount: petrol.legs.filter((l) => l.status === "CAPPED" || l.status === "NO_GPS").length,
    },
  };
}

module.exports = { computeDay, distanceMeters, petrolLegs, ALLOWANCE };

// Site visits: where and when a sales person started and ended each visit (the GPS
// points the Android app records at check-in and on completing it). Used by the
// lead's Site Visits tab and the sales manager's Team Visits page.

import { useEffect, useState } from "react";
import { FiBriefcase, FiCalendar, FiExternalLink, FiMapPin, FiUsers, FiXCircle } from "react-icons/fi";
import { leadVisits } from "./leadsApi";
import { dateTime, timeLabel } from "./format";
import { Badge, Button, Empty, SkeletonRows } from "./ui";

/** A visit's state for its badge: started but not finished reads as in progress. */
const VISIT_STATE = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "warn" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  RESCHEDULED: { label: "Rescheduled", tone: "violet" },
};

const mapLink = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// One address lookup per point for the whole session - lists re-render, and each lookup is a request.
const placeCache = new Map();
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/** The written place for a GPS point ("4th Cross, Jayanagar, Bengaluru"), or null if it cannot be found. */
function placeOf({ lat, lng }) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (!placeCache.has(key)) {
    const lookup = !MAPS_KEY
      ? Promise.resolve(null)
      : fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`)
          .then((r) => r.json())
          // Drop a leading Google plus code ("WHJM+8GF, ..."), as the Android app does.
          .then((d) => (d.status === "OK" && d.results?.[0]?.formatted_address ? d.results[0].formatted_address.replace(/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3},?\s*/i, "") : null))
          .catch(() => null);
    placeCache.set(key, lookup);
  }
  return placeCache.get(key);
}

/** "Started 11:34 am" with the place in words and a Map button for the exact point. */
export function PlaceLine({ label, at, point, tone }) {
  const [place, setPlace] = useState({ key: "", text: null });
  const key = point ? `${point.lat},${point.lng}` : "";

  useEffect(() => {
    if (!point) return undefined;
    let alive = true;
    placeOf(point).then((text) => alive && setPlace({ key: `${point.lat},${point.lng}`, text }));
    return () => {
      alive = false;
    };
  }, [point]);

  const looking = point && place.key !== key;
  return (
    <div className="lm-place">
      <span className={`lm-place-dot tone-${tone}`}>
        <FiMapPin />
      </span>
      <div className="lm-place-text">
        <small>{label}</small>
        <strong>{timeLabel(at)}</strong>
        <span className={place.text ? "" : "muted"}>
          {!point ? "No GPS recorded" : looking ? "Finding the place..." : place.text || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}
        </span>
      </div>
      {!!point && (
        <a className="lm-btn ghost sm" href={mapLink(point)} target="_blank" rel="noreferrer">
          <FiExternalLink /> Map
        </a>
      )}
    </div>
  );
}

/** The start and end of one visit, when it has them. */
export function VisitPlaces({ visit }) {
  if (!visit.startedAt && !visit.endedAt) return null;
  return (
    <div className="lm-places">
      {!!visit.startedAt && <PlaceLine label="Started" at={visit.startedAt} point={visit.startPoint} tone="success" />}
      {!!visit.endedAt && <PlaceLine label="Ended" at={visit.endedAt} point={visit.endPoint} tone="info" />}
    </div>
  );
}

/**
 * A lead's visit history (GET /leads/{id}/meetings), newest first: when, with whom, whether it
 * happened - start and end time and place - and the outcome. A visit still to happen can be
 * rescheduled or cancelled by whoever manages the lead.
 */
export function SiteVisitsTab({ lead, refreshKey, canChange, onMove, onCancel }) {
  const [state, setState] = useState({ key: null, rows: null, error: "" });
  const key = `${lead.id}:${lead.updatedAt}:${refreshKey}`;

  useEffect(() => {
    let alive = true;
    leadVisits(lead.id)
      .then((rows) => alive && setState({ key, rows, error: "" }))
      .catch((err) => alive && setState({ key, rows: [], error: err.message || "Could not load the visits." }));
    return () => {
      alive = false;
    };
  }, [lead.id, key]);

  const { rows, error } = state;
  if (error) return <Empty title="Could not load the visits" text={error} icon={<FiMapPin />} />;
  if (!rows) return <SkeletonRows rows={3} />;
  if (rows.length === 0) return <Empty title="No visits yet" text="A visit is scheduled once the lead is verified as genuine." icon={<FiCalendar />} />;

  return (
    <div className="lm-visits">
      {rows.map((v, i) => {
        const st = VISIT_STATE[v.status] || VISIT_STATE.SCHEDULED;
        const office = v.type === "MEETING";
        return (
          <div key={v.id} className="lm-visit" style={{ "--i": i }}>
            <span className="lm-visit-icon">{office ? <FiUsers /> : <FiBriefcase />}</span>
            <div className="lm-visit-body">
              <div className="lm-visit-top">
                <strong>{dateTime(v.scheduledAt)}</strong>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
              <small className="muted">
                {office ? "Office meeting" : "Site visit"}
                {v.salesName ? ` Â· ${v.salesName}` : ""}
                {v.address ? ` Â· ${v.address}` : ""}
              </small>
              <VisitPlaces visit={v} />
              {!!v.outcomeText && <p className="lm-visit-note">{v.outcomeText}</p>}
              {canChange && v.status === "SCHEDULED" && (
                <span style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <Button size="sm" variant="ghost" icon={<FiCalendar />} onClick={() => onMove(v)}>
                    Reschedule
                  </Button>
                  <Button size="sm" variant="ghost" icon={<FiXCircle />} onClick={() => onCancel(v)}>
                    Cancel
                  </Button>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

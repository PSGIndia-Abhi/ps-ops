import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import Map from "../components/maps/Map";

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString();
}

export default function TrackingHistory() {
  const navigate = useNavigate();
  const { technicianId } = useParams();

  const today = new Date().toISOString().split("T")[0];

  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(true);

  const [technician, setTechnician] = useState(null);
  const [shift, setShift] = useState(null);
  const [locations, setLocations] = useState([]);
  const [visits, setVisits] = useState([]);

  async function fetchHistory(date = selectedDate) {
    try {
      setLoading(true);

      const res = await apiFetch(
        `/api/shifts/history/${technicianId}?date=${date}`
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load history");
      }

      setTechnician(data.technician);
      setShift(data.shift);
      setLocations(data.locations || []);
      setVisits(data.visits || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHistory(selectedDate);
  }, [selectedDate]);

  const visitSummaries = useMemo(() => {
    if (!shift) return [];

    const sortedVisits = [...visits].sort((left, right) => {
      const leftTime = new Date(
        left.started_at || left.scheduled_date || 0
      ).getTime();
      const rightTime = new Date(
        right.started_at || right.scheduled_date || 0
      ).getTime();

      return leftTime - rightTime;
    });

    return sortedVisits.map((visit, index) => {
      const startAt = visit.started_at || visit.scheduled_date;
      const nextVisit = sortedVisits[index + 1];
      const nextStartAt =
        nextVisit?.started_at || nextVisit?.scheduled_date || null;

      const boundaryCandidates = [
        visit.completed_at,
        visit.updated_at,
        nextStartAt,
        shift.ended_at,
      ]
        .filter(Boolean)
        .map((value) => new Date(value).getTime())
        .filter((value) => !Number.isNaN(value));

      const startTime = startAt
        ? new Date(startAt).getTime()
        : Number.NaN;
      const endTime = boundaryCandidates.length
        ? Math.min(...boundaryCandidates)
        : Number.NaN;

      const points = locations.filter((point) => {
        const recordedAt = new Date(point.recorded_at).getTime();

        if (Number.isNaN(startTime)) {
          return false;
        }

        if (Number.isNaN(endTime)) {
          return recordedAt >= startTime;
        }

        return recordedAt >= startTime && recordedAt <= endTime;
      });

      return {
        ...visit,
        tracked_points: points.length,
        startPoint: points[0] || null,
        endPoint: points[points.length - 1] || null,
        trackingStartedAt:
          points[0]?.recorded_at || visit.started_at || visit.scheduled_date,
        trackingEndedAt:
          points[points.length - 1]?.recorded_at ||
          visit.completed_at ||
          visit.updated_at ||
          null,
      };
    });
  }, [locations, shift, visits]);

  const markers = useMemo(() => {
    const items = [];

    if (shift?.start_latitude && shift?.start_longitude) {
      items.push({
        id: "shift-start",
        lat: Number(shift.start_latitude),
        lng: Number(shift.start_longitude),
        title: "Shift Start",
        type: "start",
      });
    }

    visitSummaries.forEach((visit) => {
      if (!visit.startPoint) return;

      const visitTime = formatTime(
        visit.trackingStartedAt ||
          visit.started_at ||
          visit.scheduled_date
      );

      items.push({
        id: `visit-${visit.id}`,
        lat: Number(visit.startPoint.latitude),
        lng: Number(visit.startPoint.longitude),
        title: `Visit #${visit.visit_number} - ${visitTime}`,
        type: "visit",
        label: `#${visit.visit_number}`,
        timeLabel: visitTime,
      });
    });

    if (shift?.end_latitude && shift?.end_longitude) {
      items.push({
        id: "shift-end",
        lat: Number(shift.end_latitude),
        lng: Number(shift.end_longitude),
        title: "Shift End",
        type: "end",
      });
    }

    return items;
  }, [shift, visitSummaries]);

  const mapCenter =
    markers[0]
      ? { lat: markers[0].lat, lng: markers[0].lng }
      : { lat: 12.9716, lng: 77.5946 };

  const timelineItems = useMemo(() => {
    const items = [];

    if (shift?.started_at) {
      items.push({
        id: "timeline-shift-start",
        label: "Shift Started",
        time: shift.started_at,
        subtitle: "Start location captured",
      });
    }

    visitSummaries.forEach((visit) => {
      items.push({
        id: `timeline-visit-${visit.id}`,
        label: `Visit #${visit.visit_number}`,
        time: visit.started_at || visit.scheduled_date,
        subtitle: `${visit.job_title || "Assigned job"}${visit.site_name ? ` - ${visit.site_name}` : ""}`,
        detail: `Status: ${visit.status} | Tracked points: ${visit.tracked_points}`,
      });
    });

    if (shift?.ended_at) {
      items.push({
        id: "timeline-shift-end",
        label: "Shift Ended",
        time: shift.ended_at,
        subtitle: "End location captured",
      });
    }

    return items;
  }, [shift, visitSummaries]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="tracking-history-page">
      <div className="page-header">
        <button onClick={() => navigate(-1)}>
          Back
        </button>

        <div>
          <h2>{technician?.name}</h2>
          <p>Technician History</p>
        </div>
      </div>

      <div className="history-toolbar">
        <label>
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
      </div>

      {shift ? (
        <>
          <div className="history-summary">
            <div className="summary-card">
              <span>Shift Start</span>
              <strong>{formatTime(shift.started_at)}</strong>
            </div>

            <div className="summary-card">
              <span>Shift End</span>
              <strong>{formatTime(shift.ended_at)}</strong>
            </div>

            <div className="summary-card">
              <span>Visits</span>
              <strong>{visitSummaries.length}</strong>
            </div>

            <div className="summary-card">
              <span>Tracked Points</span>
              <strong>{locations.length}</strong>
            </div>
          </div>

          <div
            style={{
              height: 550,
              marginTop: 20,
            }}
          >
            <Map
              center={mapCenter}
              zoom={14}
              markers={markers}
            />
          </div>

          <div className="timeline" style={{ marginTop: 30 }}>
            <h3>Tracking Timeline</h3>

            {timelineItems.map((item) => (
              <div key={item.id} className="timeline-item">
                <strong>{item.label}</strong>
                <div>{formatDateTime(item.time)}</div>
                <div>{item.subtitle}</div>
                {item.detail ? <div>{item.detail}</div> : null}
              </div>
            ))}
          </div>

          <div className="timeline" style={{ marginTop: 30 }}>
            <h3>Visit Summary</h3>

            {visitSummaries.length === 0 && (
              <div className="timeline-item">
                No assigned visits found for this date.
              </div>
            )}

            {visitSummaries.map((visit) => (
              <div key={visit.id} className="timeline-item">
                <strong>
                  Visit #{visit.visit_number} - {visit.job_title || "Assigned job"}
                </strong>
                <div>Job Code: {visit.job_code || "-"}</div>
                <div>Site: {visit.site_name || "-"}</div>
                <div>Status: {visit.status}</div>
                <div>Visit Start: {formatDateTime(visit.started_at || visit.scheduled_date)}</div>
                <div>Tracking Start: {formatDateTime(visit.trackingStartedAt)}</div>
                <div>Tracking End: {formatDateTime(visit.trackingEndedAt)}</div>
                <div>Tracked Points: {visit.tracked_points}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 30 }}>
          No shift found for this date.
        </div>
      )}
    </div>
  );
}

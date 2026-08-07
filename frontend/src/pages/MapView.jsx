import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import Map from "../components/maps/Map";

export default function MapView() {
  const navigate = useNavigate();

  const [onlineTechnicians, setOnlineTechnicians] = useState([]);
  const [offlineTechnicians, setOfflineTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showOnline, setShowOnline] = useState(true);
  const [showOffline, setShowOffline] = useState(false);

  async function fetchTechnicians() {
    try {
      const res = await apiFetch("/api/shifts/technicians");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch technicians");
      }

      setOnlineTechnicians(data.online || []);
      setOfflineTechnicians(data.offline || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTechnicians();

    const interval = setInterval(fetchTechnicians, 10000);

    return () => clearInterval(interval);
  }, []);

  const markers = onlineTechnicians
    .filter((tech) => tech.location)
    .map((tech) => ({
      id: tech.technician_id,
      lat: tech.location.latitude,
      lng: tech.location.longitude,
      title: tech.name,
      initials: tech.name
        ?.split(" ")
        .map((x) => x[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      type: "technician",
    }));

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="map-view">

      <div className="page-header">
        <div>
          <h2>Technician Tracking</h2>
          <p>
            {onlineTechnicians.length} technicians currently online
          </p>
        </div>
      </div>

      <Map
        center={{
          lat: 12.9716,
          lng: 77.5946,
        }}
        zoom={11}
        markers={markers}
      />

      {/* ONLINE */}

      <div className="tracking-section">

        <div
          className="tracking-section-header"
          onClick={() => setShowOnline(!showOnline)}
        >
          <h3>🟢 Online Technicians</h3>

          <span>
            {onlineTechnicians.length}
          </span>
        </div>

        {showOnline && (

          <div className="tracking-list">

            {onlineTechnicians.map((tech) => {

              const initials = tech.name
                ?.split(" ")
                .map((x) => x[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  className="live-technician-card"
                  key={tech.technician_id}
                >

                  <div className="live-technician-avatar">
                    {initials}
                  </div>

                  <div className="live-technician-info">

                    <strong>{tech.name}</strong>

                    <span>
                      Shift Started{" "}
                      {new Date(
                        tech.started_at
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                  </div>

                  <div className="live-technician-actions">

                    <button
                      className="btn btn-secondary"
                    >
                      Locate
                    </button>

                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        navigate(
                          `/tracking/history/${tech.technician_id}`
                        )
                      }
                    >
                      History
                    </button>

                  </div>

                </div>
              );
            })}

          </div>

        )}

      </div>

      {/* OFFLINE */}

      <div className="tracking-section">

        <div
          className="tracking-section-header"
          onClick={() => setShowOffline(!showOffline)}
        >
          <h3>⚪ Offline Technicians</h3>

          <span>
            {offlineTechnicians.length}
          </span>
        </div>

        {showOffline && (

          <div className="tracking-list">

            {offlineTechnicians.map((tech) => {

              const initials = tech.name
                ?.split(" ")
                .map((x) => x[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  className="live-technician-card"
                  key={tech.technician_id}
                >

                  <div className="live-technician-avatar">
                    {initials}
                  </div>

                  <div className="live-technician-info">

                    <strong>{tech.name}</strong>

                    <span>
                      Last Shift{" "}
                      {tech.last_shift_end
                        ? new Date(
                            tech.last_shift_end
                          ).toLocaleString()
                        : "Never"}
                    </span>

                  </div>

                  <div className="live-technician-actions">

                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        navigate(
                          `/admin/tracking/history/${tech.technician_id}`
                        )
                      }
                    >
                      History
                    </button>

                  </div>

                </div>
              );
            })}

          </div>

        )}

      </div>

    </div>
  );
}
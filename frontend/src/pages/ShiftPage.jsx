import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import Map from "../components/maps/Map";


export default function ShiftPage({ onShiftStarted }) {
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(true);
    const [error, setError] = useState("");
    const [location, setLocation] = useState(null);

  /* ---------------- GET INITIAL LOCATION ---------------- */

  useEffect(() => {
    getCurrentLocation();
  }, []);

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Location services are not supported on this device.");
      setLocationLoading(false);
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        setLocation({
          latitude,
          longitude,
        });

        setError("");
        setLocationLoading(false);
      },

      (geoError) => {
        console.error("Location error:", geoError);

        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            setError("Location permission is required to start your shift.");
            break;

          case geoError.POSITION_UNAVAILABLE:
            setError("Your current location could not be determined.");
            break;

          case geoError.TIMEOUT:
            setError("Location request timed out. Please try again.");
            break;

          default:
            setError("Unable to access your location.");
        }

        setLocationLoading(false);
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  /* ---------------- START SHIFT ---------------- */

  function handleStartShift() {
    setError("");

    if (!navigator.geolocation) {
      setError("Location services are not supported on this device.");
      return;
    }

    setLoading(true);

    // Get a fresh location when actually starting the shift
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          const res = await apiFetch("/api/shifts/start", {
            method: "POST",
            body: JSON.stringify({
              latitude,
              longitude,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || "Failed to start shift");
          }

          onShiftStarted(data.shift);
        } catch (err) {
          console.error("Start shift error:", err);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },

      () => {
        setError("Unable to get your current location.");
        setLoading(false);
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  return (
    <div className="shift-page">
      <h2>Start Your Shift</h2>

      <p>
        Confirm your current location before starting your shift.
      </p>

      {/* CURRENT LOCATION MAP */}

      {locationLoading && (
        <div>Getting your current location...</div>
      )}

      {location && (
  <div
    className="shift-location-map"
    style={{ marginBottom: "20px" }}
  >
    <Map
      center={{
        lat: Number(location.latitude),
        lng: Number(location.longitude),
      }}
      markers={[
        {
          id: "technician-location",
          lat: location.latitude,
          lng: location.longitude,
          title: "Your current location",
        },
      ]}
      zoom={17}
    />
  </div>
)}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <button
        className="visit-start-btn"
        onClick={handleStartShift}
        disabled={loading || !location}
      >
        {loading ? "Starting Shift..." : "Start Shift"}
      </button>
    </div>
  );
}
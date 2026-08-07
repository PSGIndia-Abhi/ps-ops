import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import useMe from "../hooks/useMe";
import NotificationsMenu from "../components/NotificationsMenu";
import UserMenu from "../components/UserMenu";
import ShiftPage from "../pages/ShiftPage";
import { apiFetch } from "../api";

export default function TechnicianLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();

  /* ---------------- SHIFT STATE ---------------- */

  const [shift, setShift] = useState(null);
  const [activeVisit, setActiveVisit] = useState(null);
  const [checkingShift, setCheckingShift] = useState(true);

  useEffect(() => {
    checkCurrentShift();
  }, []);

  async function checkCurrentShift() {
    try {
      const res = await apiFetch("/api/shifts/current");

      if (!res.ok) {
        throw new Error("Failed to check current shift");
      }

      const data = await res.json();

      if (data.active) {
        setShift(data.shift);
        setActiveVisit(data.activeVisit || null);
      } else {
        setShift(null);
        setActiveVisit(null);
      }
    } catch (err) {
      console.error("Shift check failed:", err);
      setShift(null);
      setActiveVisit(null);
    } finally {
      setCheckingShift(false);
    }
  }

  //end shift
  async function handleEndShift() {
    if (!navigator.geolocation) {
      alert("Location services are not supported on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          const res = await apiFetch("/api/shifts/end", {
            method: "POST",
            body: JSON.stringify({
              latitude,
              longitude,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || "Failed to end shift");
          }

          // This immediately switches the layout back to ShiftPage
          setShift(null);
          setActiveVisit(null);

        } catch (err) {
          console.error("End shift error:", err);
          alert(err.message);
        }
      },

      (geoError) => {
        console.error("Location error:", geoError);
        alert("Current location is required to end your shift.");
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }


  /* ---------------- MOBILE DETECTION ---------------- */

  const [isMobile, setIsMobile] = useState(
    window.innerWidth <= 768
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  /* ---------------- NAVIGATION ---------------- */

  const isJobsActive =
    location.pathname === "/technician" ||
    location.pathname.startsWith("/technician/jobs");

  const setTab = (tab) => {
    const params = new URLSearchParams(location.search);

    params.set("tab", tab);

    navigate(`/technician?${params.toString()}`);
  };

  async function logout() {
    // No active shift — logout normally
    if (!shift) {
      performLogout();
      return;
    }

    const confirmed = window.confirm(
      "Your shift is still active. Logging out will automatically end your shift. Do you want to continue?"
    );

    if (!confirmed) {
      return;
    }

    if (!navigator.geolocation) {
      alert(
        "Your current location is required to end your shift before logging out."
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          const res = await apiFetch("/api/shifts/end", {
            method: "POST",
            body: JSON.stringify({
              latitude,
              longitude,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(
              data.error || "Failed to end shift"
            );
          }

          setShift(null);
          setActiveVisit(null);

          performLogout();
        } catch (err) {
          console.error("Logout shift end error:", err);

          alert(
            "Your shift could not be ended. Please try again."
          );
        }
      },

      (geoError) => {
        console.error("Location error:", geoError);

        alert(
          "Your current location is required to end your shift before logging out."
        );
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  function performLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");

    navigate("/login");
  }

  //---------------- Shift Current LOCATION with continous update ---------------- */

  useEffect(() => {
    if (!shift || !activeVisit) return;

    if (!navigator.geolocation) {
      console.error("Geolocation is not supported");
      return;
    }

    let lastSentAt = 0;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();

        // Send maximum once every 30 seconds
        if (now - lastSentAt < 30000) {
          return;
        }



        const {
          latitude,
          longitude,
          accuracy,
        } = position.coords;

        try {
          const res = await apiFetch("/api/shifts/location", {
            method: "POST",
            body: JSON.stringify({
              latitude,
              longitude,
              accuracy,
            }),
          });

          if (!res.ok) {
            throw new Error("Failed to update location");
          }

          // Only throttle after successful update
          lastSentAt = now;

          console.log("Location updated:", {
            latitude,
            longitude,
            accuracy,
          });
        } catch (err) {
          console.error("Failed to update technician location:", err);
        }
      },

      (error) => {
        console.error(
          "Location tracking error:",
          error
        );
      },

      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [shift, activeVisit]);

  /* ---------------- LOADING SHIFT ---------------- */

  if (checkingShift) {
    return (
      <div className="app-shell">
        <div className="empty-state">
          Checking shift...
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">

      {/* ---------------- HEADER ---------------- */}

      <header className="app-header">
        <div className="header-left">
          <img
            src={logo}
            alt="BestServe"
            className="logo"
          />

          <span className="header-title">
            Technician Panel
          </span>
        </div>

        <div className="header-right">
          <NotificationsMenu />

          <UserMenu
            user={user}
            onLogout={logout}
            actions={[
              {
                label: "Profile",
                onClick: () => navigate("/technician/profile"),
              },
              ...(shift
                ? [
                  {
                    label: "End Shift",
                    onClick: handleEndShift,
                  },
                ]
                : []),
            ]}
          />
        </div>
      </header>

      {/* ---------------- BODY ---------------- */}

      <div className="app-body">

        {/* DESKTOP SIDEBAR - ONLY DURING ACTIVE SHIFT */}

        {!isMobile && shift && (
          <aside className="sidebar">
            <nav className="nav">
              <button
                className={`nav-btn ${isJobsActive ? "active" : ""
                  }`}
                onClick={() => navigate("/technician")}
              >
                Jobs
              </button>
            </nav>
          </aside>
        )}

        <main className="main-content">

          {/* NO ACTIVE SHIFT */}

          {!shift && (
            <ShiftPage
              onShiftStarted={(newShift) => {
                setShift(newShift);
              }}
            />
          )}

          {/* ACTIVE SHIFT */}

          {shift && (
            <Outlet
              context={{
                shift,
                setShift,
                activeVisit,
                setActiveVisit,
                refreshShift: checkCurrentShift,
              }}
            />
          )}

        </main>
      </div>

      {/* ---------------- MOBILE TAB BAR ---------------- */}

      {isMobile && shift && (
        <div className="mobile-tabbar three-col">

          <button
            onClick={() => setTab("pending")}
            className={
              isJobsActive &&
                (
                  new URLSearchParams(location.search).get("tab") ||
                  "pending"
                ) === "pending"
                ? "active"
                : ""
            }
          >
            Pending
          </button>

          <button
            onClick={() => setTab("today")}
            className={
              new URLSearchParams(
                location.search
              ).get("tab") === "today"
                ? "active"
                : ""
            }
          >
            Today
          </button>

          <button
            onClick={() => setTab("tomorrow")}
            className={
              new URLSearchParams(
                location.search
              ).get("tab") === "tomorrow"
                ? "active"
                : ""
            }
          >
            Tomorrow
          </button>

        </div>
      )}

    </div>
  );
}

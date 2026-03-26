import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateBookingModal from "../components/CreateBookingModal";

export default function ClientDashboard() {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const API = import.meta.env.VITE_API_BASE;

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {

      console.log("CALLING API", API);
      const token = localStorage.getItem("token");

      if (!API) {
        setError("API URL not configured");
        return;
      }

      const res = await fetch(
        `${API}/api/jobs`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!res.ok) {
        throw new Error("Failed to load jobs");
      }

      const data = await res.json();
      setJobs(data || []);

    } catch (err) {
      console.error(err);
      setError("Unable to load services");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 30 }}>Loading services...</div>;
  }

  if (error) {
    return <div style={{ padding: 30, color: "red" }}>{error}</div>;
  }

  return (
    <div style={{ padding: 20 }}>

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>My Services</h2>
          <p style={{ margin: 0, color: "#6b7280" }}>
            Track job progress and updates
          </p>
        </div>

        <button
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            padding: "10px 18px",
            borderRadius: 8,
            cursor: "pointer"
          }}
          onClick={() => setIsCreateOpen(true)}
        >
          + Request Service
        </button>
      </div>

      {/* EMPTY STATE */}
      {jobs.length === 0 && (
        <div
          style={{
            background: "white",
            padding: 30,
            borderRadius: 10
          }}
        >
          No services requested yet.
        </div>
      )}

      {/* JOBS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
          gap: 20
        }}
      >
        {jobs.map(job => {

          const progress = getProgress(job.status);

          

          return (
            <div
              key={job.id}
              style={{
                background: "white",
                padding: 20,
                borderRadius: 12,
                boxShadow: "0 4px 10px rgba(0,0,0,0.05)"
              }}
            >

               {/* TITLE */}
               <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                 <div>
                   <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                     {job.title || job.sub_service || "Service Job"}
                   </h3>
                   <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                     Booking #{job.booking_id || "—"}
                   </div>
                 </div>

                 <span
                   style={{
                     background: "#e0f2fe",
                     color: "#0369a1",
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 12
                  }}
                >
                  {job.status}
                </span>
              </div>

              {/* PROGRESS */}
              <div style={{ marginTop: 15 }}>
                <div
                  style={{
                    height: 8,
                    background: "#e5e7eb",
                    borderRadius: 10
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      background: "#22c55e",
                      borderRadius: 10
                    }}
                  />
                </div>

                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {progress}% completed
                </div>
              </div>

              {/* META */}
              <div style={{ marginTop: 15, fontSize: 14 }}>
                <div>
                  <b>Start:</b>{" "}
                  {job.start_date
                    ? new Date(job.start_date).toDateString()
                    : "Not started"}
                </div>

                <div>
                  <b>Next Visit:</b>{" "}
                  {job.next_visit
                    ? new Date(job.next_visit).toDateString()
                    : "Not scheduled"}
                </div>
              </div>

              {/* SUPERVISOR */}
              <div
                style={{
                  marginTop: 15,
                  padding: 10,
                  background: "#f9fafb",
                  borderRadius: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Supervisor
                  </div>
                  <div>
                    {job.supervisor?.name || job.supervisor_name || "Pending Assignment"}
                  </div>
                </div>

                {(job.supervisor?.phone || job.supervisor_phone) && (
                  <a
                    href={`tel:${job.supervisor?.phone || job.supervisor_phone}`}
                    style={{
                      background: "#16a34a",
                      color: "white",
                      padding: "6px 12px",
                      borderRadius: 6,
                      textDecoration: "none",
                      fontSize: 13
                    }}
                  >
                    Call
                  </a>
                )}
              </div>

              {/* COMMENT */}
              <div style={{ marginTop: 15 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Latest Update
                </div>
                <div>
                  {job.latest_comment || "No updates yet"}
                </div>
              </div>

              {/* ACTIONS */}
              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => navigate(`/client/jobs/${job.id}`)}
                  style={{
                    background: "#111827",
                    color: "white",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13
                  }}
                >
                  View Updates
                </button>
              </div>

            </div>
          );

        })}
      </div>
        {
            isCreateOpen && (
              <CreateBookingModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onCreate={handleCreateBooking}
                supervisors={[]}
                technicians={[]}
              />
            )
          }
    </div>
  );
}

function getProgress(status) {
  switch (status) {
    case "CREATED":
      return 10;
    case "ASSIGNED":
      return 25;
    case "IN_PROGRESS":
      return 60;
    case "VISIT_DONE":
      return 80;
    case "COMPLETED":
      return 100;
    default:
      return 5;
  }
}

async function handleCreateBooking(form) {

  const payload = {
    client: {
      contact_id: localStorage.getItem("contactId"),
      serviceType: form.serviceType,
    },
    subServices: form.subServices,
    address: form.location || null,
    start_date: form.start_date,
    end_date: form.end_date,
    notes: form.notes,
    recurrence: form.recurrence || null
  };

  const token = localStorage.getItem("token");

  const res = await fetch(`${API}/api/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    alert("Booking failed");
    return;
  }

  await res.json();

  setIsCreateOpen(false);
  loadJobs();
}

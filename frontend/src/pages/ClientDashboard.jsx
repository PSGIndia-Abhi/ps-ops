import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { formatDate } from "../utils/date";
import CreateBookingModal from "../components/CreateBookingModal";
import "./clientDashboard.css";





export default function ClientDashboard() {
  const [user, setUser] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [comingSoonMessage, setComingSoonMessage] = useState("");

  const [selectedJobs, setSelectedJobs] = useState([]);
  const [files, setFiles] = useState([]);
  const [priority, setPriority] = useState("low");

  // Load user info on mount

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await apiFetch("/api/auth/me");
        const data = await res.json();
        if (!res?.ok) return;
        setUser(data || null);
      } catch (err) {
        console.error("Failed to load user", err);
      }
    }

    loadUser();
  }, []);

  //load jobs, visits, etc as needed using similar useEffect hooks and store in state

  useEffect(() => {
    async function loadJobs() {
      try {
        const res = await apiFetch("/api/jobs");
        const data = await res.json();
        setJobs(data);
      } catch (err) {
        console.error("Failed to load jobs", err);
      }
    }

    loadJobs();
  }, []);

  function closeModal() {
    setShowComplaintModal(false);
    setSubject("");
    setMessage("");
    setPriority("low");
    setSelectedJobs([]);
    setFiles([]);
  }

  //load visits 

  const [nextVisit, setNextVisit] = useState(null);

  useEffect(() => {
    async function loadNextVisit() {
      try {
        const res = await apiFetch("/api/visits/client/upcoming");
        const data = await res.json();
        setNextVisit(data);
      } catch (err) {
        console.error(err);
      }
    }

    loadNextVisit();
  }, []);

  // Compute analytics
  const [jobs, setJobs] = useState([]);
  const total = jobs.length;

  const active = jobs.filter(j =>
    ["IN_PROGRESS", "NOT_STARTED"].includes(j.status)
  ).length;

  const completed = jobs.filter(j =>
    j.status === "COMPLETED"
  ).length;

  const nextJob = jobs
    .filter(j => j.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];


  // tickes 
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateTicket() {
    try {
      setLoading(true);

      const res = await apiFetch("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          job_ids: selectedJobs,
          subject,
          message,
          priority,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      alert("Complaint submitted");
      closeModal();

    } catch (err) {
      console.error(err);
      alert("Failed to submit complaint");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBooking(form) {
    const payload = {
      client: {
        contact_id: form.contact_id,
        serviceType: form.serviceType,
      },
      subServices: form.subServices,
      address: form.location || null,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes,
      recurrence: form.recurrence || null,
      supervisor_id: null,
      technician_id: null,
    };

    const res = await apiFetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res?.ok) {
      const t = await res.text();
      console.error("Create booking failed:", t);
      throw new Error("Create booking failed");
    }

    await res.json();
    const jobsRes = await apiFetch("/api/jobs");
    if (jobsRes?.ok) {
      const data = await jobsRes.json();
      setJobs(Array.isArray(data) ? data : []);
    }
    setIsCreateOpen(false);
  }

  function showComingSoon(label = "Coming soon") {
    setComingSoonMessage(label);
    setShowComingSoonModal(true);
  }

  const displayName =
    user?.company_name ||
    jobs?.[0]?.companyname ||
    user?.contact_name ||
    user?.name ||
    "Client";

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join("");



  return (
    <div className="dashboard">

      {/* TOP */}
      <div className="top">

        <div>
          Hi! {user?.name}, Welcome to your Dashboard

        </div>

      </div>

      <div className="layout">

        {/* LEFT CONTENT */}
        <div className="left">

          {/* ANALYTICS */}
          <div className="section">
            <h3 className="section-title">Overview</h3>

            <div className="analytics">
              <div className="tile">
                <h3>{total}</h3>
                <p>Total Jobs</p>
              </div>

              <div className="tile">
                <h3>{active}</h3>
                <p>Active Jobs</p>
              </div>

              <div className="tile">
                <h3>{completed}</h3>
                <p>Completed</p>
              </div>

              <div className="tile highlight">
                <h3>
                  {nextVisit
                    ? formatDate(nextVisit.scheduled_date)
                    : "-"}
                </h3>

                <p>Next Visit</p>

                <small>{nextVisit?.title || "-"}</small>
              </div>
            </div>
          </div>

          {/* ONGOING */}
          <div className="section">
            <h3 className="section-title">Ongoing Jobs</h3>

            {jobs
              .filter(j => j.status !== "COMPLETED")
              .slice(0, 3)
              .map(job => (
                <div key={job.id} className="job">
                  <div className="job-top">
                    <b>{job.title}</b>
                    <span className="status">{job.status}</span>
                  </div>

                  <div className="progress">
                    <div
                      className="bar"
                      style={{
                        width:
                          job.status === "COMPLETED"
                            ? "100%"
                            : job.status === "IN_PROGRESS"
                              ? "60%"
                              : "20%",
                      }}
                    />
                  </div>

                  <p className="update">
                    Latest: {job.latest_comment || "No updates"}
                  </p>
                </div>
              ))}
          </div>

          {/* RECENT UPDATES */}


        </div>

        {/* RIGHT PANEL */}
        <div className="right">

          <div className="panel">

            {/* CLIENT LOGO */}
            {user?.company_logo_url ? (
              <img
                src={user.company_logo_url}
                className="client-logo"
              />
            ) : (
              <div className="client-logo-placeholder">{initials}</div>
            )}

            {/* CLIENT DP */}

            <h3>{displayName}</h3>

            {/* ACTIONS */}
            <div className="panel-actions">
              <button className="primary" onClick={() => setIsCreateOpen(true)}>
                + Request Service
              </button>
              <button onClick={() => setShowComplaintModal(true)}>
                Raise Complaint
              </button>
              <button onClick={() => showComingSoon("Feedback is coming soon")}>
                Give Feedback
              </button>
              <button onClick={() => showComingSoon("Certificates are coming soon")}>
                Download Certificates
              </button>
              <button className="msds" onClick={() => showComingSoon("MSDS sheet is coming soon")}>
                MSDS Sheet
              </button>
            </div>


            {/* INVOICE */}
            <div className="invoice">
              <h4>Invoices</h4>
              <p>Comming Soon</p>

            </div>
            <button onClick={() => showComingSoon("Invoices are coming soon")}>
              View All Invoices (coming soon)
            </button>

          </div>

        </div>

      </div>

      {/* COMPLAINT MODAL */}
      {showComplaintModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Raise Complaint</h3>

            {/* SUBJECT */}
            <input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />

            {/* MESSAGE */}
            <textarea
              placeholder="Describe the issue"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            {/* PRIORITY */}
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            {/* JOB SELECTION */}
            <div style={{ marginTop: 10 }}>
              <b>Select Jobs (optional)</b>

              {jobs.length === 0 && <div>No jobs available</div>}

              <div className="job-list">
                {jobs.map((job) => {
                  const isSelected = selectedJobs.includes(job.id);
                  return (
                    <button
                      key={job.id}
                      type="button"
                      className={`job-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedJobs(prev => prev.filter(id => id !== job.id));
                        } else {
                          setSelectedJobs(prev => [...prev, job.id]);
                        }
                      }}
                    >
                      <span className="job-title">{job.title || job.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FILE UPLOAD */}
            <div style={{ marginTop: 10 }}>
              <b>Attachments</b>

              <input
                type="file"
                multiple
                onChange={(e) => setFiles([...e.target.files])}
              />

              {files.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {files.map((file, i) => (
                    <div key={i}>{file.name}</div>
                  ))}
                </div>
              )}
            </div>

            {/* ACTIONS */}
            <div className="modal-actions">
              <button onClick={closeModal}>Cancel</button>

              <button
                className="primary"
                onClick={handleCreateTicket}
                disabled={loading}
              >
                {loading ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showComingSoonModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Coming Soon</h3>
            <p>{comingSoonMessage}</p>
            <div className="modal-actions">
              <button onClick={() => setShowComingSoonModal(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

      <CreateBookingModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateBooking}
        supervisors={[]}
        technicians={[]}
        clientContact={
          user?.contact_id
            ? {
                id: user.contact_id,
                name: user.contact_name || user.name,
                company_id: user.site_id || null,
                company_name: user.company_name || null,
                company_site: user.company_site || null,
              }
            : null
        }
      />

    </div>
  );
}


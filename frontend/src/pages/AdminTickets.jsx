import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { formatDate, formatDateTime } from "../utils/date";

export default function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [jobQuery, setJobQuery] = useState("");

  // create ticket state
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("low");
  const [selectedJobs, setSelectedJobs] = useState([]);

  useEffect(() => {
    loadTickets();
    loadJobs();
  }, []);

  useEffect(() => {
    if (tickets.length === 0) return;
    if (!tickets.find((t) => t.id === activeTicketId)) {
      setActiveTicketId(tickets[0].id);
    }
  }, [tickets, activeTicketId]);

  async function loadTickets() {
    try {
      const res = await apiFetch("/api/tickets");
      const data = await res.json();
      setTickets(data || []);
      if (data?.length && !activeTicketId) {
        setActiveTicketId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load tickets", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadJobs() {
    try {
      const res = await apiFetch("/api/jobs");
      const data = await res.json();
      setJobs(data || []);
    } catch (err) {
      console.error("Failed to load jobs", err);
    }
  }

  async function handleCreateTicket() {
    try {
      const res = await apiFetch("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject,
          message,
          priority,
          job_ids: selectedJobs,
        }),
      });

      if (!res.ok) throw new Error("Failed to create ticket");

      // reset
      setSubject("");
      setMessage("");
      setPriority("low");
      setSelectedJobs([]);
      setJobQuery("");

      loadTickets();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSendReply() {
    if (!activeTicketId || !replyMessage.trim()) return;
    try {
      setSaving(true);
      const res = await apiFetch(`/api/tickets/${activeTicketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: replyMessage }),
      });
      if (!res.ok) throw new Error("Failed to send reply");
      setReplyMessage("");
      await loadTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(nextStatus) {
    if (!activeTicketId) return;
    try {
      setSaving(true);
      const res = await apiFetch(`/api/tickets/${activeTicketId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      await loadTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Loading...</div>;

  const activeTicket =
    tickets.find((t) => t.id === activeTicketId) || tickets[0];

  const searchTerm = jobQuery.trim().toLowerCase();
  const jobResults = searchTerm.length < 2
    ? []
    : jobs.filter((job) => {
      const title = job.title || "";
      const code = job.code || "";
      const clientName = job.requestedBy?.name || "";
      const company = job.companyname || "";
      const site = job.site || "";
      const startDate = job.start_date
        ? formatDate(job.start_date)
        : "";
      const haystack = [
        title,
        code,
        clientName,
        company,
        site,
        startDate,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm);
    });

  return (
    <div className="tickets-page">
      <h2>Tickets</h2>

      <div className="ticket-create">
        <div className="ticket-create-header">
          <h3>Create Ticket</h3>
          <button className="btn" onClick={handleCreateTicket}>
            Create Ticket
          </button>
        </div>

        <div className="ticket-create-grid">
          <input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <textarea
            placeholder="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />

          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>

          <div>
            <div className="ticket-label">Select Jobs (optional)</div>
            <input
              placeholder="Search by job, client, company, or date"
              value={jobQuery}
              onChange={(e) => setJobQuery(e.target.value)}
            />
            <div className="job-list">
              {searchTerm.length < 2 && (
                <div className="ticket-empty">Type at least 2 characters to search</div>
              )}
              {jobResults.map((job) => {
                const isSelected = selectedJobs.includes(job.id);
                const clientName =
                  job.requestedBy?.name || job.companyname || "Unknown client";
                const startDate = job.start_date
                  ? formatDate(job.start_date)
                  : "No start date";
                return (
                  <button
                    key={job.id}
                    type="button"
                    className={`job-item ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedJobs((prev) =>
                          prev.filter((id) => id !== job.id)
                        );
                      } else {
                        setSelectedJobs((prev) => [...prev, job.id]);
                      }
                    }}
                  >
                    <span className="job-title">{job.title || job.code || job.id}</span>
                    <span className="job-meta">
                      {clientName} · {startDate}
                    </span>
                  </button>
                );
              })}
              {searchTerm.length >= 2 && jobResults.length === 0 && (
                <div className="ticket-empty">No jobs match your search</div>
              )}
              {jobs.length === 0 && (
                <div className="ticket-empty">No jobs available</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="tickets-layout">
        <div className="ticket-list">
          {tickets.length === 0 && <div className="ticket-empty">No tickets found</div>}
          {tickets.map((t) => (
            <button
              key={t.id}
              className={`ticket-list-item ${activeTicket?.id === t.id ? "active" : ""}`}
              onClick={() => setActiveTicketId(t.id)}
              type="button"
            >
              <div className="ticket-list-top">
                <span className="ticket-subject">{t.subject}</span>
                <span className={`status ${t.status}`}>{t.status}</span>
              </div>
              <div className="ticket-list-meta">
                {t.created_by?.name || "Unknown"} ·{" "}
                {formatDate(t.created_at)}
              </div>
              <div className="ticket-list-meta">
                Priority: {t.priority}
              </div>
            </button>
          ))}
        </div>

        <div className="ticket-detail">
          {!activeTicket && <div className="ticket-empty">Select a ticket to view</div>}
          {activeTicket && (
            <>
              <div className="ticket-detail-header">
                <div>
                  <h3>{activeTicket.subject}</h3>
                  <div className="ticket-list-meta">
                    By {activeTicket.created_by?.name || "Unknown"} ·{" "}
                    {formatDateTime(activeTicket.created_at)}
                  </div>
                </div>

                <div className="ticket-status">
                  <select
                    value={activeTicket.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={saving}
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
              </div>

              <div className="ticket-section">
                <div className="ticket-label">Linked Jobs</div>
                <div className="ticket-jobs">
                  {(activeTicket.jobs || []).map((job) => (
                    <div key={job.id} className="ticket-job-chip">
                      {job.title || job.code || job.id}
                    </div>
                  ))}
                  {(activeTicket.jobs || []).length === 0 && (
                    <div className="ticket-empty">No linked jobs</div>
                  )}
                </div>
              </div>

              <div className="ticket-section">
                <div className="ticket-label">Conversation</div>
                <div className="ticket-messages">
                  {(activeTicket.messages || []).map((msg) => (
                    <div key={msg.id} className="ticket-message">
                      <div className="ticket-message-meta">
                        {msg.created_by?.name || "Unknown"} ·{" "}
                        {formatDateTime(msg.created_at)}
                      </div>
                      <div className="ticket-message-text">{msg.message}</div>
                    </div>
                  ))}
                  {(activeTicket.messages || []).length === 0 && (
                    <div className="ticket-empty">No messages yet</div>
                  )}
                </div>
              </div>

              <div className="ticket-reply">
                <textarea
                  placeholder="Write a response..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  rows={3}
                />
                <div className="ticket-reply-actions">
                  <button
                    className="btn primary"
                    onClick={handleSendReply}
                    disabled={saving || !replyMessage.trim()}
                  >
                    {saving ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


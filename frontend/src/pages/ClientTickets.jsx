import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { formatDate, formatDateTime } from "../utils/date";

export default function ClientTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadTickets();
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
      if (!res.ok) {
        setTickets([]);
        setError(data?.error || "Failed to load tickets");
        return;
      }
      setError("");
      setTickets(Array.isArray(data) ? data : []);
      if (data?.length && !activeTicketId) {
        setActiveTicketId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load tickets", err);
      setError("Failed to load tickets");
      setTickets([]);
    } finally {
      setLoading(false);
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

  if (loading) return <div>Loading...</div>;

  const activeTicket =
    tickets.find((t) => t.id === activeTicketId) || tickets[0];

  return (
    <div className="tickets-page">
      <h2>My Tickets</h2>

      <div className="tickets-layout">
        <div className="ticket-list">
          {error && <div className="ticket-empty">{error}</div>}
          {tickets.length === 0 && (
            <div className="ticket-empty">No tickets found</div>
          )}
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
                {formatDate(t.created_at)}  Priority: {t.priority}
              </div>
            </button>
          ))}
        </div>

        <div className="ticket-detail">
          {!activeTicket && (
            <div className="ticket-empty">Select a ticket to view</div>
          )}
          {activeTicket && (
            <>
              <div className="ticket-detail-header">
                <div>
                  <h3>{activeTicket.subject}</h3>
                  <div className="ticket-list-meta">
                    {formatDateTime(activeTicket.created_at)}  Status: {activeTicket.status}
                  </div>
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
                        {msg.created_by?.name || "Unknown"}  {formatDateTime(msg.created_at)}
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


import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../api";
import { useNavigate } from "react-router-dom";
import "./contactspage.css";

export default function SiteContactsPage() {

  const { siteId } = useParams();

  const [inviteLinks, setInviteLinks] = useState({});
  const [contacts, setContacts] = useState([]);
  const token = localStorage.getItem("token");
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE}/api/contacts?site_id=${siteId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.contacts || [];
        setContacts(list);
      });
  }, [siteId]);

  async function handleConvert(contactId) {
    try {
      const res = await fetch(
        `${API_BASE}/api/contacts/${contactId}/invite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await res.json();

      // ✅ handle error properly
      if (!res.ok) {
        alert(data.error || "Failed");
        return;
      }

      setInviteLinks(prev => ({
        ...prev,
        [contactId]: data.inviteLink
      }));

      alert("Invite sent");

      // refresh contacts
      const res2 = await fetch(`${API_BASE}/api/contacts?site_id=${siteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const updated = await res2.json();
      setContacts(Array.isArray(updated) ? updated : updated.contacts || []);

    } catch (err) {
      console.error(err);
      alert("Failed");
    }
  }

  function copyToClipboard(link) {
    navigator.clipboard.writeText(link);
    alert("Link copied");
  }

  function openWhatsApp(link, name) {
    const text = `Hi ${name}, join via this link: ${link}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="page">
      <h2>Site Contacts</h2>

      <button
        onClick={() => navigate(-1)}
        style={{
          marginBottom: 16,
          background: "#f3f4f6",
          border: "none",
          padding: "8px 14px",
          borderRadius: 8,
          cursor: "pointer"
        }}
      >
        ← Back
      </button>

      <div className="contacts-container">
        {Array.isArray(contacts) && contacts.map(c => (
          <div key={c.id} className="contact-card">

            <div className="contact-name">{c.name}</div>
            <div className="contact-role">{c.role || "Contact"}</div>

            <div className="contact-info">
              <div>📞 {c.phone}</div>
              {c.email && <div>✉ {c.email}</div>}
            </div>

            {c.is_primary === 1 && (
              <div className="contact-primary">
                Primary Contact
              </div>
            )}

            <div className="contact-actions">

              {/* ✅ No user yet */}
              {!c.user_id && (
                <button
                  className="primary"
                  onClick={() => handleConvert(c.id)}
                >
                  Invite User
                </button>
              )}

              {/* ✅ Invited */}
              {c.user_id && c.invite_status === "INVITED" && (
                <button
                  className="convert-btn"
                  onClick={() => handleConvert(c.id)}
                >
                  Resend Invite
                </button>
              )}

              {/* ✅ Active */}
              {c.user_id && c.invite_status === "ACTIVE" && (
                <button className="convert-btn disabled" disabled>
                  User Created
                </button>
              )}

              {/* ✅ Share options */}
              {inviteLinks[c.id] && (
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button onClick={() => copyToClipboard(inviteLinks[c.id])}>
                    Copy Link
                  </button>

                  <button onClick={() => openWhatsApp(inviteLinks[c.id], c.name)}>
                    WhatsApp
                  </button>
                </div>
              )}

            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
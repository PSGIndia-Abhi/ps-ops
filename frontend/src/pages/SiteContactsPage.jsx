import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../api";
import { useNavigate } from "react-router-dom";
import "./contactspage.css";

export default function SiteContactsPage() {

    const { siteId } = useParams();


    const [contacts, setContacts] = useState([]);
    const token = localStorage.getItem("token");
    const navigate = useNavigate();
    useEffect(() => {
        fetch(`${API_BASE}/api/contacts?site_id=${siteId}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(setContacts);
    }, [siteId]);



async function handleConvert(contactId) {



  try {

    const token = localStorage.getItem("token");

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

   

    alert("Invite link generated. Check console.");

  } catch (err) {
    console.error(err);
    alert("Failed");
  }
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
                {contacts.map(c => (
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
                            {!c.user_status && (
                                <button
                                    className="primary"
                                    onClick={() => handleConvert(c.id)}
                                >
                                    Convert to User
                                </button>
                            )}

                            {c.user_status === "INVITE_SENT" && (
                                <button className="convert-btn">
                                    Resend Invite
                                </button>
                            )}

                            {c.user_status === "ACTIVE" && (
                                <button className="convert-btn disabled">
                                    User Active
                                </button>
                            )}
                        </div>

                    </div>
                ))}
            </div>
        </div>
    );
}
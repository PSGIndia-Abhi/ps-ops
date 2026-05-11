import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { useNavigate, useParams } from "react-router-dom";
import "./contactspage.css";
import CreateContactModal from "../components/CreateContactModal";

export default function ContactsPage() {
    const [contacts, setContacts] = useState([]);
    const [editingContact, setEditingContact] = useState(null);
    const [companies, setCompanies] = useState([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const token = localStorage.getItem("token");
    const navigate = useNavigate();
    const { contactId } = useParams();

    // ✅ fetch all contacts and companies
    useEffect(() => {
        const loadData = async () => {
            const res = await fetch(`${API_BASE}/api/contacts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.contacts || [];
            setContacts(list);

            const res2 = await fetch(`${API_BASE}/api/sites`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data2 = await res2.json();
            setCompanies(Array.isArray(data2) ? data2 : []);
        };
        loadData();
    }, [token]);

    // ✅ fetch single contact (edit mode)
    useEffect(() => {
        if (!contactId) {
            setEditingContact(null);
            return;
        }

        fetch(`${API_BASE}/api/contacts/${contactId}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => setEditingContact(data));
    }, [contactId, token]);

    async function handleDelete(id) {
        const confirmDelete = window.confirm("Archive this contact?");
        if (!confirmDelete) return;

        try {
            const res = await fetch(`${API_BASE}/api/contacts/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) return alert("Failed");

            setContacts(prev => prev.filter(c => c.id !== id));
        } catch (err) {
            console.error(err);
            alert("Error");
        }
    }

    async function handleSave() {
        await fetch(`${API_BASE}/api/contacts/${contactId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(editingContact)
        });

        alert("Saved");

        // refresh list
        navigate("/admin/contacts");
    }

    return (
        <div className="page">
            <h2>Contacts</h2>
            <button onClick={() => setIsCreateModalOpen(true)}>Add Contact</button>

           

                {/* LEFT: LIST */}
                <div className="contacts-container">
                    {contacts.map(c => (
                        <div key={c.id}>

                            {/* CONTACT CARD */}
                            <div className="contact-card">
                                <div className="contact-name">{c.name}</div>
                                <div className="contact-role">{c.role || "Contact"}</div>

                                <div className="contact-info">
                                    <div>📞 {c.phone}</div>
                                    {c.email && <div>✉ {c.email}</div>}
                                </div>

                                <div className="contact-actions">
                                    <button
                                        className="primary"
                                        onClick={() => navigate(`/admin/contacts/${c.id}`)}
                                    >
                                        Edit
                                    </button>

                                    <button
                                        className="danger"
                                        onClick={() => handleDelete(c.id)}
                                    >
                                        Archive
                                    </button>
                                </div>
                            </div>

                            {/* ✅ EDIT PANEL JUST BELOW SELECTED CARD */}
                            {contactId === c.id && editingContact && (
                                <div className="edit-panel">

                                    <h3>Edit Contact</h3>

                                    <input
                                        value={editingContact.name || ""}
                                        onChange={e =>
                                            setEditingContact({ ...editingContact, name: e.target.value })
                                        }
                                    />

                                    <input
                                        value={editingContact.phone || ""}
                                        onChange={e =>
                                            setEditingContact({ ...editingContact, phone: e.target.value })
                                        }
                                    />

                                    <input
                                        value={editingContact.email || ""}
                                        onChange={e =>
                                            setEditingContact({ ...editingContact, email: e.target.value })
                                        }
                                    />

                                    <div className="edit-actions">
                                        <button className="save" onClick={handleSave}>Save</button>
                                        <button onClick={() => navigate("/admin/contacts")}>
                                            Cancel
                                        </button>
                                    </div>

                                </div>
                            )}
                        </div>
                    ))}
                </div>

            {isCreateModalOpen && (
                <CreateContactModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreated={(newContact) => {
                        // refresh contacts
                        fetch(`${API_BASE}/api/contacts`, {
                            headers: { Authorization: `Bearer ${token}` }
                        })
                            .then(res => res.json())
                            .then(data => {
                                const list = Array.isArray(data) ? data : data.contacts || [];
                                setContacts(list);
                            });
                        setIsCreateModalOpen(false);
                    }}
                    companies={companies}
                />
            )}
            
        </div>
    );
}
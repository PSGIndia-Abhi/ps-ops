import { useState, useEffect } from "react";
import { apiFetch } from "../api";
import useMe from "../hooks/useMe";

export default function ClientProfilePage() {
  const { user: me } = useMe();
  const [user, setUser] = useState(null);

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

  const accountManager = user?.branch_admin || null;
  const accountManagerName = accountManager?.name || "Account Manager";
  const accountManagerEmail = accountManager?.email;
  const accountManagerPhone = accountManager?.phone;
  const branchName = user?.branch?.name || user?.branch_name || "Not assigned";

  return (
    <div style={{ padding: 20 }}>
      <h2>Profile</h2>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Your account information and contact details
      </p>

      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* ACCOUNT MANAGER SECTION */}
        <div style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 20,
          marginBottom: 20
        }}>
          <h3 style={{ marginBottom: 16 }}>Account Manager</h3>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "#2563eb",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0
            }}>
              AM
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                {accountManagerName}
              </div>
              <div style={{
                fontSize: 14,
                color: accountManager ? "#16a34a" : "#dc2626",
                fontWeight: 600,
                marginBottom: 4
              }}>
                {accountManager ? "Assigned" : "Unassigned"}
              </div>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 4 }}>
                {branchName}
              </div>
              {accountManagerPhone && (
                <div style={{ fontSize: 14, color: "#374151" }}>
                  {accountManagerPhone}
                </div>
              )}
            </div>
          </div>

          {accountManager && (
            <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
              <button
                onClick={() => accountManagerPhone && (window.location.href = `tel:${accountManagerPhone}`)}
                disabled={!accountManagerPhone}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  cursor: accountManagerPhone ? "pointer" : "not-allowed",
                  opacity: accountManagerPhone ? 1 : 0.5
                }}
              >
                Call
              </button>
              <button
                onClick={() => accountManagerEmail && (window.location.href = `mailto:${accountManagerEmail}`)}
                disabled={!accountManagerEmail}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  cursor: accountManagerEmail ? "pointer" : "not-allowed",
                  opacity: accountManagerEmail ? 1 : 0.5
                }}
              >
                Email
              </button>
            </div>
          )}
        </div>

        {/* BRANCH INFO */}
        <div style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 20,
          marginBottom: 20
        }}>
          <h3 style={{ marginBottom: 16 }}>Branch Information</h3>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {branchName}
          </div>
        </div>

        {/* USER INFO */}
        <div style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 20
        }}>
          <h3 style={{ marginBottom: 16 }}>Account Details</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Name</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{user?.name || "N/A"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Email</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{user?.email || "N/A"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Company</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{user?.company_name || "N/A"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
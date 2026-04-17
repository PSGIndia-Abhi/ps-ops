import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import "./ProfilePage.css";

function formatRole(role) {
  if (!role) return "User";
  return String(role)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatJoinedOn(value) {
  if (!value) return "Unknown";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  async function loadProfile() {
    try {
      setLoading(true);
      const res = await apiFetch("/api/auth/me");
      const data = await res.json();
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to load profile");
      }

      setProfile(data);
      setForm({
        name: data?.name || "",
        email: data?.email || "",
        phone: data?.phone || "",
      });
      setError("");
    } catch (err) {
      console.error("Profile load failed:", err);
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const branchName = useMemo(
    () => profile?.branch?.name || profile?.branch_name || "Not assigned",
    [profile]
  );

  async function handleSaveProfile(event) {
    event.preventDefault();
    setProfileMessage("");
    setPasswordMessage("");
    setError("");

    try {
      setSavingProfile(true);
      const res = await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to update profile");
      }

      setProfileMessage("Profile updated successfully.");
      await loadProfile();
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err) {
      console.error("Profile save failed:", err);
      setError(err.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    setPasswordMessage("");
    setProfileMessage("");
    setError("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      setSavingPassword(true);
      const res = await apiFetch("/api/auth/me/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to update password");
      }

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordMessage("Password updated successfully.");
    } catch (err) {
      console.error("Password update failed:", err);
      setError(err.message || "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return <div className="profile-page">Loading profile...</div>;
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h2>My Profile</h2>
        <p>Manage your account details, contact information, and password.</p>
      </div>

      {error && <div className="profile-alert error">{error}</div>}
      {profileMessage && <div className="profile-alert success">{profileMessage}</div>}
      {passwordMessage && <div className="profile-alert success">{passwordMessage}</div>}

      <div className="profile-grid">
        <section className="profile-card">
          <div className="profile-card-title">Account Overview</div>
          <div className="profile-summary">
            <div className="profile-avatar">
              {(profile?.name || "U").trim().charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="profile-name">{profile?.name || "User"}</div>
              <div className="profile-role">{formatRole(profile?.role)}</div>
            </div>
          </div>

          <div className="profile-facts">
            <div className="profile-fact">
              <span>Joined on</span>
              <strong>{formatJoinedOn(profile?.created_at)}</strong>
            </div>
            <div className="profile-fact">
              <span>Branch</span>
              <strong>{branchName}</strong>
            </div>
            <div className="profile-fact">
              <span>Email</span>
              <strong>{profile?.email || "Not set"}</strong>
            </div>
            <div className="profile-fact">
              <span>Phone</span>
              <strong>{profile?.phone || "Not set"}</strong>
            </div>
          </div>
        </section>

        {profile?.role === "client" && (
          <section className="profile-card">
            <div className="profile-card-title">Account Manager</div>
            <div className="profile-contact-name">
              {profile?.branch_admin?.name || "Not assigned"}
            </div>
            <div className="profile-contact-meta">
              {profile?.branch_admin ? "Assigned to your branch" : "No account manager assigned"}
            </div>
            <div className="profile-facts compact">
              <div className="profile-fact">
                <span>Email</span>
                <strong>{profile?.branch_admin?.email || "Not available"}</strong>
              </div>
              <div className="profile-fact">
                <span>Phone</span>
                <strong>{profile?.branch_admin?.phone || "Not available"}</strong>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="profile-grid">
        <section className="profile-card">
          <div className="profile-card-title">Contact Details</div>
          <form className="profile-form" onSubmit={handleSaveProfile}>
            <label className="profile-field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Your name"
              />
            </label>

            <label className="profile-field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="you@example.com"
              />
            </label>

            <label className="profile-field">
              <span>Phone</span>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="Phone number"
              />
            </label>

            <div className="profile-actions">
              <button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save Details"}
              </button>
            </div>
          </form>
        </section>

        <section className="profile-card">
          <div className="profile-card-title">Security</div>
          <form className="profile-form" onSubmit={handleChangePassword}>
            <label className="profile-field">
              <span>Current Password</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    currentPassword: event.target.value,
                  }))
                }
                placeholder="Current password"
              />
            </label>

            <label className="profile-field">
              <span>New Password</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    newPassword: event.target.value,
                  }))
                }
                placeholder="New password"
              />
            </label>

            <label className="profile-field">
              <span>Confirm New Password</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    confirmPassword: event.target.value,
                  }))
                }
                placeholder="Confirm new password"
              />
            </label>

            <div className="profile-actions">
              <button type="submit" disabled={savingPassword}>
                {savingPassword ? "Updating..." : "Change Password"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

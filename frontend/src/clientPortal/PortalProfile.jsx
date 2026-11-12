import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  HiOutlineUser, HiOutlinePhone, HiOutlineEnvelope, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeSlash,
  HiOutlineBuildingOffice2, HiOutlineMapPin, HiOutlineCheckCircle, HiOutlineShieldCheck, HiOutlineCalendarDays,
  HiOutlineXMark, HiOutlineLifebuoy,
} from "react-icons/hi2";
import { apiFetch, safeJson } from "../api";
import CompanyAvatar from "../pages/clientAccounts/CompanyAvatar";
import { initialsOf } from "../pages/clientAccounts/avatarUtils";
import { formatDate, SUPPORT_CONTACT } from "./portalUtils";

// Client profile: personal details, access overview and password. Uses the same
// /api/auth/me endpoints as the staff profile page.

function PasswordInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="cp-input-icon">
      <HiOutlineLockClosed aria-hidden="true" />
      <input type={show ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" className="cp-input-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
      </button>
    </div>
  );
}

function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return [
    { label: "Too short", tone: "weak" },
    { label: "Weak", tone: "weak" },
    { label: "Fair", tone: "fair" },
    { label: "Good", tone: "good" },
    { label: "Strong", tone: "strong" },
  ][pw.length < 6 ? 0 : Math.max(1, score)];
}

export default function PortalProfile() {
  const { portal } = useOutletContext();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'ok'|'error', text }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/me");
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Could not load your profile");
      setProfile(data);
      setForm({ name: data?.name || "", phone: data?.phone || "" });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = profile && (form.name.trim() !== (profile.name || "") || form.phone.trim() !== (profile.phone || ""));

  async function saveProfile(e) {
    e.preventDefault();
    if (!form.name.trim()) return setNotice({ type: "error", text: "Please enter your name." });
    setSavingProfile(true);
    setNotice(null);
    try {
      const res = await apiFetch("/api/auth/me", {
        method: "PATCH",
        // Email is the sign-in ID; it is sent unchanged.
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), email: profile.email }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Could not save your details");
      setNotice({ type: "ok", text: "Your details were saved." });
      await load();
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (!pw.current || !pw.next) return setNotice({ type: "error", text: "Fill in your current and new password." });
    if (pw.next.length < 6) return setNotice({ type: "error", text: "The new password must be at least 6 characters." });
    if (pw.next !== pw.confirm) return setNotice({ type: "error", text: "The new passwords don’t match." });
    setSavingPw(true);
    setNotice(null);
    try {
      const res = await apiFetch("/api/auth/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Could not change your password");
      setPw({ current: "", next: "", confirm: "" });
      setNotice({ type: "ok", text: "Password changed. Use the new password next time you sign in." });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingPw(false);
    }
  }

  const company = portal?.companies?.[0];
  const companyName = String(company?.display_name || company?.name || "").trim();
  const isCompanyAdmin = portal?.access === "company";
  const st = strength(pw.next);

  if (loading && !profile) {
    return (
      <div className="cp-page">
        <div className="cp-card cp-skeleton" style={{ minHeight: 180 }} />
        <div className="cp-card cp-skeleton" style={{ minHeight: 320 }} />
      </div>
    );
  }

  return (
    <div className="cp-page cp-profile">
      {/* Identity header */}
      <section className="cp-profile-hero">
        <div className="cp-profile-cover" aria-hidden="true" />
        <div className="cp-profile-id">
          <span className="cp-profile-avatar">{initialsOf(profile?.name || "")}</span>
          <div className="cp-profile-who">
            <h2>{profile?.name || "Your profile"}</h2>
            <p><HiOutlineEnvelope aria-hidden="true" /> {profile?.email}</p>
            <div className="cp-profile-chips">
              <span className="chip-role"><HiOutlineShieldCheck aria-hidden="true" /> {isCompanyAdmin ? "Company admin" : "Outlet user"}</span>
              {companyName && <span><HiOutlineBuildingOffice2 aria-hidden="true" /> {companyName}</span>}
              {profile?.created_at && <span><HiOutlineCalendarDays aria-hidden="true" /> Member since {formatDate(profile.created_at, { month: "short", year: "numeric" })}</span>}
            </div>
          </div>
        </div>
      </section>

      {notice && (
        <div className={`cp-notice ${notice.type === "ok" ? "ok" : "warn"}`} role="status">
          <span>{notice.type === "ok" && <HiOutlineCheckCircle aria-hidden="true" />} {notice.text}</span>
          <button className="cp-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss"><HiOutlineXMark /></button>
        </div>
      )}

      <div className="cp-profile-grid">
        <div className="cp-profile-col">
          <form className="cp-card cp-profile-card" onSubmit={saveProfile}>
            <header className="cp-card-head">
              <div><h3>Personal details</h3><small>How our team will address and reach you</small></div>
            </header>
            <label className="cp-field">Full name
              <div className="cp-input-icon">
                <HiOutlineUser aria-hidden="true" />
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoComplete="name" />
              </div>
            </label>
            <label className="cp-field">Mobile number
              <div className="cp-input-icon">
                <HiOutlinePhone aria-hidden="true" />
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Add a mobile number" inputMode="tel" autoComplete="tel" />
              </div>
            </label>
            <div className="cp-field">Sign-in email
              <div className="cp-input-icon is-readonly">
                <HiOutlineEnvelope aria-hidden="true" />
                <input value={profile?.email || ""} readOnly aria-readonly="true" />
                <HiOutlineLockClosed className="cp-input-lock" aria-hidden="true" />
              </div>
              <small className="cp-hint">To change your sign-in email, contact BestServe support.</small>
            </div>
            <div className="cp-form-foot">
              {dirty && <button type="button" className="cp-btn cp-btn-ghost" onClick={() => setForm({ name: profile.name || "", phone: profile.phone || "" })}>Discard</button>}
              <button type="submit" className="cp-btn" disabled={savingProfile || !dirty}>{savingProfile ? "Saving…" : "Save changes"}</button>
            </div>
          </form>

          <form className="cp-card cp-profile-card" onSubmit={changePassword}>
            <header className="cp-card-head">
              <div><h3>Password</h3><small>Use at least 6 characters; longer with numbers and symbols is safer</small></div>
            </header>
            <label className="cp-field">Current password
              <PasswordInput value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} placeholder="Enter current password" autoComplete="current-password" />
            </label>
            <div className="cp-form-row">
              <label className="cp-field">New password
                <PasswordInput value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder="New password" autoComplete="new-password" />
              </label>
              <label className="cp-field">Confirm new password
                <PasswordInput value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} placeholder="Repeat new password" autoComplete="new-password" />
              </label>
            </div>
            {pw.next && (
              <div className={`cp-strength s-${st.tone}`}>
                <span className="cp-strength-bar"><i /><i /><i /><i /></span>
                <small>{st.label}{pw.confirm && pw.confirm !== pw.next ? " · passwords don’t match" : ""}</small>
              </div>
            )}
            <div className="cp-form-foot">
              <button type="submit" className="cp-btn" disabled={savingPw}>{savingPw ? "Updating…" : "Update password"}</button>
            </div>
          </form>
        </div>

        <div className="cp-profile-col">
          <section className="cp-card cp-profile-card">
            <header className="cp-card-head">
              <div><h3>Your access</h3><small>{isCompanyAdmin ? "You can see every outlet of your company" : "You can see these outlets"}</small></div>
            </header>
            <div className="cp-access-company">
              <CompanyAvatar name={companyName} size={44} />
              <div>
                <strong>{companyName || "—"}</strong>
                <small>{portal.outlets.length} outlet{portal.outlets.length === 1 ? "" : "s"}</small>
              </div>
            </div>
            <ul className="cp-access-outlets">
              {portal.outlets.map((o) => (
                <li key={o.id}>
                  <span className="cp-cell-icon"><HiOutlineMapPin aria-hidden="true" /></span>
                  <span><strong>{o.name || o.id}</strong>{o.city && <small>{o.city}</small>}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="cp-card cp-profile-card cp-help-card">
            <span className="cp-help-icon"><HiOutlineLifebuoy aria-hidden="true" /></span>
            <h3>Need help?</h3>
            <p>Our support team can update your access, outlets or sign-in email.</p>
            <a href={`mailto:${SUPPORT_CONTACT.email}`}><HiOutlineEnvelope aria-hidden="true" /> {SUPPORT_CONTACT.email}</a>
            <a href={`tel:${SUPPORT_CONTACT.phone}`}><HiOutlinePhone aria-hidden="true" /> {SUPPORT_CONTACT.phoneDisplay}</a>
          </section>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  HiOutlineUser, HiOutlinePhone, HiOutlineEnvelope, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeSlash,
  HiOutlineBuildingOffice2, HiOutlineMapPin, HiOutlineCheckCircle, HiOutlineShieldCheck, HiOutlineCalendarDays,
  HiOutlineXMark, HiOutlineChevronRight, HiOutlineCheck,
  HiOutlineSparkles, HiOutlineChatBubbleLeftRight, HiOutlineFolderOpen, HiOutlineClipboardDocumentList,
} from "react-icons/hi2";

// Shortcut tiles in the side column.
const QUICK_ACTIONS = [
  { label: "Request a service", to: "/client/request-service", tone: "blue", Icon: HiOutlineSparkles },
  { label: "Raise a complaint", to: "/client/complaints?new=1", tone: "orange", Icon: HiOutlineChatBubbleLeftRight },
  { label: "My documents", to: "/client/documents", tone: "violet", Icon: HiOutlineFolderOpen },
  { label: "Jobs & visits", to: "/client/jobs", tone: "green", Icon: HiOutlineClipboardDocumentList },
];
import { apiFetch, safeJson } from "../api";
import CompanyAvatar from "../pages/clientAccounts/CompanyAvatar";
import { initialsOf } from "../pages/clientAccounts/avatarUtils";
import { formatDate, SUPPORT_CONTACT } from "./portalUtils";
import PortalLoader from "./PortalLoader";

// Client profile: blue header; Personal details + Security on the left; Access, Help, Quick actions on the right.
// Uses the same /api/auth/me endpoints as the staff profile page.

function PasswordInput({ value, onChange, placeholder, autoComplete, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="cp-pf-input">
      <HiOutlineLockClosed aria-hidden="true" />
      <input id={id} type={show ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" className="cp-pf-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
      </button>
    </div>
  );
}

// Live password checklist + strength (0-4 steps).
function passwordChecks(next, confirm) {
  const checks = [
    { key: "len", label: "6+ characters", ok: next.length >= 6 },
    { key: "num", label: "A number", ok: /\d/.test(next) },
    { key: "sym", label: "A symbol", ok: /[^A-Za-z0-9]/.test(next) },
    { key: "match", label: "Passwords match", ok: !!next && next === confirm },
  ];
  let steps = 0;
  if (next.length >= 6) steps += 1;
  if (next.length >= 10) steps += 1;
  if (/\d/.test(next)) steps += 1;
  if (/[^A-Za-z0-9]/.test(next)) steps += 1;
  if (next.length < 6) steps = Math.min(steps, 1);
  const label = !next ? "" : next.length < 6 ? "Too short" : ["Weak", "Weak", "Fair", "Good", "Strong"][steps];
  const tone = steps >= 4 ? "strong" : steps === 3 ? "good" : steps === 2 ? "fair" : "weak";
  return { checks, steps, label, tone };
}

export default function PortalProfile() {
  const navigate = useNavigate();
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
  const outlets = portal?.outlets || [];
  const pc = passwordChecks(pw.next, pw.confirm);

  if (loading && !profile) {
    return (
      <div className="cp-page">
        <PortalLoader label="Loading your profile…" />
      </div>
    );
  }

  const accessCard = (
    <section className="cp-card cp-pf-card">
      <h3>Your access</h3>
      <p className="cp-pf-sub">{isCompanyAdmin ? "You can see every outlet of your company" : "You can see these outlets"}</p>
      <div className="cp-pf-company">
        <CompanyAvatar name={companyName} size={44} />
        <span>
          <strong>{companyName || "—"}</strong>
          <small>{isCompanyAdmin ? "Company admin" : "Outlet user"} · {outlets.length} outlet{outlets.length === 1 ? "" : "s"}</small>
        </span>
      </div>
      <ul className="cp-pf-outlets">
        {outlets.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => navigate(`/client/outlets/${encodeURIComponent(o.id)}`)}>
              <span className="cp-pf-pin" aria-hidden="true"><HiOutlineMapPin /></span>
              <span className="cp-pf-outlet-text"><strong>{o.name || o.id}</strong>{o.city && <small>{o.city}</small>}</span>
              <span className="cp-pf-open">Open <HiOutlineChevronRight aria-hidden="true" /></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="cp-page cp-pf">
      {/* Blue header */}
      <section className="cp-pf-hero">
        <svg className="cp-pf-rings" viewBox="0 0 460 460" aria-hidden="true">
          <circle cx="230" cy="230" r="220" /><circle cx="230" cy="230" r="160" /><circle cx="230" cy="230" r="100" />
        </svg>
        <span className="cp-pf-avatar" aria-hidden="true">{initialsOf(profile?.name || "")}</span>
        <div className="cp-pf-who">
          <h2>{profile?.name || "Your profile"}</h2>
          <p>{profile?.email}</p>
          <div className="cp-pf-chips">
            <span><HiOutlineShieldCheck aria-hidden="true" /> {isCompanyAdmin ? "Company admin" : "Outlet user"}</span>
            {companyName && <span><HiOutlineBuildingOffice2 aria-hidden="true" /> {companyName}</span>}
            {profile?.created_at && <span><HiOutlineCalendarDays aria-hidden="true" /> Member since {formatDate(profile.created_at, { month: "short", year: "numeric" })}</span>}
          </div>
        </div>
        <div className="cp-pf-stat">
          <strong>{outlets.length}</strong>
          <small>Outlet{outlets.length === 1 ? "" : "s"}</small>
        </div>
      </section>

      {notice && (
        <div className={`cp-notice ${notice.type === "ok" ? "ok" : "warn"}`} role="status">
          <span>{notice.type === "ok" && <HiOutlineCheckCircle aria-hidden="true" />} {notice.text}</span>
          <button className="cp-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss"><HiOutlineXMark /></button>
        </div>
      )}

      <div className="cp-pf-grid">
        <div className="cp-pf-main">
          {(
            <form className="cp-card cp-pf-card" onSubmit={saveProfile}>
              <h3>Personal details</h3>
              <p className="cp-pf-sub">How our team will address and reach you</p>
              <div className="cp-pf-row">
                <label className="cp-pf-field" htmlFor="pf-name">Full name
                  <div className="cp-pf-input">
                    <HiOutlineUser aria-hidden="true" />
                    <input id="pf-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoComplete="name" />
                  </div>
                </label>
                <label className="cp-pf-field" htmlFor="pf-phone">Mobile number
                  <div className="cp-pf-input">
                    <HiOutlinePhone aria-hidden="true" />
                    <input id="pf-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Add a mobile number" inputMode="tel" autoComplete="tel" />
                  </div>
                </label>
              </div>
              <div className="cp-pf-field">Sign-in email
                <div className="cp-pf-input locked">
                  <HiOutlineEnvelope aria-hidden="true" />
                  <input value={profile?.email || ""} readOnly aria-readonly="true" aria-label="Sign-in email" />
                  <span className="cp-pf-lock"><HiOutlineLockClosed aria-hidden="true" /> Locked</span>
                </div>
                <small className="cp-pf-hint">To change your sign-in email, contact BestServe support.</small>
              </div>
              {dirty ? (
                <div className="cp-pf-savebar">
                  <span><i aria-hidden="true" /> You have unsaved changes</span>
                  <button type="button" className="cp-pf-discard" onClick={() => setForm({ name: profile.name || "", phone: profile.phone || "" })}>Discard</button>
                  <button type="submit" className="cp-pf-save" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save changes"}</button>
                </div>
              ) : (
                <p className="cp-pf-hint cp-pf-allsaved"><HiOutlineCheck aria-hidden="true" /> All changes saved</p>
              )}
            </form>
          )}

          {(
            <form className="cp-card cp-pf-card" onSubmit={changePassword}>
              <h3>Change password</h3>
              <p className="cp-pf-sub">Use at least 6 characters; longer with numbers and symbols is safer</p>
              <label className="cp-pf-field" htmlFor="pf-current">Current password
                <PasswordInput id="pf-current" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} placeholder="Enter current password" autoComplete="current-password" />
              </label>
              <div className="cp-pf-row">
                <label className="cp-pf-field" htmlFor="pf-next">New password
                  <PasswordInput id="pf-next" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder="New password" autoComplete="new-password" />
                </label>
                <label className="cp-pf-field" htmlFor="pf-confirm">Confirm new password
                  <PasswordInput id="pf-confirm" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} placeholder="Repeat new password" autoComplete="new-password" />
                </label>
              </div>
              <div className={`cp-pf-meter s-${pc.tone}`} aria-hidden="true">
                {[0, 1, 2, 3].map((i) => <i key={i} className={pw.next && i < Math.max(1, pc.steps) ? "on" : ""} />)}
              </div>
              <div className="cp-pf-checks">
                {pc.checks.map((c) => (
                  <span key={c.key} className={c.ok ? "ok" : ""}>{c.ok ? <HiOutlineCheck aria-hidden="true" /> : <i aria-hidden="true" />} {c.label}</span>
                ))}
                {pc.label && <strong className={`s-${pc.tone}`}>{pc.label}</strong>}
              </div>
              <div className="cp-pf-actions">
                <button type="submit" className="cp-pf-save" disabled={savingPw}>{savingPw ? "Updating…" : "Update password"}</button>
              </div>
            </form>
          )}

        </div>

        <aside className="cp-pf-side">
          {accessCard}
          <section className="cp-card cp-pf-card">
            <h3>Need help?</h3>
            <p className="cp-pf-sub">Our support team can update your access, outlets or sign-in email.</p>
            <div className="cp-pf-help">
              <a className="call" href={`tel:${SUPPORT_CONTACT.phone}`}><HiOutlinePhone aria-hidden="true" /> Call us</a>
              <a className="mail" href={`mailto:${SUPPORT_CONTACT.email}`}><HiOutlineEnvelope aria-hidden="true" /> Email us</a>
            </div>
            <p className="cp-pf-hint cp-pf-center">{SUPPORT_CONTACT.phoneDisplay} · {SUPPORT_CONTACT.email}</p>
          </section>

          <section className="cp-card cp-pf-card">
            <h3>Quick actions</h3>
            <p className="cp-pf-sub">Jump straight to what you need</p>
            <div className="cp-pf-quick">
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.Icon;
                return (
                  <button key={a.to} type="button" className={`tone-${a.tone}`} onClick={() => navigate(a.to)}>
                    <span aria-hidden="true"><Icon /></span>
                    {a.label}
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

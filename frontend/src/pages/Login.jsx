import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiBriefcase,
  FiCheckCircle,
  FiCheckSquare,
  FiEye,
  FiEyeOff,
  FiFileText,
  FiKey,
  FiLock,
  FiMail,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";
import { API_BASE } from "../api";
import "../assets/login.css";
import logoMark from "../assets/logo.png";

// Full BestServe logo (served from /public).
const LOGO_FULL = "/Bestserve-1-2-1024x402.png";

const HIGHLIGHTS = [
  { icon: FiBriefcase, title: "Jobs & site visits", text: "Plan visits, track technicians and every job's progress." },
  { icon: FiCheckSquare, title: "Tasks & follow-ups", text: "Assign work across teams and see what's due." },
  { icon: FiFileText, title: "Invoices & payments", text: "Keep billing, collections and TDS in one place." },
  { icon: FiUsers, title: "Client portal", text: "Customers see their jobs, updates and tickets." },
];

/** A password field with a show / hide toggle. */
function PasswordInput({ value, onChange, placeholder, autoComplete, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="bs-login-input">
      <FiLock className="bs-login-input-icon" aria-hidden="true" />
      <input id={id} type={show ? "text" : "password"} placeholder={placeholder} value={value} onChange={onChange} autoComplete={autoComplete} />
      <button type="button" className="bs-login-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <FiEyeOff /> : <FiEye />}
      </button>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  // login | forgot-email | forgot-verify

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Shown on the page instead of pop-up alerts; `busy` stops double submits.
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const switchMode = (next) => {
    setError("");
    setNotice("");
    setMode(next);
  };

  // Posts JSON and returns { res, data }; a network failure becomes an error message.
  async function post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // ---------------- LOGIN ----------------
  const handleLogin = (e) => {
    e?.preventDefault();
    if (!acceptTerms) return;
    run(async () => {
      const { res, data } = await post("/api/auth/login", { email, password });

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      if (data.user_id) {
        localStorage.setItem("userId", String(data.user_id));
      } else {
        localStorage.removeItem("userId");
      }
      if (data.contact_id) {
        localStorage.setItem("contactId", String(data.contact_id));
      } else {
        localStorage.removeItem("contactId");
      }

      navigate("/");
    });
  };

  // ---------------- SEND RESET OTP ----------------
  const handleSendResetOtp = (e) => {
    e?.preventDefault();
    run(async () => {
      const { res, data } = await post("/api/auth/forgot-password/send-otp", { email });

      if (!res.ok) {
        setError(data.error || "Failed to send OTP");
        return;
      }

      setMode("forgot-verify");
      setNotice(`We've sent a one-time code to ${email}.`);
    });
  };

  // ---------------- VERIFY + RESET ----------------
  const handleResetPassword = (e) => {
    e?.preventDefault();
    run(async () => {
      const { res, data } = await post("/api/auth/forgot-password/verify-otp", {
        email,
        otp,
        newPassword,
      });

      if (!res.ok) {
        setError(data.error || "Reset failed");
        return;
      }

      setMode("login");
      setPassword("");
      setNotice("Password updated. Please sign in with your new password.");
    });
  };

  const messages = (
    <>
      {error && (
        <p className="bs-login-msg error" role="alert">
          <FiAlertCircle /> {error}
        </p>
      )}
      {notice && (
        <p className="bs-login-msg ok" role="status">
          <FiCheckCircle /> {notice}
        </p>
      )}
    </>
  );

  return (
    <div className="bs-login">
      <div className="bs-login-box">
      {/* ---------------- BRAND PANEL ---------------- */}
      <aside className="bs-login-brand" aria-hidden="true">
        <span className="bs-login-piece p1" />
        <span className="bs-login-piece p2" />
        <span className="bs-login-piece p3 blue" />

        <div className="bs-login-brand-top">
          <span className="bs-login-mark">
            <img src={logoMark} alt="" />
          </span>
          <span className="bs-login-brand-name">
            BESTserve
            <small>Pest Management Pvt. Ltd.</small>
          </span>
        </div>

        <div className="bs-login-brand-body">
          <h2>Everything your team needs, in one place.</h2>
          <p>One sign-in for staff, supervisors, technicians, accounts and clients. You'll land on the dashboard for your role.</p>
          <ul className="bs-login-highlights">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title}>
                <span className="bs-login-hl-icon">
                  <h.icon />
                </span>
                <span>
                  <strong>{h.title}</strong>
                  <small>{h.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="bs-login-tagline">“Here To Complete Rather Than Compete”</p>
      </aside>

      {/* ---------------- FORM PANEL ---------------- */}
      <main className="bs-login-main">
        <div className="bs-login-card">
          <div className="bs-login-mobile-brand">
            <img src={LOGO_FULL} alt="BestServe — Bestserve Pest Management Pvt. Ltd." />
          </div>

          {/* ---------------- LOGIN MODE ---------------- */}
          {mode === "login" && (
            <form onSubmit={handleLogin} noValidate>
              <h1>Welcome back</h1>
              <p className="bs-login-sub">Sign in to your BestServe account</p>

              {messages}

              <label className="bs-login-field" htmlFor="bs-email">
                <span>Email</span>
                <div className="bs-login-input">
                  <FiMail className="bs-login-input-icon" aria-hidden="true" />
                  <input id="bs-email" type="text" inputMode="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </div>
              </label>

              <label className="bs-login-field" htmlFor="bs-password">
                <span>Password</span>
                <PasswordInput id="bs-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
              </label>
              <div className="bs-login-forgot">
                <button type="button" className="bs-login-link" onClick={() => switchMode("forgot-email")}>
                  Forgot password?
                </button>
              </div>

              <label className="bs-login-terms">
                <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
                <span>
                  I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noreferrer">
                    Terms &amp; Conditions
                  </a>
                </span>
              </label>

              <button type="submit" className="bs-login-btn" disabled={!acceptTerms || busy}>
                {busy ? <span className="bs-login-spin" aria-hidden="true" /> : null}
                {busy ? "Signing in…" : "Sign in"}
              </button>
              {!acceptTerms && <p className="bs-login-hint">Tick the box above to continue.</p>}

              <div className="bs-login-or">
                <span>or</span>
              </div>

              <div className="bs-login-alt">
                <a href="/signup">
                  <FiUserPlus />
                  <span>
                    <strong>New here?</strong>
                    <small>Create an account</small>
                  </span>
                </a>
                <a href="/temp-access">
                  <FiKey />
                  <span>
                    <strong>Temporary worker?</strong>
                    <small>Sign in with OTP</small>
                  </span>
                </a>
              </div>
            </form>
          )}

          {/* ---------------- ENTER EMAIL ---------------- */}
          {mode === "forgot-email" && (
            <form onSubmit={handleSendResetOtp} noValidate>
              <h1>Reset your password</h1>
              <p className="bs-login-sub">Enter your account email and we'll send you a one-time code.</p>

              {messages}

              <label className="bs-login-field" htmlFor="bs-reset-email">
                <span>Email</span>
                <div className="bs-login-input">
                  <FiMail className="bs-login-input-icon" aria-hidden="true" />
                  <input id="bs-reset-email" type="text" inputMode="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </div>
              </label>

              <button type="submit" className="bs-login-btn" disabled={busy || !email.trim()}>
                {busy ? <span className="bs-login-spin" aria-hidden="true" /> : null}
                {busy ? "Sending…" : "Send OTP"}
              </button>

              <button type="button" className="bs-login-back" onClick={() => switchMode("login")}>
                <FiArrowLeft /> Back to sign in
              </button>
            </form>
          )}

          {/* ---------------- VERIFY OTP ---------------- */}
          {mode === "forgot-verify" && (
            <form onSubmit={handleResetPassword} noValidate>
              <h1>Enter the code</h1>
              <p className="bs-login-sub">Check your email for the one-time code, then choose a new password.</p>

              {messages}

              <label className="bs-login-field" htmlFor="bs-otp">
                <span>One-time code</span>
                <div className="bs-login-input">
                  <FiKey className="bs-login-input-icon" aria-hidden="true" />
                  <input id="bs-otp" inputMode="numeric" autoComplete="one-time-code" placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} autoFocus />
                </div>
              </label>

              <label className="bs-login-field" htmlFor="bs-new-password">
                <span>New password</span>
                <PasswordInput id="bs-new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" />
              </label>

              <button type="submit" className="bs-login-btn" disabled={busy || !otp.trim() || !newPassword}>
                {busy ? <span className="bs-login-spin" aria-hidden="true" /> : null}
                {busy ? "Updating…" : "Reset password"}
              </button>

              <button type="button" className="bs-login-back" onClick={() => switchMode("forgot-email")}>
                <FiArrowLeft /> Use a different email
              </button>
            </form>
          )}

          <p className="bs-login-foot">© {new Date().getFullYear()} Bestserve Pest Management Pvt. Ltd.</p>
        </div>
      </main>
      </div>
    </div>
  );
}

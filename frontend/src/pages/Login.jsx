import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiArrowRight,
  FiCheckCircle,
  FiKey,
  FiLock,
  FiLogIn,
  FiMail,
  FiUserPlus,
} from "react-icons/fi";
import { API_BASE } from "../api";
import AuthLayout, { AuthHeading, PasswordInput } from "../components/AuthLayout";

/** "Good morning" / "Good afternoon" / "Good evening" for the viewer's local time. */
function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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
    <AuthLayout title="Everything your team needs, in one place.">
          {/* ---------------- LOGIN MODE ---------------- */}
          {mode === "login" && (
            <form onSubmit={handleLogin} noValidate>
              <AuthHeading icon={FiLogIn}  sub="Sign in to your BestServe account">
                Welcome <em>back</em>
              </AuthHeading>

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
                  <span className="bs-login-alt-icon">
                    <FiUserPlus />
                  </span>
                  <span>
                    <strong>New here?</strong>
                    <small>Create an account</small>
                  </span>
                  <FiArrowRight className="bs-login-alt-go" aria-hidden="true" />
                </a>
                {/* Temporary worker sign-in is hidden for now; the /temp-access page still works.
                <a href="/temp-access">
                  <FiKey />
                  <span>
                    <strong>Temporary worker?</strong>
                    <small>Sign in with OTP</small>
                  </span>
                </a>
                */}
              </div>
            </form>
          )}

          {/* ---------------- ENTER EMAIL ---------------- */}
          {mode === "forgot-email" && (
            <form onSubmit={handleSendResetOtp} noValidate>
              <AuthHeading icon={FiLock} eyebrow="Account help" sub="Enter your account email and we'll send you a one-time code.">
                Reset your <em>password</em>
              </AuthHeading>

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
              <AuthHeading icon={FiKey} eyebrow="Almost there" sub="Check your email for the one-time code, then choose a new password.">
                Enter the <em>code</em>
              </AuthHeading>

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

    </AuthLayout>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertCircle, FiArrowLeft, FiBriefcase, FiCheckCircle, FiKey, FiMail, FiPhone, FiUser, FiUserPlus } from "react-icons/fi";
import AuthLayout, { AuthHeading, PasswordInput } from "../components/AuthLayout";

export default function Signup() {
  const navigate = useNavigate();

  const [step, setStep] = useState("form"); // "form" | "otp"
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  // Shown on the page instead of pop-up alerts.
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    designation: "",
  });

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  // =============================
  // STEP 1 — SEND OTP
  // =============================
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/auth/signup/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to send OTP");
      }

      setStep("otp");
      setNotice(`We've sent a one-time code to ${form.email}.`);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : err.message);
    } finally {
      setLoading(false);
    }
  };

  // =============================
  // STEP 2 — VERIFY OTP + CREATE USER
  // =============================
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/auth/signup/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          password: form.password,
          otp: otp,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "OTP verification failed");
      }

      setNotice("Account created successfully. Taking you to sign in…");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : err.message);
      setLoading(false);
    }
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
    <AuthLayout wide title="Join BestServe.">
      {step === "form" && (
        <form onSubmit={handleSendOtp}>
          <AuthHeading icon={FiUserPlus} eyebrow="Get started" sub="We'll email you a one-time code to confirm it's you.">
            Create your <em>account</em>
          </AuthHeading>

          {messages}

          <div className="bs-login-grid2">
            <label className="bs-login-field" htmlFor="su-name">
              <span>Full name</span>
              <div className="bs-login-input">
                <FiUser className="bs-login-input-icon" aria-hidden="true" />
                <input id="su-name" name="name" type="text" autoComplete="name" placeholder="Your full name" value={form.name} onChange={handleChange} required autoFocus />
              </div>
            </label>

            <label className="bs-login-field" htmlFor="su-phone">
              <span>Mobile number</span>
              <div className="bs-login-input">
                <FiPhone className="bs-login-input-icon" aria-hidden="true" />
                <input id="su-phone" name="phone" type="tel" autoComplete="tel" placeholder="10-digit mobile" value={form.phone} onChange={handleChange} required />
              </div>
            </label>

            <label className="bs-login-field" htmlFor="su-email">
              <span>Email</span>
              <div className="bs-login-input">
                <FiMail className="bs-login-input-icon" aria-hidden="true" />
                <input id="su-email" name="email" type="email" autoComplete="email" placeholder="you@company.com" value={form.email} onChange={handleChange} required />
              </div>
            </label>

            <label className="bs-login-field" htmlFor="su-password">
              <span>Password</span>
              <PasswordInput id="su-password" name="password" value={form.password} onChange={handleChange} placeholder="New password" autoComplete="new-password" required />
            </label>
          </div>

          <label className="bs-login-field" htmlFor="su-designation">
            <span>
              Designation <em className="bs-login-optional">(optional)</em>
            </span>
            <div className="bs-login-input">
              <FiBriefcase className="bs-login-input-icon" aria-hidden="true" />
              <input id="su-designation" name="designation" type="text" placeholder="e.g. Field Technician" value={form.designation} onChange={handleChange} />
            </div>
          </label>

          <label className="bs-login-terms">
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span>
              I agree to the{" "}
              <a href="/terms" target="_blank" rel="noreferrer">
                Terms &amp; Conditions
              </a>
            </span>
          </label>

          <button type="submit" className="bs-login-btn" disabled={loading || !acceptTerms}>
            {loading ? <span className="bs-login-spin" aria-hidden="true" /> : null}
            {loading ? "Sending…" : "Send OTP"}
          </button>

          <p className="bs-login-switch">
            Already have an account?{" "}
            <button type="button" className="bs-login-link" onClick={() => navigate("/login")}>
              Sign in
            </button>
          </p>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp}>
          <AuthHeading
            icon={FiMail}
            eyebrow="One last step"
            sub={
              <>
                Enter the code we sent to <strong>{form.email}</strong>.
              </>
            }
          >
            Confirm your <em>email</em>
          </AuthHeading>

          {messages}

          <label className="bs-login-field" htmlFor="su-otp">
            <span>One-time code</span>
            <div className="bs-login-input">
              <FiKey className="bs-login-input-icon" aria-hidden="true" />
              <input id="su-otp" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value)} required autoFocus />
            </div>
          </label>

          <button type="submit" className="bs-login-btn" disabled={loading}>
            {loading ? <span className="bs-login-spin" aria-hidden="true" /> : null}
            {loading ? "Creating account…" : "Verify & create account"}
          </button>

          <button
            type="button"
            className="bs-login-back"
            onClick={() => {
              setStep("form");
              setError("");
              setNotice("");
            }}
          >
            <FiArrowLeft /> Change details
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

import { useState } from "react";
import { FiBriefcase, FiCheckSquare, FiEye, FiEyeOff, FiFileText, FiLock, FiUsers } from "react-icons/fi";
import "../assets/login.css";
import logoMark from "../assets/logo.png";

// Full BestServe logo (served from /public).
const LOGO_FULL = "/Bestserve-1-2-1024x402.png";

const HIGHLIGHTS = [
  { icon: FiBriefcase, title: "Jobs & site visits" },
  { icon: FiCheckSquare, title: "Tasks & follow-ups" },
  { icon: FiFileText, title: "Invoices & payments" },
  { icon: FiUsers, title: "Client portal" },
];

/**
 * The BestServe sign-in frame shared by Login and Signup: one centred box
 * with the red brand panel on the left (the only place the logo shows on a
 * laptop) and the page's form on the right. On phones the brand panel is
 * hidden and the full logo sits above the form instead.
 */
export default function AuthLayout({ title, children, wide = false }) {
  return (
    <div className="bs-login">
      <div className="bs-login-box">
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
            <h2>{title}</h2>
            <ul className="bs-login-highlights">
              {HIGHLIGHTS.map((h) => (
                <li key={h.title}>
                  <span className="bs-login-hl-icon">
                    <h.icon />
                  </span>
                  <strong>{h.title}</strong>
                </li>
              ))}
            </ul>
          </div>

          <p className="bs-login-tagline">“Here To Complete Rather Than Compete”</p>
        </aside>

        <main className="bs-login-main">
          <div className={`bs-login-card ${wide ? "wide" : ""}`}>
            <div className="bs-login-mobile-brand">
              <img src={LOGO_FULL} alt="BestServe — Bestserve Pest Management Pvt. Ltd." />
            </div>
            {children}
            <p className="bs-login-foot">© {new Date().getFullYear()} Bestserve Pest Management Pvt. Ltd.</p>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * The top of an AuthLayout form: a brand icon tile, a small eyebrow line,
 * the title (wrap a word in <em> to colour it) and a one-line subtitle.
 */
export function AuthHeading({ icon, eyebrow, sub, children }) {
  const Icon = icon;
  return (
    <header className="bs-login-head">
      <span className="bs-login-head-icon" aria-hidden="true">
        <Icon />
      </span>
      {eyebrow && <span className="bs-login-eyebrow">{eyebrow}</span>}
      <h1>{children}</h1>
      {sub && <p className="bs-login-sub">{sub}</p>}
    </header>
  );
}

/** A password field with a show / hide toggle, styled for AuthLayout forms. */
export function PasswordInput({ value, onChange, placeholder, autoComplete, id, name, required }) {
  const [show, setShow] = useState(false);
  return (
    <div className="bs-login-input">
      <FiLock className="bs-login-input-icon" aria-hidden="true" />
      <input id={id} name={name} type={show ? "text" : "password"} placeholder={placeholder} value={value} onChange={onChange} autoComplete={autoComplete} required={required} />
      <button type="button" className="bs-login-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <FiEyeOff /> : <FiEye />}
      </button>
    </div>
  );
}

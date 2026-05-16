import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE } from "../api";
import "../assets/auth.css";

export default function TemporaryAccessLogin() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const accessId = useMemo(() => params.get("access") || "", [params]);
  const jobIdFromLink = useMemo(() => params.get("job") || "", [params]);

  async function handleVerify() {
    if (!accessId) {
      alert("Invalid link. Missing access id.");
      return;
    }
    if (!otp) {
      alert("Please enter OTP.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/api/auth/temporary-access/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_id: accessId,
          otp: String(otp).trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "OTP verification failed");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role || "temporary_worker");
      localStorage.removeItem("userId");
      localStorage.removeItem("contactId");

      const targetJobId = data.job_id || jobIdFromLink;
      navigate(targetJobId ? `/temp/jobs/${targetJobId}` : "/temp", { replace: true });
    } catch (err) {
      console.error("Temporary login failed:", err);
      alert("Temporary login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Temporary Worker Access</h2>
        <p style={{ color: "#64748b", marginTop: -4 }}>
          Enter the OTP shared by your supervisor/admin.
        </p>
        <input
          type="text"
          placeholder="6-digit OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button onClick={handleVerify} disabled={submitting || otp.length < 6}>
          {submitting ? "Verifying..." : "Verify OTP"}
        </button>
      </div>
    </div>
  );
}


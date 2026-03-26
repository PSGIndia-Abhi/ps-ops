import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();

  const API = import.meta.env.VITE_API_BASE;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (!API) {
      return setError("API base URL not configured");
    }

    if (password.length < 6) {
      return setError("Password must be at least 6 characters");
    }

    if (password !== confirm) {
      return setError("Passwords do not match");
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/api/invite/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      let data = {};

      try {
        data = await res.json();
      } catch {
        // backend returned empty or html
      }

      if (!res.ok) {
        throw new Error(data.error || "Activation failed");
      }

      setSuccess(true);

      setTimeout(() => {
        navigate("/login");
      }, 2000);

    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="invite-page">
      <div className="invite-card">
        <h2>Set Your Password</h2>
        <p>Create your account password to access the service portal.</p>

        {success ? (
          <div className="success-box">
            Account activated successfully. Redirecting to login...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <label>Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />

            {error && <div className="error">{error}</div>}

            <button disabled={loading}>
              {loading ? "Activating..." : "Activate Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
import { useNavigate } from "react-router-dom";

export default function ClientJobsPage() {

  const navigate = useNavigate();

  return (
    <div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2>My Jobs</h2>
          <p style={{ color: "#6b7280" }}>Track all requested services</p>
        </div>

        <button
          onClick={() => navigate("/client")}
          style={{
            padding: "8px 14px",
            background: "#111827",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer"
          }}
        >
          Back to Dashboard
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 10,
          border: "1px solid #e5e7eb"
        }}
      >
        Jobs list coming soon...
      </div>

    </div>
  );
}
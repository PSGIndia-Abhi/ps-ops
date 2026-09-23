// Temporary page for accountant tabs whose requirements have not been defined yet.
export default function AccountantPlaceholder({ title }) {
  return (
    <div style={{ padding: 24, background: "#fff", borderRadius: 14, border: "1px solid var(--border)" }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <p style={{ color: "#64748b", marginTop: 8 }}>This section is not built yet.</p>
    </div>
  );
}

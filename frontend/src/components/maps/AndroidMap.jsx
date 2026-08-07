export default function AndroidMap({
  center,
  zoom,
  markers,
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "400px",
        borderRadius: "12px",
        border: "1px solid #ddd",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#e8f5e9",
        fontWeight: 600,
      }}
    >
      📱 Native Google Map Placeholder
    </div>
  );
}
// MetricCard component
export default function MetricCard({ label, value, delta, deltaType, icon }) {
  return (
    <div style={{
      background: "var(--color-background-secondary)",
      borderRadius: "var(--border-radius-md)", padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <i className={`ti ti-${icon}`} aria-hidden="true" style={{ fontSize: 13, color: "var(--color-text-tertiary)" }} />
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)" }}>{value}</div>
      <div style={{
        fontSize: 11, marginTop: 3,
        color: deltaType === "bad" ? "var(--color-text-danger)" : "var(--color-text-success)",
      }}>
        {delta}
      </div>
    </div>
  );
}

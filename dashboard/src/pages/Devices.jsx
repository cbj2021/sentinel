import { useState, useEffect } from "react";
import { apiFetch } from "../hooks/useApi";

const STATUS_STYLE = {
  online:   { bg: "#EAF3DE", color: "#3B6D11", dot: "#1D9E75" },
  critical: { bg: "#FCEBEB", color: "#A32D2D", dot: "#E24B4A" },
  warning:  { bg: "#FAEEDA", color: "#854F0B", dot: "#EF9F27" },
  offline:  { bg: "var(--color-background-secondary)", color: "var(--color-text-secondary)", dot: "#888780" },
};

export function Devices({ token }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/devices", token).then(setDevices).finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 20px" }}>Devices</h1>

      {loading ? <p style={{ color: "var(--color-text-secondary)" }}>Loading...</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {devices.map((d) => {
            const s = STATUS_STYLE[d.status] || STATUS_STYLE.offline;
            return (
              <div key={d.id} style={{
                background: "var(--color-background-primary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "var(--border-radius-lg)", padding: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <i className={`ti ti-${d.platform === "darwin" ? "brand-apple" : "brand-windows"}`}
                       aria-hidden="true" style={{ fontSize: 18, color: "var(--color-text-secondary)" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{d.hostname}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{d.os_version}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 10,
                    background: s.bg, color: s.color,
                  }}>
                    {d.status}
                  </span>
                </div>
                <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10 }}>
                  <Row label="Agent" value={`v${d.agent_version}`} />
                  <Row label="Arch" value={d.arch} />
                  <Row label="Last seen" value={timeAgo(d.last_seen)} />
                  {parseInt(d.active_threats) > 0 && (
                    <div style={{
                      marginTop: 8, fontSize: 11, color: "#A32D2D",
                      background: "#FCEBEB", padding: "4px 8px",
                      borderRadius: "var(--border-radius-md)", textAlign: "center",
                    }}>
                      <i className="ti ti-alert-triangle" aria-hidden="true" style={{ marginRight: 4 }} />
                      {d.active_threats} active threat(s)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "never";
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default Devices;

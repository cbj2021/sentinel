import { useState } from "react";
import { apiFetch } from "../hooks/useApi";

const SEVERITY_STYLES = {
  critical: { bg: "#FCEBEB", color: "#A32D2D", icon: "virus" },
  high:     { bg: "#FAEEDA", color: "#854F0B", icon: "network" },
  medium:   { bg: "#E6F1FB", color: "#185FA5", icon: "file-alert" },
  low:      { bg: "#EAF3DE", color: "#3B6D11", icon: "info-circle" },
};

export default function ThreatRow({ threat, token, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const style = SEVERITY_STYLES[threat.severity] || SEVERITY_STYLES.medium;

  const handleAction = async (status) => {
    setLoading(true);
    try {
      await apiFetch(`/api/threats/${threat.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onUpdate?.();
    } catch (e) {
      alert("Action failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "var(--border-radius-md)",
        background: style.bg, color: style.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, fontSize: 13,
      }}>
        <i className={`ti ti-${style.icon}`} aria-hidden="true" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{threat.name}</div>
        <div style={{
          fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {threat.hostname} · {threat.file_path || threat.details}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", flexShrink: 0, paddingTop: 2 }}>
        {timeAgo(threat.detected_at)}
      </div>
      {threat.status === "active" && (
        <button
          onClick={() => handleAction("quarantined")}
          disabled={loading}
          style={{
            fontSize: 10, padding: "3px 8px", borderRadius: "var(--border-radius-md)",
            border: `0.5px solid ${style.color}`, cursor: "pointer",
            color: style.color, background: style.bg, flexShrink: 0,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "..." : threat.severity === "critical" ? "Quarantine" : "Resolve"}
        </button>
      )}
      {threat.status !== "active" && (
        <span style={{
          fontSize: 10, padding: "3px 8px", borderRadius: 10,
          background: "#EAF3DE", color: "#3B6D11", flexShrink: 0,
        }}>
          {threat.status}
        </span>
      )}
    </div>
  );
}

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

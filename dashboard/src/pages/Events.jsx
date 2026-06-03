import { useState, useEffect } from "react";
import { apiFetch } from "../hooks/useApi";

const TYPE_STYLE = {
  network:       { label: "Network",  bg: "#FAEEDA", color: "#854F0B", icon: "wifi" },
  process_chain: { label: "Process",  bg: "#FCEBEB", color: "#A32D2D", icon: "git-branch" },
  impersonation: { label: "Spoof",    bg: "#FCEBEB", color: "#A32D2D", icon: "user-question" },
};

export default function Events({ token }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/events", token).then(setEvents).finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 20px" }}>Events</h1>

      <div style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)", padding: 16,
      }}>
        {loading
          ? <p style={{ color: "var(--color-text-secondary)", textAlign: "center" }}>Loading...</p>
          : events.map((e) => {
              const s = TYPE_STYLE[e.type] || { label: e.type, bg: "#E6F1FB", color: "#185FA5", icon: "info-circle" };
              return (
                <div key={e.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "10px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "var(--border-radius-md)",
                    background: s.bg, color: s.color, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                  }}>
                    <i className={`ti ti-${s.icon}`} aria-hidden="true" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>
                      {e.chain || e.reason?.substring(0, 60)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                      {e.hostname} · {e.reason}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                    {new Date(e.occurred_at).toLocaleTimeString()}
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

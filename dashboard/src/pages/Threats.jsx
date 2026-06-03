import { useState, useEffect } from "react";
import { apiFetch } from "../hooks/useApi";
import ThreatRow from "../components/ThreatRow";

export default function Threats({ token }) {
  const [threats, setThreats] = useState([]);
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/threats?status=${filter}&limit=100`, token)
      .then(setThreats)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter, token]);

  const FILTERS = ["active", "quarantined", "resolved", "false_positive"];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Threats</h1>
        <button onClick={load} style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 12,
          padding: "6px 12px", borderRadius: "var(--border-radius-md)",
          border: "0.5px solid var(--color-border-secondary)",
          background: "var(--color-background-secondary)", cursor: "pointer",
        }}>
          <i className="ti ti-refresh" aria-hidden="true" style={{ fontSize: 13 }} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "5px 12px", borderRadius: "var(--border-radius-md)", fontSize: 12,
            border: filter === f ? "0.5px solid var(--color-border-secondary)" : "0.5px solid transparent",
            background: filter === f ? "var(--color-background-secondary)" : "transparent",
            color: filter === f ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            cursor: "pointer", textTransform: "capitalize",
          }}>
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      <div style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)", padding: 16,
      }}>
        {loading
          ? <div style={{ padding: 20, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>Loading...</div>
          : threats.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>
                <i className="ti ti-shield-check" style={{ fontSize: 24, display: "block", marginBottom: 8, color: "#1D9E75" }} />
                No {filter} threats
              </div>
            : threats.map((t) => <ThreatRow key={t.id} threat={t} token={token} onUpdate={load} />)
        }
      </div>
    </div>
  );
}

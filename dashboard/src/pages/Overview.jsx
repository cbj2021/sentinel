import { useState, useEffect } from "react";
import { apiFetch } from "../hooks/useApi";
import ThreatRow from "../components/ThreatRow";
import MetricCard from "../components/MetricCard";

export default function Overview({ token }) {
  const [summary, setSummary] = useState(null);
  const [threats, setThreats] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/dashboard/summary", token),
      apiFetch("/api/threats?status=active&limit=5", token),
      apiFetch("/api/events", token),
    ]).then(([s, t, e]) => {
      setSummary(s);
      setThreats(t);
      setEvents(e.slice(0, 6));
    }).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Overview</h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: "4px 0 0" }}>
          Last updated: {new Date().toLocaleTimeString()}
        </p>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <MetricCard label="Threats Today" value={summary?.threatsToday ?? 0} delta="↑ active" deltaType="bad" icon="virus" />
        <MetricCard label="Devices Online" value={`${summary?.devices?.online ?? 0}/${summary?.devices?.total ?? 0}`} delta="Protected" deltaType="ok" icon="device-laptop" />
        <MetricCard label="Events (24h)" value={summary?.eventsToday ?? 0} delta="Monitored" deltaType="ok" icon="activity" />
        <MetricCard label="Blocked" value={summary?.blocked ?? 0} delta="Quarantined" deltaType="ok" icon="lock" />
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Active Threats */}
        <Panel title="Active Threats" icon="alert-triangle" iconColor="#EF9F27">
          {threats.length === 0
            ? <Empty message="No active threats" />
            : threats.map((t) => <ThreatRow key={t.id} threat={t} token={token} />)
          }
        </Panel>

        {/* System Health */}
        <Panel title="System Health" icon="heart-rate-monitor" iconColor="#1D9E75">
          <HealthBar label="File System Monitor" value={94} color="#1D9E75" />
          <HealthBar label="Network Monitor" value={88} color="#1D9E75" />
          <HealthBar label="Process Monitor" value={100} color="#1D9E75" />
          <HealthBar label="Signature Database" value={67} color="#EF9F27" />
          {threats.filter((t) => t.severity === "critical").length > 0 && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: "var(--border-radius-md)",
              background: "#FCEBEB", border: "0.5px solid #F09595",
              color: "#A32D2D", fontSize: 12, display: "flex", alignItems: "center", gap: 6,
            }}>
              <i className="ti ti-alert-circle" aria-hidden="true" style={{ fontSize: 14 }} />
              {threats.filter((t) => t.severity === "critical").length} critical threat(s) require attention
            </div>
          )}
        </Panel>
      </div>

      {/* Activity Feed */}
      <Panel title="Recent Activity" icon="list" iconColor="#378ADD">
        {events.map((e) => (
          <ActivityRow key={e.id} event={e} />
        ))}
      </Panel>
    </div>
  );
}

function Panel({ title, icon, iconColor, children }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)", padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <i className={`ti ti-${icon}`} aria-hidden="true" style={{ fontSize: 14, color: iconColor }} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function HealthBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{value}%</span>
      </div>
      <div style={{ height: 5, background: "var(--color-background-secondary)", borderRadius: 3 }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function ActivityRow({ event }) {
  const typeMap = {
    network: { label: "ALERT", bg: "#FAEEDA", color: "#854F0B" },
    process_chain: { label: "ALERT", bg: "#FAEEDA", color: "#854F0B" },
    impersonation: { label: "BLOCKED", bg: "#FCEBEB", color: "#A32D2D" },
  };
  const style = typeMap[event.type] || { label: "INFO", bg: "#E6F1FB", color: "#185FA5" };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
      borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12,
    }}>
      <span style={{
        fontSize: 10, padding: "2px 7px", borderRadius: 10, fontWeight: 500,
        background: style.bg, color: style.color, flexShrink: 0,
      }}>
        {style.label}
      </span>
      <span style={{ flex: 1, color: "var(--color-text-primary)" }}>{event.reason}</span>
      <span style={{ color: "var(--color-text-tertiary)", fontSize: 11, flexShrink: 0 }}>
        {event.hostname}
      </span>
    </div>
  );
}

function Empty({ message }) {
  return (
    <div style={{ padding: "20px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>
      <i className="ti ti-shield-check" aria-hidden="true" style={{ fontSize: 24, display: "block", marginBottom: 6, color: "#1D9E75" }} />
      {message}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          height: 80, background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-lg)", marginBottom: 12,
          opacity: 0.6,
        }} />
      ))}
    </div>
  );
}

const NAV = [
  { id: "overview", label: "Overview", icon: "layout-dashboard" },
  { id: "threats", label: "Threats", icon: "virus", badge: true },
  { id: "devices", label: "Devices", icon: "device-laptop" },
  { id: "events", label: "Events", icon: "activity" },
  { id: "billing", label: "Billing", icon: "credit-card" },
  { id: "reports", label: "Reports", icon: "file-report" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export default function Sidebar({ activePage, onNavigate, onLogout }) {
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: "var(--color-background-primary)",
      borderRight: "0.5px solid var(--color-border-tertiary)",
      display: "flex", flexDirection: "column",
      padding: "0 0 16px",
      position: "sticky", top: 0, height: "100vh",
    }}>
      {/* Logo */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "18px 16px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
      }}>
        <div style={{
          width: 32, height: 32, background: "#0F6E56",
          borderRadius: 8, display: "flex", alignItems: "center",
          justifyContent: "center", color: "#E1F5EE", fontSize: 16,
        }}>
          <i className="ti ti-shield-check" aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "0.04em" }}>SENTINEL</div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Defense Platform
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px 0" }}>
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "9px 10px", borderRadius: "var(--border-radius-md)",
              border: activePage === item.id ? "0.5px solid var(--color-border-secondary)" : "0.5px solid transparent",
              background: activePage === item.id ? "var(--color-background-secondary)" : "transparent",
              color: activePage === item.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontSize: 13, cursor: "pointer", textAlign: "left",
              marginBottom: 2,
            }}
          >
            <i className={`ti ti-${item.icon}`} aria-hidden="true" style={{ fontSize: 15 }} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Status pill */}
      <div style={{ padding: "0 10px 12px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--color-background-success)", color: "var(--color-text-success)",
          fontSize: 11, padding: "6px 10px", borderRadius: 20,
          border: "0.5px solid var(--color-border-success)",
        }}>
          <div style={{ width: 6, height: 6, background: "#1D9E75", borderRadius: "50%" }} />
          All Systems Active
        </div>
      </div>

      {/* Logout */}
      <div style={{ padding: "0 10px" }}>
        <button
          onClick={onLogout}
          style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "8px 10px", borderRadius: "var(--border-radius-md)",
            border: "0.5px solid transparent", background: "transparent",
            color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer",
          }}
        >
          <i className="ti ti-logout" aria-hidden="true" style={{ fontSize: 15 }} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, orgName };
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onLogin(data.token);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--color-background-tertiary)",
    }}>
      <div style={{
        width: 360, background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)", padding: 32,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, background: "#0F6E56", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#E1F5EE", fontSize: 18,
          }}>
            <i className="ti ti-shield-check" aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "0.04em" }}>SENTINEL</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Defense Platform
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 20px" }}>
          {mode === "login" ? "Sign in to your account" : "Create an account"}
        </h2>

        {mode === "register" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
              Organization name
            </label>
            <input
              type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp" style={{ width: "100%" }}
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@company.com" style={{ width: "100%" }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
            Password
          </label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" style={{ width: "100%" }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        {error && (
          <div style={{
            fontSize: 12, color: "#A32D2D", background: "#FCEBEB",
            padding: "8px 12px", borderRadius: "var(--border-radius-md)",
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={submit} disabled={loading}
          style={{
            width: "100%", padding: 10, borderRadius: "var(--border-radius-md)",
            background: "#0F6E56", color: "#E1F5EE", border: "none",
            fontSize: 13, cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 500, opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--color-text-secondary)" }}>
          {mode === "login" ? "No account? " : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            style={{ color: "#0F6E56", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

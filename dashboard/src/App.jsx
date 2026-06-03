import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Overview from "./pages/Overview";
import Threats from "./pages/Threats";
import Devices from "./pages/Devices";
import Events from "./pages/Events";
import Billing from "./pages/Billing";
import Login from "./pages/Login";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("sentinel_token"));
  const [page, setPage] = useState("overview");

  const handleLogin = (tok) => {
    localStorage.setItem("sentinel_token", tok);
    setToken(tok);
  };

  const handleLogout = () => {
    localStorage.removeItem("sentinel_token");
    setToken(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;

  const pages = {
    overview: Overview,
    threats: Threats,
    devices: Devices,
    events: Events,
    billing: Billing,
  };
  const PageComponent = pages[page] || Overview;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
      <Sidebar activePage={page} onNavigate={setPage} onLogout={handleLogout} />
      <main style={{ flex: 1, overflow: "auto" }}>
        <PageComponent token={token} />
      </main>
    </div>
  );
}

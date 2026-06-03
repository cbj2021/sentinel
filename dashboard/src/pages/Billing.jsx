import { useState, useEffect } from "react";
import { apiFetch } from "../hooks/useApi";

const PROVIDER_INFO = {
  stripe: { name: "Stripe", note: "Pay with card", icon: "credit-card" },
  paddle: { name: "Paddle", note: "Tax handled for you", icon: "world" },
  lemonsqueezy: { name: "Lemon Squeezy", note: "Tax handled for you", icon: "lemon" },
};

export default function Billing({ token }) {
  const [plans, setPlans] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState("stripe");
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/billing/plans", token),
      apiFetch("/api/billing/subscription", token).catch(() => null),
    ]).then(([plansRes, sub]) => {
      setPlans(plansRes.plans);
      setProviders(plansRes.providers);
      setSubscription(sub);
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCheckout = async (planId) => {
    setCheckoutLoading(planId);
    setError("");
    try {
      const result = await apiFetch("/api/billing/checkout", token, {
        method: "POST",
        body: JSON.stringify({ planId, provider: selectedProvider }),
      });
      if (result.url) window.location.href = result.url;
    } catch (e) {
      setError(e.message);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    try {
      const result = await apiFetch("/api/billing/portal", token, { method: "POST" });
      if (result.url) window.location.href = result.url;
    } catch (e) { setError(e.message); }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel subscription at the end of the current period?")) return;
    try {
      await apiFetch("/api/billing/cancel", token, { method: "POST" });
      alert("Subscription will cancel at period end.");
      const sub = await apiFetch("/api/billing/subscription", token);
      setSubscription(sub);
    } catch (e) { setError(e.message); }
  };

  if (loading) return <div style={{ padding: 24 }}><p style={{ color: "var(--color-text-secondary)" }}>Loading billing...</p></div>;

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 6px" }}>Billing & Plans</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: "0 0 24px" }}>
        Choose a plan and a billing provider that fits your needs.
      </p>

      {error && (
        <div style={{
          background: "#FCEBEB", color: "#A32D2D",
          padding: "10px 14px", borderRadius: "var(--border-radius-md)",
          fontSize: 12, marginBottom: 16, border: "0.5px solid #F09595",
        }}>{error}</div>
      )}

      {subscription && subscription.status === "active" && (
        <div style={{
          background: "var(--color-background-success)",
          border: "0.5px solid var(--color-border-success)",
          borderRadius: "var(--border-radius-lg)",
          padding: 16, marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-success)" }}>
              <i className="ti ti-check" aria-hidden="true" style={{ marginRight: 6 }} />
              Active subscription: {subscription.plan_id}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
              via {PROVIDER_INFO[subscription.provider]?.name || subscription.provider}
              {subscription.current_period_end && ` · Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}
              {subscription.cancel_at_period_end && " · Cancels at period end"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handlePortal} style={btnSecondary}>Manage billing</button>
            {!subscription.cancel_at_period_end && (
              <button onClick={handleCancel} style={btnDanger}>Cancel</button>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Choose billing provider
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {providers.map((p) => {
            const info = PROVIDER_INFO[p] || { name: p, note: "" };
            const selected = selectedProvider === p;
            return (
              <button key={p} onClick={() => setSelectedProvider(p)} style={{
                padding: "10px 14px", borderRadius: "var(--border-radius-md)",
                border: selected ? "0.5px solid var(--color-border-info)" : "0.5px solid var(--color-border-tertiary)",
                background: selected ? "var(--color-background-info)" : "var(--color-background-primary)",
                color: selected ? "var(--color-text-info)" : "var(--color-text-primary)",
                fontSize: 13, cursor: "pointer", textAlign: "left", minWidth: 180,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <i className={`ti ti-${info.icon}`} aria-hidden="true" style={{ fontSize: 15 }} />
                  <span style={{ fontWeight: 500 }}>{info.name}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{info.note}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {plans.map((plan) => {
          const isCurrent = subscription?.plan_id === plan.id && subscription?.status === "active";
          const isFeatured = plan.id === "pro";

          return (
            <div key={plan.id} style={{
              background: "var(--color-background-primary)",
              border: isFeatured ? "2px solid var(--color-border-info)" : "0.5px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-lg)",
              padding: 20, position: "relative",
            }}>
              {isFeatured && (
                <div style={{
                  position: "absolute", top: -10, right: 12,
                  background: "var(--color-background-info)", color: "var(--color-text-info)",
                  fontSize: 11, padding: "3px 10px", borderRadius: "var(--border-radius-md)",
                  fontWeight: 500,
                }}>Most popular</div>
              )}
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 28, fontWeight: 500 }}>${plan.price}</span>
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>/{plan.interval}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 14, paddingBottom: 14, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                {plan.maxDevices === -1 ? "Unlimited devices" : `Up to ${plan.maxDevices} devices`}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px", minHeight: 140 }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ fontSize: 12, color: "var(--color-text-primary)", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <i className="ti ti-check" aria-hidden="true" style={{ fontSize: 13, color: "#1D9E75", marginTop: 1, flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button disabled style={{
                  width: "100%", padding: 10, borderRadius: "var(--border-radius-md)",
                  background: "var(--color-background-secondary)", color: "var(--color-text-secondary)",
                  border: "0.5px solid var(--color-border-tertiary)", fontSize: 13, cursor: "default",
                }}>Current plan</button>
              ) : (
                <button onClick={() => handleCheckout(plan.id)} disabled={checkoutLoading === plan.id} style={{
                  width: "100%", padding: 10, borderRadius: "var(--border-radius-md)",
                  background: isFeatured ? "#0F6E56" : "var(--color-background-primary)",
                  color: isFeatured ? "#E1F5EE" : "var(--color-text-primary)",
                  border: isFeatured ? "none" : "0.5px solid var(--color-border-secondary)",
                  fontSize: 13, cursor: "pointer", fontWeight: 500,
                  opacity: checkoutLoading === plan.id ? 0.6 : 1,
                }}>
                  {checkoutLoading === plan.id ? "Loading..." : "Start 14-day trial"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 20, textAlign: "center" }}>
        All plans include a 14-day free trial. Cancel anytime.
        {selectedProvider !== "stripe" && " Tax included via Merchant of Record."}
      </p>
    </div>
  );
}

const btnSecondary = {
  padding: "6px 12px", borderRadius: "var(--border-radius-md)",
  background: "var(--color-background-primary)",
  border: "0.5px solid var(--color-border-secondary)",
  fontSize: 12, cursor: "pointer", color: "var(--color-text-primary)",
};

const btnDanger = {
  padding: "6px 12px", borderRadius: "var(--border-radius-md)",
  background: "#FCEBEB", color: "#A32D2D",
  border: "0.5px solid #F09595", fontSize: 12, cursor: "pointer",
};

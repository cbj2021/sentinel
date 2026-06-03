/**
 * Billing Routes — Express router for all billing endpoints
 *
 * Mounts:
 *   POST   /api/billing/checkout       — create checkout session for any provider
 *   POST   /api/billing/portal         — get customer portal URL
 *   POST   /api/billing/cancel         — cancel current subscription
 *   GET    /api/billing/subscription   — get current subscription state
 *   GET    /api/billing/plans          — list available plans
 *   POST   /api/billing/webhooks/:provider — webhook receiver (raw body)
 */

const express = require('express');
const { getProvider, getAllProviders } = require('./index');
const { getAllPlans, getPlanById } = require('./plans');

function billingRouter(db, requireAuth) {
  const router = express.Router();

  // ─── Public: list available plans ───────────────────────────────────────────
  router.get('/plans', (req, res) => {
    const plans = getAllPlans().map(p => ({
      id: p.id, name: p.name, price: p.price, currency: p.currency,
      interval: p.interval, maxDevices: p.maxDevices, features: p.features,
    }));
    res.json({ plans, providers: getAllProviders() });
  });

  // ─── Create checkout session ─────────────────────────────────────────────────
  router.post('/checkout', requireAuth, async (req, res) => {
    try {
      const { planId, provider: providerName } = req.body;
      const plan = getPlanById(planId);
      if (!plan) return res.status(400).json({ error: 'Invalid plan' });

      // Get user
      const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
      const user = userResult.rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      const provider = getProvider(providerName);
      const customerIdField = {
        stripe: 'stripe_customer_id',
        paddle: 'paddle_customer_id',
        lemonsqueezy: 'lemonsqueezy_customer_id',
      }[provider.name];

      const session = await provider.createCheckoutSession({
        userId: user.id,
        email: user.email,
        planId,
        successUrl: `${process.env.FRONTEND_URL}/billing/success`,
        cancelUrl: `${process.env.FRONTEND_URL}/billing`,
        existingCustomerId: user[customerIdField] || null,
      });

      res.json(session);
    } catch (e) {
      console.error('[Billing] Checkout error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Customer Portal (self-service: cancel, update card, change plan) ───────
  router.post('/portal', requireAuth, async (req, res) => {
    try {
      const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
      const user = userResult.rows[0];

      // Find active subscription and provider
      const subResult = await db.query(
        `SELECT * FROM subscriptions WHERE user_id = $1 AND status IN ('active','trialing','on_trial')
         ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );
      const sub = subResult.rows[0];
      if (!sub) return res.status(404).json({ error: 'No active subscription' });

      const provider = getProvider(sub.provider);
      const portal = await provider.createPortalSession({
        customerId: sub.provider_customer_id,
        returnUrl: `${process.env.FRONTEND_URL}/billing`,
      });
      res.json(portal);
    } catch (e) {
      console.error('[Billing] Portal error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Cancel subscription ─────────────────────────────────────────────────────
  router.post('/cancel', requireAuth, async (req, res) => {
    try {
      const subResult = await db.query(
        `SELECT * FROM subscriptions WHERE user_id = $1 AND status IN ('active','trialing','on_trial')
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.userId]
      );
      const sub = subResult.rows[0];
      if (!sub) return res.status(404).json({ error: 'No active subscription' });

      const provider = getProvider(sub.provider);
      await provider.cancelSubscription(sub.provider_sub_id);

      await db.query(
        `UPDATE subscriptions SET cancel_at_period_end = true, updated_at = NOW() WHERE id = $1`,
        [sub.id]
      );

      res.json({ ok: true, message: 'Subscription will cancel at period end' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Get current subscription state ─────────────────────────────────────────
  router.get('/subscription', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT s.*, u.plan AS user_plan FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE s.user_id = $1
         ORDER BY s.created_at DESC LIMIT 1`,
        [req.user.userId]
      );
      res.json(result.rows[0] || null);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Webhook receiver — supports all three providers ────────────────────────
  // NOTE: This route is mounted with raw-body middleware in server.js
  router.post('/webhooks/:provider', async (req, res) => {
    const providerName = req.params.provider;
    try {
      const provider = getProvider(providerName);
      const event = provider.verifyWebhook(req);
      await provider.handleWebhookEvent(event, db);
      res.json({ received: true });
    } catch (e) {
      console.error(`[Webhook ${providerName}] Error:`, e.message);
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

module.exports = billingRouter;

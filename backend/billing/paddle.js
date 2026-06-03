/**
 * Paddle Billing Provider (Paddle Billing — new API, not Paddle Classic)
 *
 * Paddle acts as Merchant of Record — they handle global sales tax/VAT.
 * Higher fees than Stripe (~5% + $0.50) but zero tax compliance work.
 *
 * Dashboard: https://vendors.paddle.com
 * Docs:      https://developer.paddle.com/api-reference/overview
 *
 * Auth:      Bearer token (PADDLE_API_KEY)
 * Webhooks:  HMAC-SHA256 with PADDLE_WEBHOOK_SECRET
 */

const crypto = require('crypto');
const { getPlanById, getPlanByProviderId } = require('./plans');

const PADDLE_API_BASE = process.env.PADDLE_ENV === 'production'
  ? 'https://api.paddle.com'
  : 'https://sandbox-api.paddle.com';

function ensureConfigured() {
  if (!process.env.PADDLE_API_KEY) {
    throw new Error('Paddle is not configured. Set PADDLE_API_KEY.');
  }
}

async function paddleRequest(method, path, body = null) {
  ensureConfigured();
  const res = await fetch(`${PADDLE_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
      'Paddle-Version': '1',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Paddle API error: ${JSON.stringify(data)}`);
  return data;
}

/**
 * Create a Paddle Checkout — returns a transaction with a checkout URL
 * The frontend can use Paddle.js to open the checkout overlay,
 * or you can redirect to the hosted checkout URL.
 */
async function createCheckoutSession({ userId, email, planId, successUrl, cancelUrl }) {
  const plan = getPlanById(planId);
  if (!plan) throw new Error(`Unknown plan: ${planId}`);

  const transaction = await paddleRequest('POST', '/transactions', {
    items: [{ price_id: plan.paddlePriceId, quantity: 1 }],
    customer: { email },
    custom_data: { userId: String(userId), planId },
    checkout: { url: successUrl },
  });

  return {
    url: transaction.data.checkout?.url,
    sessionId: transaction.data.id,
    transactionId: transaction.data.id,
  };
}

/**
 * Paddle uses Customer Portal for self-service. Generate a portal link.
 */
async function createPortalSession({ customerId, returnUrl }) {
  const portal = await paddleRequest('POST', `/customers/${customerId}/portal-sessions`, {
    subscription_ids: [], // empty = all subscriptions
  });
  return { url: portal.data.urls.general.overview };
}

async function cancelSubscription(subscriptionId) {
  return await paddleRequest('POST', `/subscriptions/${subscriptionId}/cancel`, {
    effective_from: 'next_billing_period',
  });
}

async function getSubscription(subscriptionId) {
  return await paddleRequest('GET', `/subscriptions/${subscriptionId}`);
}

/**
 * Verify Paddle webhook signature (HMAC-SHA256)
 * Paddle sends: paddle-signature: ts=<ts>;h1=<signature>
 */
function verifyWebhook(req) {
  const sigHeader = req.headers['paddle-signature'];
  if (!sigHeader) throw new Error('Missing paddle-signature header');

  const parts = Object.fromEntries(sigHeader.split(';').map(p => p.split('=')));
  const { ts, h1 } = parts;
  if (!ts || !h1) throw new Error('Malformed paddle-signature');

  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) throw new Error('PADDLE_WEBHOOK_SECRET is not set');

  const rawBody = req.rawBody.toString('utf8');
  const signed = `${ts}:${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(h1))) {
    throw new Error('Invalid Paddle webhook signature');
  }

  return JSON.parse(rawBody);
}

/**
 * Handle Paddle webhook events
 * Event types: subscription.created, subscription.updated, subscription.canceled, transaction.paid, etc.
 */
async function handleWebhookEvent(event, db) {
  const eventType = event.event_type;
  const data = event.data;

  switch (eventType) {
    case 'subscription.created':
    case 'subscription.updated':
    case 'subscription.activated': {
      const userId = parseInt(data.custom_data?.userId);
      const priceId = data.items?.[0]?.price?.id;
      const plan = getPlanByProviderId('paddle', priceId);
      const planId = plan ? plan.id : data.custom_data?.planId;

      if (!userId) {
        console.warn('[Paddle] Subscription event without userId in custom_data');
        return;
      }

      await db.query(
        `UPDATE users SET paddle_customer_id = $1 WHERE id = $2`,
        [data.customer_id, userId]
      );

      const periodEnd = data.current_billing_period?.ends_at;
      const cancelAtEnd = data.scheduled_change?.action === 'cancel';

      await db.query(
        `INSERT INTO subscriptions
          (user_id, provider, provider_sub_id, provider_customer_id, plan_id, status, current_period_end, cancel_at_period_end, created_at, updated_at)
         VALUES ($1, 'paddle', $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (provider_sub_id) DO UPDATE SET
           status = EXCLUDED.status,
           plan_id = EXCLUDED.plan_id,
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           updated_at = NOW()`,
        [userId, data.id, data.customer_id, planId, data.status, periodEnd, cancelAtEnd]
      );

      if (data.status === 'active' || data.status === 'trialing') {
        await db.query(`UPDATE users SET plan = $1 WHERE id = $2`, [planId, userId]);
      }
      console.log(`[Paddle] Subscription ${data.id} ${eventType}: ${data.status}`);
      break;
    }

    case 'subscription.canceled': {
      const userId = parseInt(data.custom_data?.userId);
      await db.query(
        `UPDATE subscriptions SET status = 'canceled', updated_at = NOW() WHERE provider_sub_id = $1`,
        [data.id]
      );
      if (userId) {
        await db.query(`UPDATE users SET plan = 'free' WHERE id = $1`, [userId]);
      }
      console.log(`[Paddle] Subscription ${data.id} canceled`);
      break;
    }

    case 'transaction.payment_failed': {
      console.warn(`[Paddle] Payment failed for transaction ${data.id}`);
      break;
    }

    default:
      console.log(`[Paddle] Unhandled event: ${eventType}`);
  }
}

module.exports = {
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
  getSubscription,
  verifyWebhook,
  handleWebhookEvent,
};

/**
 * Lemon Squeezy Billing Provider
 *
 * Also a Merchant of Record (handles global tax). Simpler than Paddle,
 * popular with indie SaaS. ~5% + $0.50 per transaction.
 *
 * Dashboard: https://app.lemonsqueezy.com
 * Docs:      https://docs.lemonsqueezy.com/api
 *
 * Auth:      Bearer token (LEMONSQUEEZY_API_KEY)
 * Webhooks:  HMAC-SHA256 signature with LEMONSQUEEZY_WEBHOOK_SECRET
 */

const crypto = require('crypto');
const { getPlanById, getPlanByProviderId } = require('./plans');

const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';

function ensureConfigured() {
  if (!process.env.LEMONSQUEEZY_API_KEY) {
    throw new Error('Lemon Squeezy is not configured. Set LEMONSQUEEZY_API_KEY.');
  }
}

async function lsRequest(method, path, body = null) {
  ensureConfigured();
  const res = await fetch(`${LS_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Lemon Squeezy API error: ${JSON.stringify(data)}`);
  return data;
}

/**
 * Create a Lemon Squeezy checkout URL.
 * LS uses a "checkout" object that returns a hosted URL.
 */
async function createCheckoutSession({ userId, email, planId, successUrl, cancelUrl }) {
  const plan = getPlanById(planId);
  if (!plan) throw new Error(`Unknown plan: ${planId}`);

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) throw new Error('LEMONSQUEEZY_STORE_ID is not set');

  const checkout = await lsRequest('POST', '/checkouts', {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email,
          custom: { userId: String(userId), planId },
        },
        product_options: {
          redirect_url: successUrl,
          receipt_button_text: 'Return to Sentinel',
          receipt_thank_you_note: 'Thanks for protecting your endpoints with Sentinel!',
        },
        checkout_options: {
          embed: false,
          media: true,
          logo: true,
        },
      },
      relationships: {
        store: { data: { type: 'stores', id: storeId } },
        variant: { data: { type: 'variants', id: plan.lemonSqueezyVariantId } },
      },
    },
  });

  return {
    url: checkout.data.attributes.url,
    sessionId: checkout.data.id,
  };
}

/**
 * LS has a Customer Portal — generate a signed URL for a customer.
 */
async function createPortalSession({ customerId, returnUrl }) {
  const customer = await lsRequest('GET', `/customers/${customerId}`);
  // LS provides a customer_portal URL in the customer object
  return { url: customer.data.attributes.urls.customer_portal };
}

async function cancelSubscription(subscriptionId) {
  return await lsRequest('DELETE', `/subscriptions/${subscriptionId}`);
}

async function getSubscription(subscriptionId) {
  return await lsRequest('GET', `/subscriptions/${subscriptionId}`);
}

/**
 * Verify LS webhook signature (HMAC-SHA256 of raw body)
 */
function verifyWebhook(req) {
  const signature = req.headers['x-signature'];
  if (!signature) throw new Error('Missing x-signature header');

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) throw new Error('LEMONSQUEEZY_WEBHOOK_SECRET is not set');

  const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new Error('Invalid Lemon Squeezy webhook signature');
  }

  return JSON.parse(req.rawBody.toString('utf8'));
}

/**
 * Handle Lemon Squeezy webhook events
 * Types: subscription_created, subscription_updated, subscription_cancelled,
 *        subscription_payment_failed, order_created, etc.
 */
async function handleWebhookEvent(event, db) {
  const eventName = event.meta?.event_name;
  const data = event.data?.attributes || {};
  const customData = event.meta?.custom_data || {};

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed': {
      const userId = parseInt(customData.userId);
      if (!userId) {
        console.warn('[LemonSqueezy] Event without userId in custom_data');
        return;
      }

      const variantId = String(data.variant_id);
      const plan = getPlanByProviderId('lemonsqueezy', variantId);
      const planId = plan ? plan.id : customData.planId;

      await db.query(
        `UPDATE users SET lemonsqueezy_customer_id = $1 WHERE id = $2`,
        [data.customer_id, userId]
      );

      await db.query(
        `INSERT INTO subscriptions
          (user_id, provider, provider_sub_id, provider_customer_id, plan_id, status, current_period_end, cancel_at_period_end, created_at, updated_at)
         VALUES ($1, 'lemonsqueezy', $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (provider_sub_id) DO UPDATE SET
           status = EXCLUDED.status,
           plan_id = EXCLUDED.plan_id,
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           updated_at = NOW()`,
        [
          userId,
          String(event.data.id),
          String(data.customer_id),
          planId,
          data.status,
          data.renews_at,
          data.cancelled || false,
        ]
      );

      if (data.status === 'active' || data.status === 'on_trial') {
        await db.query(`UPDATE users SET plan = $1 WHERE id = $2`, [planId, userId]);
      }
      console.log(`[LemonSqueezy] Subscription ${event.data.id} ${eventName}: ${data.status}`);
      break;
    }

    case 'subscription_cancelled':
    case 'subscription_expired': {
      const userId = parseInt(customData.userId);
      await db.query(
        `UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE provider_sub_id = $2`,
        [eventName === 'subscription_expired' ? 'expired' : 'canceled', String(event.data.id)]
      );
      if (userId) {
        await db.query(`UPDATE users SET plan = 'free' WHERE id = $1`, [userId]);
      }
      console.log(`[LemonSqueezy] Subscription ${event.data.id} ${eventName}`);
      break;
    }

    case 'subscription_payment_failed': {
      console.warn(`[LemonSqueezy] Payment failed for sub ${event.data.id}`);
      break;
    }

    default:
      console.log(`[LemonSqueezy] Unhandled event: ${eventName}`);
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

/**
 * Stripe Billing Provider
 *
 * Uses Stripe Checkout Sessions for new subscriptions and Customer Portal
 * for self-service management (cancel, change plan, update card).
 *
 * Dashboard: https://dashboard.stripe.com
 * Docs:      https://stripe.com/docs/billing/subscriptions/build-subscriptions
 */

const Stripe = require('stripe');
const { getPlanById, getPlanByProviderId } = require('./plans');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  : null;

function ensureClient() {
  if (!stripe) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
}

/**
 * Create a Stripe Checkout Session for a new subscription
 * Returns a hosted Stripe URL to redirect the user to
 */
async function createCheckoutSession({ userId, email, planId, successUrl, cancelUrl, existingCustomerId }) {
  ensureClient();
  const plan = getPlanById(planId);
  if (!plan) throw new Error(`Unknown plan: ${planId}`);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    customer: existingCustomerId || undefined,
    customer_email: existingCustomerId ? undefined : email,
    client_reference_id: String(userId),
    metadata: { userId: String(userId), planId },
    subscription_data: {
      metadata: { userId: String(userId), planId },
      trial_period_days: 14, // 14-day free trial
    },
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Create a Customer Portal session for self-service billing management
 */
async function createPortalSession({ customerId, returnUrl }) {
  ensureClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

async function cancelSubscription(subscriptionId) {
  ensureClient();
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

async function getSubscription(subscriptionId) {
  ensureClient();
  return await stripe.subscriptions.retrieve(subscriptionId);
}

/**
 * Verify webhook signature and parse event
 */
function verifyWebhook(req) {
  ensureClient();
  const signature = req.headers['stripe-signature'];
  if (!signature) throw new Error('Missing stripe-signature header');

  return stripe.webhooks.constructEvent(
    req.rawBody, // requires raw body middleware
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

/**
 * Handle a verified Stripe webhook event — update DB accordingly
 */
async function handleWebhookEvent(event, db) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = parseInt(session.client_reference_id);
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      await db.query(
        `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, userId]
      );

      // Subscription details will arrive in subscription.created event
      console.log(`[Stripe] Checkout completed for user ${userId}, sub ${subscriptionId}`);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const userId = parseInt(sub.metadata.userId);
      const priceId = sub.items.data[0]?.price.id;
      const plan = getPlanByProviderId('stripe', priceId);
      const planId = plan ? plan.id : sub.metadata.planId;

      await db.query(
        `INSERT INTO subscriptions
          (user_id, provider, provider_sub_id, provider_customer_id, plan_id, status, current_period_end, cancel_at_period_end, created_at, updated_at)
         VALUES ($1, 'stripe', $2, $3, $4, $5, to_timestamp($6), $7, NOW(), NOW())
         ON CONFLICT (provider_sub_id) DO UPDATE SET
           status = EXCLUDED.status,
           plan_id = EXCLUDED.plan_id,
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           updated_at = NOW()`,
        [userId, sub.id, sub.customer, planId, sub.status, sub.current_period_end, sub.cancel_at_period_end]
      );

      // Update user's plan field
      if (sub.status === 'active' || sub.status === 'trialing') {
        await db.query(`UPDATE users SET plan = $1 WHERE id = $2`, [planId, userId]);
      }
      console.log(`[Stripe] Subscription ${sub.id} updated: ${sub.status}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = parseInt(sub.metadata.userId);
      await db.query(
        `UPDATE subscriptions SET status = 'canceled', updated_at = NOW() WHERE provider_sub_id = $1`,
        [sub.id]
      );
      await db.query(`UPDATE users SET plan = 'free' WHERE id = $1`, [userId]);
      console.log(`[Stripe] Subscription ${sub.id} canceled`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.warn(`[Stripe] Payment failed for customer ${invoice.customer}, amount ${invoice.amount_due}`);
      // Trigger notification to user about failed payment
      break;
    }

    default:
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
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

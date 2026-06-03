/**
 * Sentinel Pricing Plans
 *
 * Each plan has provider-specific IDs that you populate after creating
 * the product/price in each billing platform.
 *
 * Setup:
 * - Stripe:        Create Products in Stripe Dashboard → copy price IDs
 * - Paddle:        Create Products in Paddle Dashboard → copy price IDs
 * - Lemon Squeezy: Create Products in LS Dashboard → copy variant IDs
 */

const PLANS = {
  starter: {
    name: 'Starter',
    price: 19,
    currency: 'USD',
    interval: 'month',
    maxDevices: 3,
    features: [
      'Up to 3 devices',
      'Real-time threat scanning',
      'Email alerts',
      'Basic dashboard',
    ],
    // Provider-specific IDs (set after creating products in each platform)
    stripePriceId: process.env.STRIPE_PRICE_STARTER || 'price_xxx_starter',
    paddlePriceId: process.env.PADDLE_PRICE_STARTER || 'pri_xxx_starter',
    lemonSqueezyVariantId: process.env.LEMONSQUEEZY_VARIANT_STARTER || 'xxxx',
  },
  pro: {
    name: 'Pro',
    price: 49,
    currency: 'USD',
    interval: 'month',
    maxDevices: 10,
    features: [
      'Up to 10 devices',
      'Everything in Starter',
      'Network anomaly detection',
      'Auto-quarantine',
      'SMS alerts',
      'API access',
    ],
    stripePriceId: process.env.STRIPE_PRICE_PRO || 'price_xxx_pro',
    paddlePriceId: process.env.PADDLE_PRICE_PRO || 'pri_xxx_pro',
    lemonSqueezyVariantId: process.env.LEMONSQUEEZY_VARIANT_PRO || 'xxxx',
  },
  business: {
    name: 'Business',
    price: 99,
    currency: 'USD',
    interval: 'month',
    maxDevices: -1, // unlimited
    features: [
      'Unlimited devices',
      'Everything in Pro',
      'Compliance reports (SOC 2, HIPAA)',
      'Priority support',
      'Custom integrations',
      'Dedicated account manager',
    ],
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS || 'price_xxx_business',
    paddlePriceId: process.env.PADDLE_PRICE_BUSINESS || 'pri_xxx_business',
    lemonSqueezyVariantId: process.env.LEMONSQUEEZY_VARIANT_BUSINESS || 'xxxx',
  },
};

function getPlanById(planId) {
  return PLANS[planId] || null;
}

function getAllPlans() {
  return Object.entries(PLANS).map(([id, plan]) => ({ id, ...plan }));
}

function getPlanByProviderId(provider, providerId) {
  const idField = {
    stripe: 'stripePriceId',
    paddle: 'paddlePriceId',
    lemonsqueezy: 'lemonSqueezyVariantId',
  }[provider];
  if (!idField) return null;

  for (const [id, plan] of Object.entries(PLANS)) {
    if (plan[idField] === providerId) return { id, ...plan };
  }
  return null;
}

module.exports = { PLANS, getPlanById, getAllPlans, getPlanByProviderId };

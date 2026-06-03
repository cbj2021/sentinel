/**
 * Billing Provider Factory
 *
 * Returns the configured billing provider. Switch providers by changing
 * the BILLING_PROVIDER environment variable: 'stripe' | 'paddle' | 'lemonsqueezy'
 *
 * All providers implement the same interface:
 *   - createCheckoutSession({ userId, email, planId, successUrl, cancelUrl })
 *   - createPortalSession({ customerId, returnUrl })
 *   - cancelSubscription(subscriptionId)
 *   - getSubscription(subscriptionId)
 *   - verifyWebhook(req)        — returns parsed event or throws
 *   - handleWebhookEvent(event, db) — updates DB based on event
 */

const stripe = require('./stripe');
const paddle = require('./paddle');
const lemonsqueezy = require('./lemonsqueezy');

const PROVIDERS = { stripe, paddle, lemonsqueezy };

function getProvider(name = null) {
  const providerName = name || process.env.BILLING_PROVIDER || 'stripe';
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown billing provider: ${providerName}. Use one of: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return { name: providerName, ...provider };
}

function getAllProviders() {
  return Object.keys(PROVIDERS);
}

module.exports = { getProvider, getAllProviders };

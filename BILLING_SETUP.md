# 💳 Sentinel Billing Setup Guide

This guide covers setting up subscription billing with **all three supported providers**:
Stripe, Paddle, and Lemon Squeezy. You can use one or offer all three at checkout.

---

## 🔄 Switching Providers

The platform supports all three providers simultaneously. Users pick at checkout.
Default provider is set in `.env`:

```bash
BILLING_PROVIDER=stripe   # or 'paddle' or 'lemonsqueezy'
```

---

## 1️⃣ Stripe Setup (Recommended for most cases)

**Best for:** US/EU SaaS where you're OK handling sales tax. Cheapest fees (~2.9% + $0.30).

### Steps
1. Sign up at [stripe.com](https://stripe.com)
2. In **Dashboard → Developers → API keys**, copy your **Secret key** → `STRIPE_SECRET_KEY`
3. **Dashboard → Products → + Add product**. Create three products:
   - **Starter** — $19/month recurring → copy the price ID (starts with `price_`) → `STRIPE_PRICE_STARTER`
   - **Pro** — $49/month recurring → `STRIPE_PRICE_PRO`
   - **Business** — $99/month recurring → `STRIPE_PRICE_BUSINESS`
4. **Dashboard → Developers → Webhooks → + Add endpoint**
   - URL: `https://your-api-domain.com/api/billing/webhooks/stripe`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Copy **Signing secret** (starts with `whsec_`) → `STRIPE_WEBHOOK_SECRET`
5. **Dashboard → Settings → Billing → Customer portal** — enable it (allows users to self-manage)

### Local testing
Use the [Stripe CLI](https://stripe.com/docs/stripe-cli):
```bash
stripe listen --forward-to localhost:3001/api/billing/webhooks/stripe
# This prints a whsec_xxx — use this as your STRIPE_WEBHOOK_SECRET locally
```

---

## 2️⃣ Paddle Setup (Merchant of Record — no tax headaches)

**Best for:** Global SaaS where you want Paddle to handle all sales tax/VAT compliance.
Higher fees (~5% + $0.50) but zero tax filing work.

### Steps
1. Sign up at [paddle.com](https://paddle.com) — apply for vendor account (24-48hr approval)
2. **Paddle Dashboard → Developer Tools → Authentication → Create API Key**
   - Copy → `PADDLE_API_KEY`
3. **Catalog → Products → New** — create three products:
   - **Starter** ($19/mo) — copy the price ID (starts with `pri_`) → `PADDLE_PRICE_STARTER`
   - **Pro** ($49/mo) → `PADDLE_PRICE_PRO`
   - **Business** ($99/mo) → `PADDLE_PRICE_BUSINESS`
4. **Developer Tools → Notifications → New destination**
   - URL: `https://your-api-domain.com/api/billing/webhooks/paddle`
   - Events: `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.canceled`, `transaction.payment_failed`
   - Copy **Notification secret** → `PADDLE_WEBHOOK_SECRET`
5. Set `PADDLE_ENV=sandbox` for testing, `PADDLE_ENV=production` when live

### Frontend integration (optional)
For an embedded checkout overlay (better UX than redirect), add Paddle.js to your dashboard:
```html
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
```
Then call `Paddle.Checkout.open({ items: [...] })` with the transaction returned from the backend.

---

## 3️⃣ Lemon Squeezy Setup (Simplest MoR)

**Best for:** Indie SaaS / solo founders who want fast setup and tax handled.
Same fees as Paddle (~5% + $0.50) but simpler dashboard.

### Steps
1. Sign up at [lemonsqueezy.com](https://lemonsqueezy.com)
2. Create your store (one-time setup)
3. **Settings → API → Create API key** → copy → `LEMONSQUEEZY_API_KEY`
4. **Settings → General** — copy your **Store ID** → `LEMONSQUEEZY_STORE_ID`
5. **Store → Products → New product** — for each plan create a subscription product:
   - **Starter** ($19/mo) → save → click into the variant → copy the **Variant ID** → `LEMONSQUEEZY_VARIANT_STARTER`
   - **Pro** ($49/mo) → `LEMONSQUEEZY_VARIANT_PRO`
   - **Business** ($99/mo) → `LEMONSQUEEZY_VARIANT_BUSINESS`
6. **Settings → Webhooks → + Create webhook**
   - URL: `https://your-api-domain.com/api/billing/webhooks/lemonsqueezy`
   - Events: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_payment_failed`
   - Copy the **Signing secret** → `LEMONSQUEEZY_WEBHOOK_SECRET`

---

## 🧪 Testing Locally

For local webhook testing, expose your local backend with [ngrok](https://ngrok.com):

```bash
ngrok http 3001
# Use the https URL ngrok gives you in each provider's webhook config
```

Or specifically for Stripe:
```bash
stripe listen --forward-to localhost:3001/api/billing/webhooks/stripe
```

---

## 📊 Comparison

| Feature              | Stripe          | Paddle             | Lemon Squeezy      |
|----------------------|-----------------|---------------------|---------------------|
| Fees                 | 2.9% + $0.30    | ~5% + $0.50         | 5% + $0.50          |
| Sales tax / VAT      | **You handle**  | **They handle**     | **They handle**     |
| Approval time        | Instant         | 24-48 hours         | Instant             |
| Developer experience | Excellent       | Good                | Good                |
| Best for             | Most flexible   | Global enterprise   | Indie / solo SaaS   |
| 1099-K issuance      | Issued by you   | Not needed (MoR)    | Not needed (MoR)    |

---

## 🚀 Going Live Checklist

Before accepting real money:
- [ ] Replace all test API keys with production keys
- [ ] Update webhook URLs to your production domain
- [ ] Verify webhook signatures are validating (check server logs)
- [ ] Set `NODE_ENV=production`
- [ ] Test a real $1 charge end-to-end (create test product at low price)
- [ ] Set up payment failure handling — emails to user when card fails
- [ ] Add Terms of Service and Privacy Policy links to your checkout
- [ ] (Stripe only) Register for sales tax in states where required, or use Stripe Tax

---

## 💡 Recommendation by Stage

- **MVP / first 100 customers** → Lemon Squeezy (fastest setup, handles tax)
- **Growth stage** → Stripe (most control, lowest fees, best devex)
- **Global enterprise** → Paddle (MoR, enterprise contracts, dunning management)

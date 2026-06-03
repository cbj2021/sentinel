# ☁️ Sentinel on Google Cloud Platform — Complete Setup Guide

This guide walks you through deploying Sentinel to GCP from zero, including the answer to a question you may have:

## 🖥️ How many VMs do I need?

**Zero.** This is a serverless architecture. No VMs to patch, no SSH, no `apt-get update` ever.

| Component | Service | What it actually is |
|-----------|---------|---------------------|
| Backend API | **Cloud Run** | Serverless container — scales 0 → 1000 automatically |
| Database | **Cloud SQL** (or Neon) | Managed PostgreSQL — Google patches it |
| Dashboard | **Firebase Hosting** | Global CDN for the React build |
| Secrets | **Secret Manager** | Encrypted env vars, auto-rotated |
| Logs | **Cloud Logging** | Free, automatic, searchable |

If you ever need full VM control (rare), you'd use Compute Engine — but for Sentinel, Cloud Run is the right choice. It only charges you when requests come in.

---

## 💰 Monthly cost at different stages

| Stage | Devices | Monthly cost |
|-------|---------|--------------|
| Just testing | 1–10 | **$0** (free tier covers it) |
| First paying customers | 50–500 | **$15–40** |
| Real business | 1k–10k | **$80–250** |
| Scaling up | 50k+ | **$500–2,000** |

Cloud Run scales to zero when idle, so you only pay for real traffic. Cloud SQL is the biggest fixed cost (~$10/mo minimum). Many people skip it and use Neon's free tier instead.

---

## 📋 One-time setup (15 minutes)

### Step 1 — Create a GCP account and project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Sign up — Google gives you $300 in free credits for 90 days
3. Create a new project. Name it `sentinel-prod` (or anything you like)
4. Note your **Project ID** (it's different from the name — usually has a random suffix)
5. Enable billing on the project (required even for free-tier usage)

### Step 2 — Install the gcloud CLI on your Mac

```bash
# Install via Homebrew (easiest on Mac)
brew install --cask google-cloud-sdk

# Or download installer: https://cloud.google.com/sdk/docs/install
```

Then authenticate and set your project:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Step 3 — Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com
```

That enables Cloud Run, Cloud Build (compiles your container), Artifact Registry (stores containers), Secret Manager, and Cloud SQL.

### Step 4 — Choose your database

**Option A: Neon (recommended for starting out)** — free tier, no GCP setup needed
1. Go to [neon.tech](https://neon.tech), sign up free
2. Create a new project, choose a region close to your GCP region
3. Copy the connection string (looks like `postgresql://user:pass@ep-xxx.neon.tech/sentinel`)
4. That's your `DATABASE_URL` in `.env`

**Option B: Cloud SQL (when you outgrow Neon)** — ~$10/month minimum
```bash
gcloud sql instances create sentinel-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-size=10GB \
  --root-password=YOUR_STRONG_PASSWORD

gcloud sql databases create sentinel --instance=sentinel-db

# Get the connection name for the connection string
gcloud sql instances describe sentinel-db --format='value(connectionName)'
```

Your `DATABASE_URL` becomes:
```
postgresql://postgres:YOUR_PASSWORD@/sentinel?host=/cloudsql/PROJECT:REGION:sentinel-db
```

### Step 5 — Apply database schema

```bash
cd sentinel/backend
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f schema-billing.sql
```

(If you don't have `psql` installed locally: `brew install postgresql` on Mac, or use the Neon web SQL editor to paste the schema files.)

### Step 6 — Fill in your `.env` file

```bash
cd sentinel/backend
cp .env.example .env
nano .env   # or open in any editor
```

Required values:
- `DATABASE_URL` — from step 4
- `JWT_SECRET` — generate with: `openssl rand -base64 48`
- `AGENT_API_KEY` — generate with: `openssl rand -base64 32`
- `FRONTEND_URL` — you'll set this after the first deploy

Optional but recommended:
- `SENDGRID_API_KEY` — get free at [sendgrid.com](https://sendgrid.com) for email alerts
- `STRIPE_SECRET_KEY` and price IDs (see `BILLING_SETUP.md`)

### Step 7 — Deploy with one command

```bash
cd sentinel
bash deploy.sh gcp all
```

This script will:
1. ✓ Apply your database schemas
2. ✓ Enable required GCP APIs
3. ✓ Build your backend container and deploy to Cloud Run
4. ✓ Build your React dashboard
5. ✓ Deploy to Firebase Hosting (if `firebase` CLI installed)
6. ✓ Print all your webhook URLs to copy into billing providers

**First run takes about 5–8 minutes** (Cloud Build is slow the first time, fast after).

---

## 🔧 Modifying the running application

Once it's deployed, making changes is fast:

### Update the backend code
```bash
# After editing any file in backend/
bash deploy.sh gcp deploy
# Takes ~90 seconds — Cloud Build caches dependencies
```

### Update the dashboard
```bash
cd dashboard
npm run build
firebase deploy --only hosting
# Takes ~30 seconds
```

### Update environment variables (no redeploy needed)
```bash
gcloud run services update sentinel-api \
  --region us-central1 \
  --update-env-vars STRIPE_SECRET_KEY=sk_live_NEW_KEY
```

### View logs in real time
```bash
gcloud run services logs tail sentinel-api --region us-central1
```

### Roll back if something breaks
```bash
# List revisions
gcloud run revisions list --service sentinel-api --region us-central1

# Roll back to previous revision
gcloud run services update-traffic sentinel-api \
  --to-revisions PREVIOUS_REVISION_NAME=100 \
  --region us-central1
```

---

## 🔒 Production hardening checklist

Before accepting real users:

- [ ] Move secrets from env vars to **Secret Manager** (more secure than env vars):
  ```bash
  echo -n "your_jwt_secret" | gcloud secrets create jwt-secret --data-file=-
  gcloud run services update sentinel-api \
    --update-secrets JWT_SECRET=jwt-secret:latest
  ```
- [ ] Set up a custom domain in Cloud Run (Settings → Domain Mappings)
- [ ] Enable Cloud Armor for DDoS protection (~$5/month for basic rules)
- [ ] Set up monitoring alerts in Cloud Monitoring (free)
- [ ] Configure backups for Cloud SQL (one-line, in instance settings)
- [ ] Rotate `AGENT_API_KEY` after any team member leaves
- [ ] Add rate limiting via `express-rate-limit` to the backend
- [ ] Enable Cloud Run's "Require authentication" if you don't want public access yet

---

## 🆚 Cloud Run vs Compute Engine VMs

If you're wondering whether to use VMs instead, here's the comparison:

| | Cloud Run (chosen) | Compute Engine VMs |
|---|---|---|
| Setup time | 5 minutes | 2–4 hours |
| Cost at zero traffic | **$0** | $20+/month per VM |
| Scaling | **Automatic** (0 → 1000) | You manage manually |
| OS patching | **Google does it** | You SSH in and run apt-get |
| HTTPS / SSL | **Free, automatic** | You configure Let's Encrypt |
| Deployment | One command | Git pull + restart + pray |
| Right for | **99% of SaaS apps** | Specialized workloads |

The only reason to choose VMs for Sentinel would be if you need to run something that doesn't fit in a stateless container — but the agent is the only stateful piece, and that runs on customers' machines, not yours.

---

## 🐛 Troubleshooting

**Cloud Build fails with "permission denied"**
```bash
# Grant Cloud Build service account access
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com \
  --role=roles/run.admin
```

**Cloud Run can't reach Cloud SQL**
Add the Cloud SQL connection at deploy time:
```bash
gcloud run services update sentinel-api \
  --add-cloudsql-instances PROJECT:REGION:sentinel-db
```

**Webhooks aren't being received**
Check Cloud Run logs:
```bash
gcloud run services logs tail sentinel-api --region us-central1 --limit 50
```
Look for `[Webhook stripe] Error: Invalid signature` — usually means `STRIPE_WEBHOOK_SECRET` is wrong.

**Dashboard shows "Failed to fetch"**
The `VITE_API_URL` was set to the wrong backend URL at build time. Rebuild:
```bash
cd dashboard
echo "VITE_API_URL=https://your-actual-backend.run.app" > .env.local
npm run build
firebase deploy --only hosting
```

---

## 📞 Going further

- [Cloud Run docs](https://cloud.google.com/run/docs)
- [Firebase Hosting docs](https://firebase.google.com/docs/hosting)
- [Neon Postgres docs](https://neon.tech/docs)
- Run `gcloud run services describe sentinel-api --region us-central1` to see all settings

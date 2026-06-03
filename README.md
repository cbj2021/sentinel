# 🛡️ Sentinel — Endpoint Cybersecurity Platform

A full-stack cybersecurity SaaS platform for monitoring and protecting macOS and Windows devices.
Built on **non-AWS infrastructure** (GCP or Azure).

---

## Architecture

```
sentinel/
├── agent/          # Node.js daemon — runs on each Mac/Windows device
├── backend/        # Node.js + Express API — hosted on GCP/Azure
└── dashboard/      # React + Vite frontend — hosted on Vercel/Netlify
```

---

## 🚀 Quick Start (Local Development)

### 1. Database (PostgreSQL)

Use [Neon.tech](https://neon.tech) (free tier) or [Supabase](https://supabase.com):

```bash
# Apply schema
psql YOUR_DATABASE_URL -f backend/schema.sql
```

### 2. Backend API

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and secrets
npm install
npm run dev
# Runs on http://localhost:3001
```

### 3. Dashboard (React)

```bash
cd dashboard
npm install
# Create .env.local:
echo "VITE_API_URL=http://localhost:3001" > .env.local
npm run dev
# Runs on http://localhost:5173
```

### 4. Agent (on the device you want to protect)

```bash
cd agent
npm install
# Edit config.json with your backend URL and agent API key
node agent.js
```

---

## 🔑 Key Features

### Agent (Mac + Windows)
- **File System Watcher** — real-time monitoring with `chokidar`
- **Malware Hash Detection** — MD5 matching against known threat DB
- **Ransomware Detection** — burst file-encryption pattern recognition
- **Network Monitor** — detects C2 connections, blocklisted IPs, suspicious ports
- **Process Monitor** — flags LOLBin chains (Word→PowerShell, etc.)
- **Auto-Quarantine** — moves critical threats automatically
- **Cross-platform** — single codebase runs on both macOS and Windows

### Backend API
- JWT authentication for dashboard users
- Agent API key authentication for agents
- PostgreSQL storage (compatible with Neon, Supabase, GCP Cloud SQL, Azure PostgreSQL)
- REST endpoints for threats, events, devices, and actions
- Designed for GCP Cloud Run or Azure App Service

### Dashboard
- Real-time overview with threat counts and device health
- Threat management with quarantine/resolve actions
- Device inventory showing Mac and Windows endpoints
- Event feed for network and process anomalies
- Login/register with organization support

---

## ☁️ Production Deployment (Non-AWS)

### Backend → Google Cloud Run
```bash
cd backend
gcloud run deploy sentinel-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_URL=...,JWT_SECRET=...,AGENT_API_KEY=...
```

### Backend → Azure App Service
```bash
az webapp up --name sentinel-api --runtime "NODE:18-lts"
az webapp config appsettings set --name sentinel-api \
  --settings DATABASE_URL=... JWT_SECRET=... AGENT_API_KEY=...
```

### Dashboard → Vercel (free)
```bash
cd dashboard
vercel --prod
# Set VITE_API_URL to your backend URL in Vercel env vars
```

### Agent → Packaged Executable
```bash
cd agent
npm install -g pkg
npm run pkg:mac    # → dist/sentinel-agent-mac (Apple Silicon)
npm run pkg:win    # → dist/sentinel-agent-win.exe
```

---

## 💰 Monetization (SaaS)

| Plan      | Price     | Devices | Features                        |
|-----------|-----------|---------|----------------------------------|
| Starter   | $19/month | 1–3     | Basic scanning, dashboard        |
| Pro       | $49/month | up to 10| + Network monitor, auto-quarantine|
| Business  | $99/month | Unlimited| + Reports, priority support      |

Add Stripe billing by integrating `stripe` npm package into the backend.

---

## 🔒 Security Notes

- Change `JWT_SECRET` and `AGENT_API_KEY` before deploying
- Use HTTPS in production (GCP/Azure provide SSL automatically)
- Rotate agent API keys regularly
- Enable PostgreSQL SSL in production (set `ssl: true` in db config)
- Consider adding rate limiting (`express-rate-limit`) to the API

---

## 📦 Tech Stack

| Layer     | Technology                          |
|-----------|--------------------------------------|
| Agent     | Node.js, chokidar, native OS tools   |
| Backend   | Node.js, Express, PostgreSQL, JWT    |
| Frontend  | React, Vite, Recharts                |
| Database  | PostgreSQL (Neon / Supabase)         |
| Cloud     | GCP Cloud Run OR Azure App Service   |
| Auth      | JWT + bcrypt                         |
| Billing   | Stripe (add-on)                      |

#!/usr/bin/env bash
# =============================================================
# Sentinel — Deployment Script
# Supports: GCP Cloud Run  |  Azure App Service
# Usage: bash deploy.sh [gcp|azure] [setup|deploy|all]
# =============================================================

set -e

PLATFORM="${1:-gcp}"
ACTION="${2:-all}"
APP_NAME="sentinel-api"
REGION="us-central1"     # GCP region
AZURE_LOCATION="eastus"  # Azure region

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[sentinel]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── Load .env ────────────────────────────────────────────────────────────────
load_env() {
  if [ ! -f backend/.env ]; then
    error "backend/.env not found. Copy backend/.env.example → backend/.env and fill in values."
  fi
  set -a
  source backend/.env
  set +a
  [ -z "$DATABASE_URL" ] && error "DATABASE_URL not set in backend/.env"
  [ -z "$JWT_SECRET" ]   && error "JWT_SECRET not set in backend/.env"
  [ -z "$AGENT_API_KEY" ] && error "AGENT_API_KEY not set in backend/.env"
  success "Environment loaded"
}

# ─── Database setup ───────────────────────────────────────────────────────────
setup_database() {
  info "Running database migrations..."
  if ! command -v psql &>/dev/null; then
    warn "psql not found — apply schema files manually to your database:"
    warn "  psql \$DATABASE_URL -f backend/schema.sql"
    warn "  psql \$DATABASE_URL -f backend/schema-billing.sql"
    return
  fi
  psql "$DATABASE_URL" -f backend/schema.sql
  success "Core schema applied"
  psql "$DATABASE_URL" -f backend/schema-billing.sql
  success "Billing schema applied"
}

# ─── Build dashboard ─────────────────────────────────────────────────────────
build_dashboard() {
  info "Building React dashboard..."
  cd dashboard
  echo "VITE_API_URL=${FRONTEND_API_URL:-https://$APP_NAME.run.app}" > .env.local
  npm install --silent
  npm run build
  cd ..
  success "Dashboard built → dashboard/dist/"
}

# ─── Build env-vars string for cloud deploy ──────────────────────────────────
build_env_vars() {
  # Helper to build comma-separated KEY=VALUE pairs, escaping commas in values
  local vars=""
  add() { local k="$1" v="$2"; [ -n "$v" ] && vars+="$k=${v//,/\\,},"; }

  add NODE_ENV "production"
  add FRONTEND_URL "${FRONTEND_URL}"
  add DATABASE_URL "${DATABASE_URL}"
  add JWT_SECRET "${JWT_SECRET}"
  add AGENT_API_KEY "${AGENT_API_KEY}"

  # Billing
  add BILLING_PROVIDER "${BILLING_PROVIDER:-stripe}"
  add STRIPE_SECRET_KEY "${STRIPE_SECRET_KEY}"
  add STRIPE_WEBHOOK_SECRET "${STRIPE_WEBHOOK_SECRET}"
  add STRIPE_PRICE_STARTER "${STRIPE_PRICE_STARTER}"
  add STRIPE_PRICE_PRO "${STRIPE_PRICE_PRO}"
  add STRIPE_PRICE_BUSINESS "${STRIPE_PRICE_BUSINESS}"
  add PADDLE_API_KEY "${PADDLE_API_KEY}"
  add PADDLE_WEBHOOK_SECRET "${PADDLE_WEBHOOK_SECRET}"
  add PADDLE_ENV "${PADDLE_ENV:-sandbox}"
  add PADDLE_PRICE_STARTER "${PADDLE_PRICE_STARTER}"
  add PADDLE_PRICE_PRO "${PADDLE_PRICE_PRO}"
  add PADDLE_PRICE_BUSINESS "${PADDLE_PRICE_BUSINESS}"
  add LEMONSQUEEZY_API_KEY "${LEMONSQUEEZY_API_KEY}"
  add LEMONSQUEEZY_WEBHOOK_SECRET "${LEMONSQUEEZY_WEBHOOK_SECRET}"
  add LEMONSQUEEZY_STORE_ID "${LEMONSQUEEZY_STORE_ID}"
  add LEMONSQUEEZY_VARIANT_STARTER "${LEMONSQUEEZY_VARIANT_STARTER}"
  add LEMONSQUEEZY_VARIANT_PRO "${LEMONSQUEEZY_VARIANT_PRO}"
  add LEMONSQUEEZY_VARIANT_BUSINESS "${LEMONSQUEEZY_VARIANT_BUSINESS}"

  # Alerts
  add SENDGRID_API_KEY "${SENDGRID_API_KEY}"
  add ALERT_FROM_EMAIL "${ALERT_FROM_EMAIL}"
  add TWILIO_ACCOUNT_SID "${TWILIO_ACCOUNT_SID}"
  add TWILIO_AUTH_TOKEN "${TWILIO_AUTH_TOKEN}"
  add TWILIO_FROM_NUMBER "${TWILIO_FROM_NUMBER}"
  add ALERT_SMS_NUMBER "${ALERT_SMS_NUMBER}"

  echo "${vars%,}"  # strip trailing comma
}

# ══════════════════════════════════════════════════════════════
# GCP CLOUD RUN
# ══════════════════════════════════════════════════════════════
deploy_gcp() {
  info "Deploying to Google Cloud Run..."

  command -v gcloud &>/dev/null || error "gcloud CLI not installed. See: https://cloud.google.com/sdk/docs/install"

  PROJECT=$(gcloud config get-value project 2>/dev/null)
  [ -z "$PROJECT" ] && error "No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"

  info "Project: $PROJECT | Region: $REGION"

  # Enable required APIs (idempotent — won't re-enable)
  info "Ensuring required GCP APIs are enabled..."
  gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    --quiet 2>/dev/null || true
  success "APIs enabled"

  # Build env vars
  ENV_VARS=$(build_env_vars)

  # Deploy backend
  info "Deploying backend to Cloud Run..."
  cd backend
  gcloud run deploy "$APP_NAME" \
    --source . \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --set-env-vars "$ENV_VARS" \
    --min-instances 0 \
    --max-instances 10 \
    --memory 512Mi \
    --cpu 1 \
    --timeout 60s \
    --concurrency 80
  cd ..

  BACKEND_URL=$(gcloud run services describe "$APP_NAME" --region "$REGION" --format 'value(status.url)')
  success "Backend deployed: $BACKEND_URL"

  # Deploy dashboard
  if command -v firebase &>/dev/null; then
    info "Deploying dashboard to Firebase Hosting..."
    FRONTEND_API_URL="$BACKEND_URL" build_dashboard

    cd dashboard
    if [ ! -f firebase.json ]; then
      info "Initializing Firebase config..."
      cat > firebase.json << 'FB_EOF'
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [{
      "source": "**/*.@(js|css)",
      "headers": [{ "key": "Cache-Control", "value": "max-age=31536000" }]
    }]
  }
}
FB_EOF
    fi
    firebase deploy --only hosting --project "$PROJECT"
    cd ..
    success "Dashboard deployed"
  else
    warn "Firebase CLI not installed. Install: npm install -g firebase-tools"
    warn "Building dashboard locally — deploy dashboard/dist/ to Firebase, Vercel, or Netlify."
    FRONTEND_API_URL="$BACKEND_URL" build_dashboard
  fi

  echo ""
  success "GCP deployment complete!"
  echo ""
  echo -e "  ${GREEN}Backend API:${NC}    $BACKEND_URL"
  echo -e "  ${YELLOW}Webhook URLs (add these to each billing provider):${NC}"
  echo -e "    Stripe:        $BACKEND_URL/api/billing/webhooks/stripe"
  echo -e "    Paddle:        $BACKEND_URL/api/billing/webhooks/paddle"
  echo -e "    Lemon Squeezy: $BACKEND_URL/api/billing/webhooks/lemonsqueezy"
  echo ""
  warn "Update agent config.json with: $BACKEND_URL"
}

# ══════════════════════════════════════════════════════════════
# AZURE APP SERVICE
# ══════════════════════════════════════════════════════════════
deploy_azure() {
  info "Deploying to Azure App Service..."

  command -v az &>/dev/null || error "Azure CLI not installed. See: https://docs.microsoft.com/cli/azure/install-azure-cli"

  RESOURCE_GROUP="sentinel-rg"
  APP_PLAN="sentinel-plan"

  az group create --name "$RESOURCE_GROUP" --location "$AZURE_LOCATION" --output none 2>/dev/null || true

  info "Creating App Service Plan (B1 — ~\$13/month)..."
  az appservice plan create \
    --name "$APP_PLAN" \
    --resource-group "$RESOURCE_GROUP" \
    --sku B1 \
    --is-linux \
    --output none 2>/dev/null || true

  info "Creating Web App..."
  az webapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --plan "$APP_PLAN" \
    --runtime "NODE:18-lts" \
    --output none 2>/dev/null || true

  # Build settings array from .env
  info "Setting environment variables..."
  SETTINGS=()
  for var in NODE_ENV FRONTEND_URL DATABASE_URL JWT_SECRET AGENT_API_KEY \
             BILLING_PROVIDER STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
             STRIPE_PRICE_STARTER STRIPE_PRICE_PRO STRIPE_PRICE_BUSINESS \
             PADDLE_API_KEY PADDLE_WEBHOOK_SECRET PADDLE_ENV \
             PADDLE_PRICE_STARTER PADDLE_PRICE_PRO PADDLE_PRICE_BUSINESS \
             LEMONSQUEEZY_API_KEY LEMONSQUEEZY_WEBHOOK_SECRET LEMONSQUEEZY_STORE_ID \
             LEMONSQUEEZY_VARIANT_STARTER LEMONSQUEEZY_VARIANT_PRO LEMONSQUEEZY_VARIANT_BUSINESS \
             SENDGRID_API_KEY ALERT_FROM_EMAIL ALERT_SMS_NUMBER \
             TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM_NUMBER; do
    val="${!var}"
    [ -n "$val" ] && SETTINGS+=("$var=$val")
  done
  SETTINGS+=("NODE_ENV=production")

  az webapp config appsettings set \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings "${SETTINGS[@]}" \
    --output none

  info "Deploying backend code..."
  cd backend
  az webapp up \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --runtime "NODE:18-lts" \
    --output none
  cd ..

  BACKEND_URL="https://$APP_NAME.azurewebsites.net"
  success "Backend deployed: $BACKEND_URL"

  FRONTEND_API_URL="$BACKEND_URL" build_dashboard
  warn "Dashboard built to dashboard/dist/ — deploy to Azure Static Web Apps, Vercel, or Netlify"

  echo ""
  success "Azure deployment complete!"
  echo ""
  echo -e "  ${GREEN}Backend API:${NC}    $BACKEND_URL"
  echo -e "  ${YELLOW}Webhook URLs:${NC}"
  echo -e "    Stripe:        $BACKEND_URL/api/billing/webhooks/stripe"
  echo -e "    Paddle:        $BACKEND_URL/api/billing/webhooks/paddle"
  echo -e "    Lemon Squeezy: $BACKEND_URL/api/billing/webhooks/lemonsqueezy"
}

# ─── Provider setup reminder ──────────────────────────────────────────────────
provider_setup_reminder() {
  echo ""
  echo -e "${BLUE}══════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Billing Provider Setup${NC}"
  echo -e "${BLUE}══════════════════════════════════════════${NC}"
  echo ""
  echo "After deployment, add the webhook URLs (shown above) to each"
  echo "billing provider you enabled in BILLING_SETUP.md:"
  echo ""
  echo "  • Stripe:        Dashboard → Developers → Webhooks → Add endpoint"
  echo "  • Paddle:        Dashboard → Developer Tools → Notifications → New destination"
  echo "  • Lemon Squeezy: Settings → Webhooks → Create webhook"
  echo ""
  echo "See BILLING_SETUP.md for the events to subscribe to."
  echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}🛡️  Sentinel Deployment Script${NC}"
echo -e "Platform: ${BLUE}$PLATFORM${NC} | Action: ${BLUE}$ACTION${NC}"
echo ""

case "$ACTION" in
  setup)
    load_env
    setup_database
    provider_setup_reminder
    ;;
  deploy)
    load_env
    case "$PLATFORM" in
      gcp)   deploy_gcp   ;;
      azure) deploy_azure ;;
      *)     error "Unknown platform: $PLATFORM. Use 'gcp' or 'azure'" ;;
    esac
    ;;
  all)
    load_env
    setup_database
    case "$PLATFORM" in
      gcp)   deploy_gcp   ;;
      azure) deploy_azure ;;
      *)     error "Unknown platform: $PLATFORM. Use 'gcp' or 'azure'" ;;
    esac
    provider_setup_reminder
    ;;
  *)
    error "Unknown action: $ACTION. Use 'setup', 'deploy', or 'all'"
    ;;
esac

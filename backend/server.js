/**
 * Sentinel Backend API
 * Node.js + Express — runs on GCP Cloud Run or Azure App Service (non-AWS)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const billingRouter = require('./billing/routes');
const { dispatchThreatAlert, sendTrialWelcome } = require('./alerts');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database ─────────────────────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));

// IMPORTANT: webhook routes need RAW body for signature verification
app.use('/api/billing/webhooks', express.raw({ type: '*/*', limit: '5mb' }), (req, res, next) => {
  req.rawBody = req.body;
  try { req.body = JSON.parse(req.body.toString('utf8')); } catch { /* leave as buffer */ }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAgentKey(req, res, next) {
  const key = req.headers['x-agent-key'];
  if (!key || key !== process.env.AGENT_API_KEY) {
    return res.status(401).json({ error: 'Invalid agent key' });
  }
  next();
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, orgName } = req.body;
    if (!email || !password || !orgName) return res.status(400).json({ error: 'Missing fields' });

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, org_name, plan, created_at)
       VALUES ($1, $2, $3, 'free', NOW()) RETURNING id, email, org_name, plan`,
      [email.toLowerCase(), hash, orgName]
    );

    const token = jwt.sign({ userId: result.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Send welcome email asynchronously
    sendTrialWelcome(email, orgName).catch(e => console.error('[Alert] Welcome email failed:', e.message));

    res.json({ token, user: result.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, orgName: user.org_name, plan: user.plan } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Device Routes ────────────────────────────────────────────────────────────
app.post('/api/devices/register', requireAgentKey, async (req, res) => {
  try {
    const { hostname, platform, osVersion, arch, agentVersion } = req.body;
    const result = await db.query(
      `INSERT INTO devices (hostname, platform, os_version, arch, agent_version, status, last_seen, registered_at)
       VALUES ($1, $2, $3, $4, $5, 'online', NOW(), NOW())
       ON CONFLICT (hostname) DO UPDATE SET
         platform = EXCLUDED.platform, os_version = EXCLUDED.os_version,
         agent_version = EXCLUDED.agent_version, status = 'online', last_seen = NOW()
       RETURNING *`,
      [hostname, platform, osVersion, arch, agentVersion]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/devices/heartbeat', requireAgentKey, async (req, res) => {
  try {
    const { hostname, uptime, memUsage, loadAvg } = req.body;
    await db.query(
      `UPDATE devices SET last_seen = NOW(), status = 'online', uptime = $2, mem_usage = $3, load_avg = $4 WHERE hostname = $1`,
      [hostname, uptime, memUsage, JSON.stringify(loadAvg)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Threat Routes ────────────────────────────────────────────────────────────
app.post('/api/threats', requireAgentKey, async (req, res) => {
  try {
    const { hostname, name, path, severity, type, hash, details, timestamp } = req.body;
    const result = await db.query(
      `INSERT INTO threats (hostname, name, file_path, severity, type, hash, details, detected_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING *`,
      [hostname, name, path, severity, type, hash || null, details, timestamp || new Date()]
    );
    console.log(`[THREAT] ${severity.toUpperCase()}: ${name} on ${hostname}`);

    // Fire email/SMS alert asynchronously (don't block agent response)
    dispatchThreatAlert(db, result.rows[0]).catch(e => console.error('[Alert] Failed:', e.message));

    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/events', requireAgentKey, async (req, res) => {
  try {
    const { hostname, type, chain, reason, destination, port, pid, timestamp } = req.body;
    await db.query(
      `INSERT INTO events (hostname, type, chain, reason, destination, port, pid, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [hostname, type, chain || null, reason, destination || null, port || null, pid || null, timestamp || new Date()]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/actions', requireAgentKey, async (req, res) => {
  try {
    const { action, original, dest, hostname } = req.body;
    await db.query(
      `INSERT INTO actions (hostname, action, original_path, dest_path, performed_at) VALUES ($1, $2, $3, $4, NOW())`,
      [hostname, action, original, dest]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Dashboard API ────────────────────────────────────────────────────────────
app.get('/api/dashboard/summary', requireAuth, async (req, res) => {
  try {
    const [devices, threats, events, blocked] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='online') as online FROM devices`),
      db.query(`SELECT COUNT(*) as total FROM threats WHERE detected_at > NOW() - INTERVAL '24 hours'`),
      db.query(`SELECT COUNT(*) as total FROM events WHERE occurred_at > NOW() - INTERVAL '24 hours'`),
      db.query(`SELECT COUNT(*) as total FROM threats WHERE status = 'quarantined'`),
    ]);
    res.json({
      devices: { total: parseInt(devices.rows[0].total), online: parseInt(devices.rows[0].online) },
      threatsToday: parseInt(threats.rows[0].total),
      eventsToday: parseInt(events.rows[0].total),
      blocked: parseInt(blocked.rows[0].total),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/devices', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.*, (SELECT COUNT(*) FROM threats t WHERE t.hostname = d.hostname AND t.status = 'active') as active_threats
       FROM devices d ORDER BY d.last_seen DESC`
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/threats', requireAuth, async (req, res) => {
  try {
    const { status, hostname, limit = 50 } = req.query;
    let query = 'SELECT * FROM threats WHERE 1=1';
    const params = [];
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    if (hostname) { params.push(hostname); query += ` AND hostname = $${params.length}`; }
    params.push(parseInt(limit));
    query += ` ORDER BY detected_at DESC LIMIT $${params.length}`;
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/threats/:id', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.query('UPDATE threats SET status = $1, resolved_at = NOW() WHERE id = $2', [status, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/events', requireAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM events ORDER BY occurred_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Mount Billing Routes ─────────────────────────────────────────────────────
app.use('/api/billing', billingRouter(db, requireAuth));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok', ts: new Date(),
  billing: process.env.BILLING_PROVIDER || 'stripe',
}));

app.listen(PORT, () => {
  console.log(`[Sentinel API] Running on port ${PORT}`);
  console.log(`[Sentinel API] Billing provider: ${process.env.BILLING_PROVIDER || 'stripe'}`);
});

module.exports = app;

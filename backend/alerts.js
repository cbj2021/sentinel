/**
 * Sentinel Alerting System
 * Email (SendGrid) + SMS (Twilio) for critical threat notifications
 *
 * Sends alerts when:
 *   - critical/high severity threats are detected
 *   - new user signs up (welcome email)
 *   - subscription events (trial ending, payment failed)
 */

const https = require('https');

// ─── Email via SendGrid ────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[Alert] Email skipped (no SENDGRID_API_KEY): ${subject} → ${to}`);
    return;
  }

  const body = JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: {
      email: process.env.ALERT_FROM_EMAIL || 'alerts@sentinel-security.io',
      name: 'Sentinel Security',
    },
    subject,
    content: [
      { type: 'text/plain', value: text || subject },
      { type: 'text/html', value: html },
    ],
  });

  return httpPost('https://api.sendgrid.com/v3/mail/send', body, {
    Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
    'Content-Type': 'application/json',
  });
}

// ─── SMS via Twilio ────────────────────────────────────────────────────────────
async function sendSMS({ to, message }) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`[Alert] SMS skipped (no Twilio creds): ${message.substring(0, 40)}`);
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  const body = new URLSearchParams({ To: to, From: from, Body: message }).toString();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  return httpPost(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    body,
    { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  );
}

// ─── Email templates ─────────────────────────────────────────────────────────

function threatEmail(threat, orgName) {
  const severityColor = {
    critical: '#A32D2D',
    high: '#854F0B',
    medium: '#185FA5',
    low: '#3B6D11',
  }[threat.severity] || '#444';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Sentinel Security Alert</title></head>
<body style="font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">
    <div style="background:#0F6E56;padding:20px 24px;">
      <span style="color:#fff;font-size:18px;font-weight:600;letter-spacing:0.05em;">🛡️ SENTINEL</span>
      <span style="color:#9FE1CB;font-size:12px;margin-left:8px;text-transform:uppercase;letter-spacing:0.08em;">Security Alert</span>
    </div>
    <div style="padding:20px 24px 0;">
      <span style="display:inline-block;background:${severityColor};color:#fff;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.08em;">
        ${threat.severity} severity
      </span>
    </div>
    <div style="padding:16px 24px 24px;">
      <h2 style="font-size:18px;font-weight:600;margin:8px 0 4px;color:#111;">${threat.name}</h2>
      <p style="color:#666;font-size:14px;margin:0 0 20px;">${threat.details || 'Threat detected on your protected device.'}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;color:#888;width:120px;">Device</td>
          <td style="padding:8px 0;font-weight:500;color:#111;">${threat.hostname}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;color:#888;">Type</td>
          <td style="padding:8px 0;font-weight:500;color:#111;text-transform:capitalize;">${threat.type}</td>
        </tr>
        ${threat.file_path ? `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;color:#888;">Location</td>
          <td style="padding:8px 0;font-weight:500;color:#111;font-family:monospace;font-size:12px;">${threat.file_path}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0;color:#888;">Detected</td>
          <td style="padding:8px 0;font-weight:500;color:#111;">${new Date(threat.detected_at).toLocaleString()}</td>
        </tr>
      </table>
      <div style="margin-top:24px;">
        <a href="${process.env.FRONTEND_URL}/threats" style="display:inline-block;background:#0F6E56;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">
          View in Dashboard →
        </a>
      </div>
    </div>
    <div style="padding:16px 24px;background:#f9f9f9;border-top:1px solid #eee;font-size:12px;color:#999;">
      Alert sent to admin of <strong>${orgName || 'your organization'}</strong>.
    </div>
  </div>
</body></html>`;

  return {
    html,
    text: `[Sentinel] ${threat.severity.toUpperCase()} threat: ${threat.name} on ${threat.hostname}. ${threat.details || ''}`,
  };
}

function threatSMS(threat) {
  return `[SENTINEL] ${threat.severity.toUpperCase()}: ${threat.name} on ${threat.hostname}. Dashboard: ${process.env.FRONTEND_URL || ''}`;
}

// ─── Main alert dispatcher ────────────────────────────────────────────────────
// Called from server.js whenever a threat is reported by an agent
async function dispatchThreatAlert(db, threat) {
  try {
    // Only alert on high+ severity
    if (!['critical', 'high'].includes(threat.severity)) return;

    // Get all users in the organization (simple — first user for now)
    // In multi-tenant production, you'd map devices → orgs → users
    const result = await db.query(
      `SELECT email, org_name, plan FROM users ORDER BY id ASC LIMIT 10`
    );
    const recipients = result.rows;

    if (recipients.length === 0) {
      console.log('[Alert] No users to notify');
      return;
    }

    for (const recipient of recipients) {
      // Email always sent for high/critical
      const { html, text } = threatEmail(threat, recipient.org_name);
      await sendEmail({
        to: recipient.email,
        subject: `[Sentinel] ${threat.severity.toUpperCase()} threat on ${threat.hostname}: ${threat.name}`,
        html,
        text,
      });
      console.log(`[Alert] Email sent to ${recipient.email}`);

      // SMS only for critical + paid plans (Pro, Business)
      if (threat.severity === 'critical' &&
          ['pro', 'business'].includes(recipient.plan) &&
          process.env.ALERT_SMS_NUMBER) {
        await sendSMS({
          to: process.env.ALERT_SMS_NUMBER,
          message: threatSMS(threat),
        });
        console.log(`[Alert] SMS sent to ${process.env.ALERT_SMS_NUMBER}`);
      }
    }
  } catch (e) {
    console.error('[Alert] Dispatch error:', e.message);
  }
}

// ─── Welcome / billing emails ─────────────────────────────────────────────────
async function sendTrialWelcome(userEmail, orgName) {
  const html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
  <h2 style="color:#0F6E56;">Welcome to Sentinel, ${orgName}! 🛡️</h2>
  <p>Your 14-day free trial has started. Get protected in the next 5 minutes:</p>
  <ol style="line-height:2;">
    <li>Download the Sentinel agent from your dashboard</li>
    <li>Install it on your Mac or Windows device</li>
    <li>Watch threats appear in real time</li>
  </ol>
  <a href="${process.env.FRONTEND_URL}" style="display:inline-block;background:#0F6E56;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
    Open Dashboard →
  </a>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    Questions? Reply to this email — we respond within 24 hours.
  </p>
</div>`;

  return sendEmail({
    to: userEmail,
    subject: 'Welcome to Sentinel — your 14-day trial has started',
    html,
    text: `Welcome to Sentinel! Your 14-day free trial has started. Dashboard: ${process.env.FRONTEND_URL}`,
  });
}

async function sendPaymentFailedEmail(userEmail, orgName) {
  const html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
  <h2 style="color:#A32D2D;">Payment failed — action required</h2>
  <p>Hi ${orgName},</p>
  <p>We weren't able to charge your payment method for this billing cycle. Your Sentinel coverage will pause in 3 days unless this is resolved.</p>
  <a href="${process.env.FRONTEND_URL}/billing" style="display:inline-block;background:#0F6E56;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
    Update payment method →
  </a>
</div>`;
  return sendEmail({
    to: userEmail,
    subject: '[Sentinel] Payment failed — update your card',
    html,
    text: `Payment failed. Update your card: ${process.env.FRONTEND_URL}/billing`,
  });
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = {
  dispatchThreatAlert,
  sendEmail,
  sendSMS,
  sendTrialWelcome,
  sendPaymentFailedEmail,
};

/**
 * Reporter — Sends events, threats, and heartbeats to the Sentinel backend
 */

const https = require('https');
const http = require('http');
const os = require('os');

class Reporter {
  constructor(config) {
    this.config = config;
    this.apiUrl = config.apiUrl || 'http://localhost:3001';
    this.apiKey = config.apiKey || '';
    this.queue = [];
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  async registerDevice(deviceInfo) {
    return this.post('/api/devices/register', deviceInfo);
  }

  async reportThreat(threat) {
    this.queue.push({ endpoint: '/api/threats', data: threat });
  }

  async reportEvent(event) {
    this.queue.push({ endpoint: '/api/events', data: event });
  }

  async reportAction(action) {
    return this.post('/api/actions', action);
  }

  async sendHeartbeat(stats) {
    return this.post('/api/devices/heartbeat', stats);
  }

  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, 50);
    for (const item of batch) {
      try {
        await this.post(item.endpoint, item.data);
      } catch (e) {
        // Re-queue on failure
        this.queue.unshift(item);
        break;
      }
    }
  }

  post(endpoint, data) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(data);
      const url = new URL(this.apiUrl + endpoint);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Agent-Key': this.apiKey,
          'X-Hostname': os.hostname(),
        },
        rejectUnauthorized: false, // Allow self-signed certs for local dev
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }
}

module.exports = Reporter;

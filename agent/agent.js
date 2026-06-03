/**
 * Sentinel Agent Daemon
 * Cross-platform (macOS + Windows) background agent
 * Monitors file system, processes, and network for threats
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');
const http = require('https');

const CONFIG = require('./config.json');
const ThreatScanner = require('./scanner');
const NetworkMonitor = require('./network');
const ProcessMonitor = require('./process');
const Reporter = require('./reporter');

const PLATFORM = os.platform(); // 'darwin' | 'win32'
const HOSTNAME = os.hostname();
const AGENT_VERSION = '1.0.0';

class SentinelAgent {
  constructor() {
    this.scanner = new ThreatScanner(CONFIG);
    this.network = new NetworkMonitor(CONFIG);
    this.process = new ProcessMonitor(CONFIG);
    this.reporter = new Reporter(CONFIG);
    this.running = false;
    this.scanInterval = null;
    this.heartbeatInterval = null;
  }

  async start() {
    console.log(`[Sentinel] Agent v${AGENT_VERSION} starting on ${PLATFORM} (${HOSTNAME})`);
    this.running = true;

    // Register device with backend
    await this.reporter.registerDevice({
      hostname: HOSTNAME,
      platform: PLATFORM,
      osVersion: os.release(),
      arch: os.arch(),
      agentVersion: AGENT_VERSION,
    });

    // Start all monitors
    this.scanner.start((threat) => this.onThreat(threat));
    this.network.start((event) => this.onNetworkEvent(event));
    this.process.start((event) => this.onProcessEvent(event));

    // Periodic full scan every 6 hours
    this.scanInterval = setInterval(() => this.runFullScan(), 6 * 60 * 60 * 1000);

    // Heartbeat every 60 seconds
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 60 * 1000);

    // Run initial quick scan
    await this.runQuickScan();

    console.log('[Sentinel] Agent running. Press Ctrl+C to stop.');
  }

  async onThreat(threat) {
    console.log(`[THREAT] ${threat.severity.toUpperCase()}: ${threat.name} @ ${threat.path}`);
    await this.reporter.reportThreat({
      ...threat,
      hostname: HOSTNAME,
      timestamp: new Date().toISOString(),
    });

    // Auto-quarantine critical threats
    if (threat.severity === 'critical' && CONFIG.autoQuarantine) {
      await this.quarantine(threat.path);
    }
  }

  async onNetworkEvent(event) {
    if (event.suspicious) {
      console.log(`[NETWORK] Suspicious connection: ${event.destination}:${event.port}`);
      await this.reporter.reportEvent({ type: 'network', ...event, hostname: HOSTNAME });
    }
  }

  async onProcessEvent(event) {
    if (event.suspicious) {
      console.log(`[PROCESS] Suspicious process chain: ${event.chain}`);
      await this.reporter.reportEvent({ type: 'process', ...event, hostname: HOSTNAME });
    }
  }

  async quarantine(filePath) {
    const quarantineDir = CONFIG.quarantineDir ||
      (PLATFORM === 'win32'
        ? 'C:\\ProgramData\\Sentinel\\Quarantine'
        : '/Library/Application Support/Sentinel/Quarantine');

    if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });

    const fileName = path.basename(filePath);
    const dest = path.join(quarantineDir, `${Date.now()}_${fileName}.quar`);

    try {
      fs.renameSync(filePath, dest);
      console.log(`[QUARANTINE] Moved ${filePath} → ${dest}`);
      await this.reporter.reportAction({ action: 'quarantine', original: filePath, dest, hostname: HOSTNAME });
    } catch (e) {
      console.error(`[QUARANTINE] Failed: ${e.message}`);
    }
  }

  async runQuickScan() {
    console.log('[Sentinel] Running quick scan...');
    const targets = PLATFORM === 'win32'
      ? ['C:\\Users', 'C:\\Windows\\Temp', 'C:\\ProgramData']
      : [os.homedir(), '/tmp', '/var/tmp', '/Applications'];
    await this.scanner.scanPaths(targets);
  }

  async runFullScan() {
    console.log('[Sentinel] Running full system scan...');
    const targets = PLATFORM === 'win32' ? ['C:\\'] : ['/'];
    await this.scanner.scanPaths(targets);
  }

  async sendHeartbeat() {
    const stats = {
      hostname: HOSTNAME,
      uptime: process.uptime(),
      memUsage: os.freemem(),
      loadAvg: os.loadavg(),
      timestamp: new Date().toISOString(),
    };
    await this.reporter.sendHeartbeat(stats);
  }

  stop() {
    console.log('[Sentinel] Agent stopping...');
    this.running = false;
    clearInterval(this.scanInterval);
    clearInterval(this.heartbeatInterval);
    this.scanner.stop();
    this.network.stop();
    this.process.stop();
  }
}

// Handle graceful shutdown
const agent = new SentinelAgent();
process.on('SIGINT', () => { agent.stop(); process.exit(0); });
process.on('SIGTERM', () => { agent.stop(); process.exit(0); });

agent.start().catch((err) => {
  console.error('[Sentinel] Fatal error:', err);
  process.exit(1);
});

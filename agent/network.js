/**
 * NetworkMonitor — Detects suspicious outbound connections
 * Uses platform-native tools: netstat (cross-platform), lsof (macOS)
 */

const { exec } = require('child_process');
const os = require('os');

// Known malicious IP ranges / C2 indicators (extend with threat intel)
const BLOCKLISTED_IPS = new Set([
  '103.45.67.12',
  '185.220.101.0',
  '194.165.16.0',
]);

// Suspicious ports (C2 common ports)
const SUSPICIOUS_PORTS = new Set([
  4444, 4445, 1234, 31337, 8888, 9999, 6666, 6667, // Metasploit/RAT defaults
  1080, 3128, // Proxy
]);

// Legitimate process → outbound port mapping (flag deviations)
const EXPECTED_PROCESS_PORTS = {
  'chrome': [80, 443],
  'firefox': [80, 443],
  'safari': [80, 443],
  'node': [80, 443, 3000, 4000, 5000, 8080],
  'python': [80, 443],
};

class NetworkMonitor {
  constructor(config) {
    this.config = config;
    this.onEvent = null;
    this.interval = null;
    this.knownConnections = new Set();
  }

  start(onEvent) {
    this.onEvent = onEvent;
    // Poll connections every 15 seconds
    this.interval = setInterval(() => this.checkConnections(), 15000);
    this.checkConnections();
    console.log('[Network] Monitor active');
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  checkConnections() {
    const platform = os.platform();
    const cmd = platform === 'win32'
      ? 'netstat -ano'
      : 'netstat -anp tcp 2>/dev/null || netstat -an';

    exec(cmd, (err, stdout) => {
      if (err) return;
      const connections = this.parseNetstat(stdout, platform);
      for (const conn of connections) {
        const key = `${conn.remoteAddr}:${conn.remotePort}`;
        if (this.knownConnections.has(key)) continue;

        if (this.isSuspicious(conn)) {
          this.knownConnections.add(key);
          this.onEvent({
            suspicious: true,
            destination: conn.remoteAddr,
            port: conn.remotePort,
            localPort: conn.localPort,
            process: conn.process,
            state: conn.state,
            reason: conn.reason,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Clear known set periodically to re-evaluate
      if (this.knownConnections.size > 1000) this.knownConnections.clear();
    });
  }

  parseNetstat(output, platform) {
    const connections = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      if (!line.includes('ESTABLISHED') && !line.includes('SYN_SENT')) continue;

      try {
        if (platform === 'win32') {
          // TCP  localAddr  remoteAddr  STATE  PID
          const [, local, remote, state, pid] = parts;
          const [remoteAddr, remotePort] = this.splitAddr(remote);
          const [, localPort] = this.splitAddr(local);
          if (remoteAddr && remotePort) {
            connections.push({ remoteAddr, remotePort: parseInt(remotePort), localPort: parseInt(localPort), state, pid });
          }
        } else {
          // tcp  0  0  localAddr  remoteAddr  STATE
          const local = parts[3];
          const remote = parts[4];
          const state = parts[5];
          const [remoteAddr, remotePort] = this.splitAddr(remote);
          const [, localPort] = this.splitAddr(local);
          if (remoteAddr && remotePort) {
            connections.push({ remoteAddr, remotePort: parseInt(remotePort), localPort: parseInt(localPort), state });
          }
        }
      } catch (_) {}
    }
    return connections;
  }

  splitAddr(addr) {
    if (!addr) return [null, null];
    const lastColon = addr.lastIndexOf(':');
    return [addr.substring(0, lastColon), addr.substring(lastColon + 1)];
  }

  isSuspicious(conn) {
    const reasons = [];

    if (BLOCKLISTED_IPS.has(conn.remoteAddr)) {
      reasons.push(`IP on blocklist: ${conn.remoteAddr}`);
    }

    if (SUSPICIOUS_PORTS.has(conn.remotePort)) {
      reasons.push(`Suspicious port: ${conn.remotePort}`);
    }

    // Non-standard port for known process
    if (conn.process && EXPECTED_PROCESS_PORTS[conn.process]) {
      const allowed = EXPECTED_PROCESS_PORTS[conn.process];
      if (!allowed.includes(conn.remotePort)) {
        reasons.push(`${conn.process} connecting on unexpected port ${conn.remotePort}`);
      }
    }

    // Outbound to high-numbered port (common C2 pattern)
    if (conn.remotePort > 49000 && conn.remotePort < 65535) {
      reasons.push(`High ephemeral outbound port: ${conn.remotePort}`);
    }

    if (reasons.length > 0) {
      conn.reason = reasons.join('; ');
      return true;
    }
    return false;
  }
}

module.exports = NetworkMonitor;

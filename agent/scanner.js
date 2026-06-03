/**
 * ThreatScanner — File system scanning & malware signature matching
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');

// Known malicious file hashes (MD5) — extend with threat intel feeds
const MALICIOUS_HASHES = new Set([
  'd41d8cd98f00b204e9800998ecf8427e', // placeholder
  '44d88612fea8a8f36de82e1278abb02f', // EICAR test
  '69630e4574ec6798239b091cda43dca0',
]);

// Suspicious file extensions
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.dll', '.scr', '.bat', '.cmd', '.vbs', '.ps1',
  '.js', '.jse', '.wsf', '.wsh', '.msi', '.com', '.pif',
]);

// Ransomware indicator extensions (files being mass-encrypted)
const RANSOMWARE_EXTENSIONS = new Set([
  '.locked', '.encrypted', '.enc', '.crypted', '.crypt',
  '.wcry', '.wncry', '.wncryt', '.locky', '.zepto',
]);

// Suspicious strings in filenames
const SUSPICIOUS_PATTERNS = [
  /invoice.*\.(exe|js|vbs)/i,
  /receipt.*\.(exe|js|vbs)/i,
  /document.*\.(exe|js)/i,
  /update.*setup\.(exe|msi)/i,
  /free.*crack/i,
  /keygen/i,
];

class ThreatScanner {
  constructor(config) {
    this.config = config;
    this.watcher = null;
    this.onThreat = null;
    this.recentFiles = new Map(); // path -> { count, firstSeen } for ransomware detection
  }

  start(onThreat) {
    this.onThreat = onThreat;

    // Watch high-risk directories in real time
    const watchPaths = process.platform === 'win32'
      ? ['C:/Users', 'C:/Windows/Temp', 'C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Startup']
      : [require('os').homedir() + '/Downloads', '/tmp', '/var/tmp'];

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: false,
      depth: 4,
      ignored: /(node_modules|\.git|\.DS_Store)/,
      usePolling: false,
    });

    this.watcher
      .on('add', (filePath) => this.inspectFile(filePath, 'created'))
      .on('change', (filePath) => this.inspectFile(filePath, 'modified'))
      .on('error', (err) => {
        // Ignore transient errors on sockets/pipes that disappear mid-watch
        if (err.code !== 'UNKNOWN' && err.code !== 'ENOENT') {
          console.error('[Scanner] Watcher error:', err.message);
        }
      });

    console.log('[Scanner] Real-time file watcher active');
  }

  stop() {
    if (this.watcher) this.watcher.close();
  }

  async scanPaths(paths) {
    let scanned = 0;
    for (const dir of paths) {
      await this.walkDir(dir, async (filePath) => {
        await this.inspectFile(filePath, 'scan');
        scanned++;
      });
    }
    console.log(`[Scanner] Scan complete. Files checked: ${scanned}`);
    return scanned;
  }

  async walkDir(dir, callback, depth = 0) {
    if (depth > 6) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await this.walkDir(full, callback, depth + 1);
        } else if (entry.isFile()) {
          await callback(full);
        }
      }
    } catch (_) {
      // Permission denied — skip
    }
  }

  async inspectFile(filePath, event) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const basename = path.basename(filePath);

      // 1. Ransomware detection — mass file renames
      if (RANSOMWARE_EXTENSIONS.has(ext)) {
        this.trackRansomwareIndicator(filePath);
      }

      // 2. Dangerous extension check
      if (DANGEROUS_EXTENSIONS.has(ext) && event === 'created') {
        // Check hash
        const hash = this.hashFile(filePath);
        if (hash && MALICIOUS_HASHES.has(hash)) {
          this.onThreat({
            name: 'Known Malware (Hash Match)',
            path: filePath,
            severity: 'critical',
            type: 'malware',
            hash,
            details: `MD5 hash matches known threat database`,
          });
          return;
        }

        // Check suspicious naming patterns
        for (const pattern of SUSPICIOUS_PATTERNS) {
          if (pattern.test(basename)) {
            this.onThreat({
              name: 'Suspicious File Pattern',
              path: filePath,
              severity: 'high',
              type: 'suspicious',
              details: `Filename matches threat pattern: ${pattern.toString()}`,
            });
            return;
          }
        }

        // Executable dropped in temp — suspicious
        if (filePath.includes('Temp') || filePath.includes('/tmp')) {
          this.onThreat({
            name: 'Executable in Temp Directory',
            path: filePath,
            severity: 'medium',
            type: 'suspicious',
            details: `Executable file created in temp directory`,
          });
        }
      }

      // 3. Script execution attempt
      if (['.ps1', '.vbs', '.bat', '.cmd'].includes(ext) && event === 'created') {
        this.onThreat({
          name: 'Script File Detected',
          path: filePath,
          severity: 'medium',
          type: 'script',
          details: `Script file created: ${ext} in ${path.dirname(filePath)}`,
        });
      }
    } catch (_) {
      // File gone or unreadable
    }
  }

  trackRansomwareIndicator(filePath) {
    const dir = path.dirname(filePath);
    const now = Date.now();
    const entry = this.recentFiles.get(dir) || { count: 0, firstSeen: now };
    entry.count++;

    // If 10+ encrypted-extension files appear in the same dir within 30 seconds
    if (entry.count >= 10 && (now - entry.firstSeen) < 30000) {
      this.onThreat({
        name: 'Ransomware Activity Detected',
        path: dir,
        severity: 'critical',
        type: 'ransomware',
        details: `${entry.count} files encrypted in <30s in ${dir}`,
      });
      this.recentFiles.delete(dir);
    } else {
      this.recentFiles.set(dir, entry);
    }
  }

  hashFile(filePath) {
    try {
      const buf = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(buf).digest('hex');
    } catch (_) {
      return null;
    }
  }
}

module.exports = ThreatScanner;

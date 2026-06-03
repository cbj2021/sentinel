/**
 * ProcessMonitor — Detects suspicious process behavior
 * Watches for process injection, unusual chains, privilege escalation
 */

const { exec } = require('child_process');
const os = require('os');

// Suspicious process chain patterns (parent → child)
// These are common attack patterns (LOLBins, fileless malware)
const SUSPICIOUS_CHAINS = [
  { parent: 'winword.exe', child: 'cmd.exe', reason: 'Word launching CMD (macro attack)' },
  { parent: 'winword.exe', child: 'powershell.exe', reason: 'Word launching PowerShell (macro attack)' },
  { parent: 'excel.exe', child: 'cmd.exe', reason: 'Excel launching CMD' },
  { parent: 'outlook.exe', child: 'powershell.exe', reason: 'Outlook launching PowerShell' },
  { parent: 'powershell.exe', child: 'cmd.exe', reason: 'PS → CMD chain (potential LOLBin)' },
  { parent: 'cmd.exe', child: 'powershell.exe', reason: 'CMD → PS chain (potential bypass)' },
  { parent: 'mshta.exe', child: 'powershell.exe', reason: 'MSHTA abuse' },
  { parent: 'wscript.exe', child: 'powershell.exe', reason: 'Script engine abuse' },
  { parent: 'cscript.exe', child: 'powershell.exe', reason: 'Script engine abuse' },
  { parent: 'regsvr32.exe', child: 'cmd.exe', reason: 'Regsvr32 LOLBin abuse' },
  { parent: 'svchost.exe', child: 'cmd.exe', reason: 'Service host spawning shell' },
];

// Processes that should never spawn child processes
const NO_CHILD_PROCESSES = new Set([
  'chrome.exe', 'firefox.exe', 'safari', 'notes', 'calculator',
]);

// Known system processes that are frequently impersonated
const IMPERSONATION_TARGETS = new Set([
  'svchost.exe', 'lsass.exe', 'csrss.exe', 'winlogon.exe',
  'services.exe', 'smss.exe', 'wininit.exe',
]);

class ProcessMonitor {
  constructor(config) {
    this.config = config;
    this.onEvent = null;
    this.interval = null;
    this.processCache = new Map(); // pid → { name, ppid, path }
  }

  start(onEvent) {
    this.onEvent = onEvent;
    this.interval = setInterval(() => this.checkProcesses(), 10000);
    this.checkProcesses();
    console.log('[Process] Monitor active');
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  checkProcesses() {
    const platform = os.platform();
    if (platform === 'win32') {
      this.checkWindowsProcesses();
    } else {
      this.checkUnixProcesses();
    }
  }

  checkWindowsProcesses() {
    const cmd = 'wmic process get Name,ProcessId,ParentProcessId,ExecutablePath /format:csv 2>nul';
    exec(cmd, (err, stdout) => {
      if (err) return;
      const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('Node'));
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length < 4) continue;
        const [, exePath, name, ppid, pid] = parts;
        if (!name || !pid) continue;
        this.evaluateProcess({
          name: name.trim().toLowerCase(),
          pid: parseInt(pid),
          ppid: parseInt(ppid),
          path: exePath.trim(),
        });
      }
    });
  }

  checkUnixProcesses() {
    exec('ps -axo pid,ppid,comm,args 2>/dev/null', (err, stdout) => {
      if (err) return;
      const lines = stdout.split('\n').slice(1);
      const processMap = new Map();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3) continue;
        const [pid, ppid, comm, ...argsParts] = parts;
        const args = argsParts.join(' ');
        processMap.set(parseInt(pid), {
          name: comm.toLowerCase(),
          pid: parseInt(pid),
          ppid: parseInt(ppid),
          args,
        });
      }

      for (const [, proc] of processMap) {
        const parent = processMap.get(proc.ppid);
        if (parent) {
          this.checkChain(parent.name, proc.name, proc);
        }
        this.checkImpersonation(proc);
      }
    });
  }

  evaluateProcess(proc) {
    // Check if process name matches impersonation targets (wrong location)
    this.checkImpersonation(proc);

    // Check parent-child chain
    const parent = this.processCache.get(proc.ppid);
    if (parent) {
      this.checkChain(parent.name, proc.name, proc);
    }

    this.processCache.set(proc.pid, proc);

    // Cleanup old entries
    if (this.processCache.size > 2000) {
      const keys = [...this.processCache.keys()].slice(0, 500);
      keys.forEach(k => this.processCache.delete(k));
    }
  }

  checkChain(parentName, childName, proc) {
    for (const pattern of SUSPICIOUS_CHAINS) {
      if (parentName.includes(pattern.parent) && childName.includes(pattern.child)) {
        this.onEvent({
          suspicious: true,
          type: 'process_chain',
          chain: `${parentName} → ${childName}`,
          pid: proc.pid,
          reason: pattern.reason,
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }
  }

  checkImpersonation(proc) {
    if (!proc.path) return;
    const lowerPath = proc.path.toLowerCase();
    const lowerName = proc.name.toLowerCase();

    // Check system process running from unusual path
    if (IMPERSONATION_TARGETS.has(lowerName)) {
      const isSystemPath = lowerPath.includes('system32') ||
        lowerPath.includes('syswow64') ||
        lowerPath.includes('/system/');
      if (!isSystemPath) {
        this.onEvent({
          suspicious: true,
          type: 'impersonation',
          chain: `${proc.name} from non-system path`,
          pid: proc.pid,
          reason: `${proc.name} running from unusual location: ${proc.path}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}

module.exports = ProcessMonitor;

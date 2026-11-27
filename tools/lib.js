'use strict';
// Read-only diagnostics. Nothing in this file changes a system setting:
// it only runs query commands (ping, route/ip/Get-Net* queries) and reads values.
// All command execution goes through an injectable run(cmd, args) so tests can fake it.

const { execFileSync } = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;

// Real command runner: no shell, hard timeout, never throws.
function runCommand(cmd, args, timeoutMs = 10000) {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    return { code: 0, stdout };
  } catch (e) {
    return { code: typeof e.status === 'number' ? e.status : 1, stdout: String(e.stdout || ''), error: e.code || e.message };
  }
}

const ps = (run, script, timeout) =>
  run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], timeout);

// ---------- Network ----------

function parseGateway(platform, out) {
  const text = String(out || '').trim();
  if (platform === 'win32') return /^\d{1,3}(\.\d{1,3}){3}$/.test(text) ? text : null;
  if (platform === 'darwin') { const m = text.match(/gateway:\s*(\S+)/); return m ? m[1] : null; }
  const m = text.match(/default via (\S+)/); return m ? m[1] : null;
}

function getGateway(platform, run) {
  let r;
  if (platform === 'win32') {
    r = ps(run, "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop");
  } else if (platform === 'darwin') {
    r = run('route', ['-n', 'get', 'default']);
  } else {
    r = run('ip', ['route', 'show', 'default']);
  }
  return r.code === 0 ? parseGateway(platform, r.stdout) : null;
}

// Ping success = exit code 0. On Windows also require "TTL=" in a reply, because
// "destination unreachable" replies can still exit 0 (and TTL is not translated).
function pingHost(platform, run, host) {
  const args = platform === 'win32' ? ['-n', '1', '-w', '2000', host]
    : platform === 'darwin' ? ['-c', '1', '-W', '2000', host]
    : ['-c', '1', '-W', '2', host];
  const r = run('ping', args, 8000);
  const ok = r.code === 0 && (platform !== 'win32' || /ttl=/i.test(r.stdout));
  return ok;
}

// Second way to see if the router is alive: many routers ignore ping (ICMP).
// A TCP connect that succeeds OR is actively refused proves something answered.
function tcpProbe(host, ports = [80, 443, 53], timeoutMs = 1500) {
  const net = require('node:net');
  const one = port => new Promise(resolve => {
    const sock = net.connect({ host, port });
    const done = v => { sock.destroy(); resolve(v); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', e => done(e.code === 'ECONNREFUSED'));
  });
  return Promise.all(ports.map(one)).then(r => r.some(Boolean));
}

// Runs all three steps in order (router, 1.1.1.1, website) and names the first failing one.
// Read-only: ping, a route query, TCP connects and a DNS lookup.
async function runNetworkDoctor({ platform = process.platform, run = runCommand, lookup = h => dns.lookup(h), tcp = tcpProbe, site = 'example.com' } = {}) {
  const checks = [];
  const add = (name, pass, detail) => { const c = { name, status: pass ? 'PASS' : 'FAIL', detail }; checks.push(c); return c; };

  const gw = getGateway(platform, run);
  let router;
  if (!gw) {
    router = add('Router (default gateway)', false, 'No default gateway found. Not connected to a network?');
  } else {
    let alive = pingHost(platform, run, gw);
    if (!alive) { try { alive = await tcp(gw); } catch (e) { alive = false; } }
    router = add('Router (default gateway)', alive, gw + (alive ? '' : ' did not answer ping or TCP'));
  }

  const inet = add('Internet by IP (1.1.1.1)', pingHost(platform, run, '1.1.1.1'), '1.1.1.1');

  let ok = false, detail = site;
  try { const r = await lookup(site); ok = !!(r && r.address); detail = site + (ok ? ' -> ' + r.address : ''); }
  catch (e) { detail = site + ' (' + (e.code || e.message) + ')'; }
  add('Website name lookup (' + site + ')', ok, detail);

  // Router blocking ping but internet clearly working: do not blame the router.
  if (router.status === 'FAIL' && gw && inet.status === 'PASS') {
    router.status = 'PASS';
    router.detail = gw + ' ignores ping, but traffic passes through it (internet works)';
  }
  const failed = checks.find(c => c.status === 'FAIL');
  return { checks, firstFailure: failed ? failed.name : null };
}

// ---------- Health ----------

function checkDisk(statfs = fs.statfsSync, root = path.parse(process.cwd()).root) {
  try {
    const s = statfs(root);
    const free = s.bavail * s.bsize, total = s.blocks * s.bsize;
    const gb = n => (n / 1073741824).toFixed(1) + ' GB';
    const pct = total ? free / total * 100 : 0;
    return { name: 'Free disk space', status: free >= 10 * 1073741824 && pct >= 10 ? 'PASS' : 'FAIL',
      detail: gb(free) + ' free of ' + gb(total) + ' (' + pct.toFixed(0) + '%) on ' + root };
  } catch (e) {
    return { name: 'Free disk space', status: 'SKIP', detail: 'Could not read: ' + (e.code || e.message) };
  }
}

function parseFirewallWin(out) {
  try {
    let v = JSON.parse(out);
    if (!Array.isArray(v)) v = [v];
    if (!v.length) return null;
    return v.map(p => ({ name: p.Name, enabled: p.Enabled === true || p.Enabled === 1 || String(p.Enabled).toLowerCase() === 'true' }));
  } catch (e) { return null; }
}

function checkFirewall(platform, run) {
  const name = 'Firewall';
  if (platform === 'win32') {
    const r = ps(run, 'Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress');
    const profiles = r.code === 0 ? parseFirewallWin(r.stdout) : null;
    if (!profiles) return { name, status: 'SKIP', detail: 'Could not read firewall profiles' };
    const off = profiles.filter(p => !p.enabled).map(p => p.name);
    return { name, status: off.length ? 'FAIL' : 'PASS',
      detail: off.length ? 'OFF for: ' + off.join(', ') : 'On for: ' + profiles.map(p => p.name).join(', ') };
  }
  if (platform === 'darwin') {
    const r = run('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate']);
    if (r.code !== 0) return { name, status: 'SKIP', detail: 'Could not read firewall state' };
    const on = /enabled/i.test(r.stdout) && !/disabled/i.test(r.stdout);
    return { name, status: on ? 'PASS' : 'FAIL', detail: r.stdout.trim() };
  }
  const r = run('ufw', ['status']);
  if (r.code !== 0) return { name, status: 'SKIP', detail: 'ufw status unavailable (may need root)' };
  const active = /status:\s*active/i.test(r.stdout);
  return { name, status: active ? 'PASS' : 'FAIL', detail: active ? 'ufw active' : 'ufw not active' };
}

function checkUpdates(platform, run) {
  const name = 'Pending updates';
  if (platform !== 'win32') return { name, status: 'SKIP', detail: 'Only checked on Windows' };
  const r = ps(run, '(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search("IsInstalled=0 and IsHidden=0").Updates.Count', 90000);
  const n = parseInt(String(r.stdout).trim(), 10);
  if (r.code !== 0 || Number.isNaN(n)) return { name, status: 'SKIP', detail: 'Could not query Windows Update' };
  return { name, status: n === 0 ? 'PASS' : 'FAIL', detail: n === 0 ? 'No pending updates' : n + ' update(s) waiting' };
}

function runHealthReport({ platform = process.platform, run = runCommand, statfs = fs.statfsSync, osInfo = { type: os.type(), release: os.release(), arch: os.arch(), hostname: os.hostname() } } = {}) {
  return [
    { name: 'Operating system', status: 'INFO', detail: osInfo.type + ' ' + osInfo.release + ' (' + osInfo.arch + '), host ' + osInfo.hostname },
    checkDisk(statfs),
    checkFirewall(platform, run),
    checkUpdates(platform, run)
  ];
}

function formatChecks(checks) {
  return checks.map(c => '[' + c.status + '] ' + c.name + (c.detail ? ' - ' + c.detail : '')).join('\n');
}

module.exports = { tcpProbe, runCommand, parseGateway, getGateway, pingHost, runNetworkDoctor, checkDisk, parseFirewallWin, checkFirewall, checkUpdates, runHealthReport, formatChecks };

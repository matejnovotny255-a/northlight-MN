'use strict';
// Tests use fake command output only: nothing here touches the real system.
// Run: node --test tools
const test = require('node:test');
const assert = require('node:assert');
const lib = require('../lib');

const REPLY = 'Reply from 1.1.1.1: bytes=32 time=10ms TTL=57';

// Fake runner: map of "cmd" -> result, with a log so we can prove only read commands run.
function fakeRun(table) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    const key = Object.keys(table).find(k => (cmd + ' ' + args.join(' ')).includes(k));
    return key ? table[key] : { code: 1, stdout: '' };
  };
  run.calls = calls;
  return run;
}
const ok = stdout => ({ code: 0, stdout });
const fail = () => ({ code: 1, stdout: 'Request timed out.' });

test('parseGateway handles each platform', () => {
  assert.strictEqual(lib.parseGateway('win32', '192.168.1.1\r\n'), '192.168.1.1');
  assert.strictEqual(lib.parseGateway('win32', ''), null);
  assert.strictEqual(lib.parseGateway('linux', 'default via 10.0.0.1 dev eth0'), '10.0.0.1');
  assert.strictEqual(lib.parseGateway('darwin', '   gateway: 172.16.0.1\n  interface: en0'), '172.16.0.1');
});

test('network doctor: everything passes', async () => {
  const run = fakeRun({ NextHop: ok('192.168.1.1'), ping: ok(REPLY) });
  const r = await lib.runNetworkDoctor({ platform: 'win32', run, tcp: async () => true, lookup: async () => ({ address: '93.184.216.34' }) });
  assert.deepStrictEqual(r.checks.map(c => c.status), ['PASS', 'PASS', 'PASS']);
  assert.strictEqual(r.firstFailure, null);
});

test('network doctor: router and internet both down -> router is the first failing step', async () => {
  const run = fakeRun({ NextHop: ok('192.168.1.1'), ping: fail() });
  const r = await lib.runNetworkDoctor({ platform: 'win32', run, tcp: async () => false, lookup: async () => { const e = new Error('x'); e.code = 'ECONNREFUSED'; throw e; } });
  assert.deepStrictEqual(r.checks.map(c => c.status), ['FAIL', 'FAIL', 'FAIL']);
  assert.strictEqual(r.firstFailure, 'Router (default gateway)');
});

test('network doctor: router ignores ping but internet works -> not blamed', async () => {
  const run = (cmd, args) => cmd === 'powershell' ? ok('192.168.1.254') : (args.includes('1.1.1.1') ? ok(REPLY) : fail());
  const r = await lib.runNetworkDoctor({ platform: 'win32', run, tcp: async () => false, lookup: async () => ({ address: '1.2.3.4' }) });
  assert.strictEqual(r.checks[0].status, 'PASS');
  assert.match(r.checks[0].detail, /ignores ping/);
  assert.strictEqual(r.firstFailure, null);
});

test('network doctor: router answers TCP but not ping -> PASS', async () => {
  const run = (cmd, args) => cmd === 'powershell' ? ok('192.168.1.254') : (args.includes('1.1.1.1') ? fail() : fail());
  const r = await lib.runNetworkDoctor({ platform: 'win32', run, tcp: async () => true, lookup: async () => { const e = new Error('x'); e.code = 'ENOTFOUND'; throw e; } });
  assert.strictEqual(r.checks[0].status, 'PASS');
  assert.strictEqual(r.firstFailure, 'Internet by IP (1.1.1.1)');
});

test('network doctor: no gateway at all fails the router step', async () => {
  const run = fakeRun({ NextHop: ok('') });
  const r = await lib.runNetworkDoctor({ platform: 'win32', run, lookup: async () => { throw new Error('x'); } });
  assert.strictEqual(r.firstFailure, 'Router (default gateway)');
});

test('network doctor: router ok, 1.1.1.1 fails', async () => {
  const run = (cmd, args) => {
    if (cmd === 'powershell') return ok('192.168.1.1');
    return args.includes('1.1.1.1') ? fail() : ok('Reply from 192.168.1.1: bytes=32 time<1ms TTL=64');
  };
  const r = await lib.runNetworkDoctor({ platform: 'win32', run, lookup: async () => { throw new Error('x'); } });
  assert.deepStrictEqual(r.checks.map(c => c.status), ['PASS', 'FAIL', 'FAIL']);
  assert.strictEqual(r.firstFailure, 'Internet by IP (1.1.1.1)');
});

test('network doctor: IP works but website lookup fails (DNS problem)', async () => {
  const run = fakeRun({ NextHop: ok('192.168.1.1'), ping: ok(REPLY) });
  const r = await lib.runNetworkDoctor({ platform: 'win32', run, tcp: async () => true, site: 'example.com', lookup: async () => { const e = new Error('x'); e.code = 'ENOTFOUND'; throw e; } });
  assert.deepStrictEqual(r.checks.map(c => c.status), ['PASS', 'PASS', 'FAIL']);
  assert.match(r.firstFailure, /Website name lookup/);
});

test('windows ping exit 0 without TTL (unreachable reply) counts as FAIL', () => {
  const run = fakeRun({ ping: ok('Reply from 192.168.1.5: Destination host unreachable.') });
  assert.strictEqual(lib.pingHost('win32', run, '192.168.1.1'), false);
});

test('health report: disk, firewall and updates from fake output', () => {
  const run = fakeRun({
    'Get-NetFirewallProfile': ok('[{"Name":"Domain","Enabled":true},{"Name":"Private","Enabled":true},{"Name":"Public","Enabled":false}]'),
    'Update.Session': ok('3')
  });
  const statfs = () => ({ bavail: 50e9 / 4096, bsize: 4096, blocks: 200e9 / 4096 });
  const out = lib.runHealthReport({ platform: 'win32', run, statfs, osInfo: { type: 'Windows_NT', release: '10.0', arch: 'x64', hostname: 'fake-pc' } });
  const by = n => out.find(c => c.name === n);
  assert.strictEqual(by('Operating system').status, 'INFO');
  assert.strictEqual(by('Free disk space').status, 'PASS');
  assert.strictEqual(by('Firewall').status, 'FAIL');
  assert.match(by('Firewall').detail, /Public/);
  assert.strictEqual(by('Pending updates').status, 'FAIL');
  assert.match(by('Pending updates').detail, /3 update/);
});

test('health report: low disk fails, unreadable firewall is SKIP', () => {
  const statfs = () => ({ bavail: 1e9 / 4096, bsize: 4096, blocks: 100e9 / 4096 });
  assert.strictEqual(lib.checkDisk(statfs, 'C:\\').status, 'FAIL');
  assert.strictEqual(lib.checkFirewall('win32', fakeRun({ 'Get-NetFirewallProfile': { code: 1, stdout: '' } })).status, 'SKIP');
});

test('only read-only commands are ever executed', async () => {
  const run = fakeRun({ NextHop: ok('192.168.1.1'), ping: ok(REPLY) });
  await lib.runNetworkDoctor({ platform: 'win32', run, tcp: async () => true, lookup: async () => ({ address: '1.2.3.4' }) });
  lib.runHealthReport({ platform: 'win32', run, statfs: () => ({ bavail: 1e12, bsize: 1, blocks: 2e12 }) });
  const forbidden = /\b(Set-|New-NetFirewall|Remove-|Enable-|Disable-|netsh|ipconfig \/(release|renew|flushdns)|route (add|delete)|sc (stop|config)|Install-)/i;
  for (const c of run.calls) assert.doesNotMatch(c, forbidden, 'unexpected modifying command: ' + c);
});

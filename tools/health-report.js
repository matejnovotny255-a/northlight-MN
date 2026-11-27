#!/usr/bin/env node
'use strict';
// PC health report. Read-only: reports OS, free disk space, firewall and pending updates.
// Never changes any setting. Usage: node tools/health-report.js
const { runHealthReport, formatChecks } = require('./lib');

console.log('PC health report (read-only)\n');
const checks = runHealthReport();
console.log(formatChecks(checks));
process.exitCode = checks.some(c => c.status === 'FAIL') ? 1 : 0;

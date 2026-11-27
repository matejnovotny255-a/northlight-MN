#!/usr/bin/env node
'use strict';
// Network doctor. Read-only: checks router, then 1.1.1.1, then a website name,
// and names the first failing step. Never changes any setting.
// Usage: node tools/network-doctor.js [website]   (default: example.com)
const { runNetworkDoctor, formatChecks } = require('./lib');

(async () => {
  const site = process.argv[2] || 'example.com';
  console.log('Network doctor (read-only)\n');
  const { checks, firstFailure } = await runNetworkDoctor({ site });
  console.log(formatChecks(checks));
  console.log('');
  if (firstFailure) {
    console.log('First failing step: ' + firstFailure);
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
})();

#!/usr/bin/env node
'use strict';
// Checks northlight.cloud.json against the naming and tagging rules.
// Read-only: it only reads the file. Exits with code 1 on any missing tag or bad name.
// Usage: node tools/check-cloud.js [path-to-cloud-file]
const fs = require('node:fs');
const path = require('node:path');

// Policy. The cloud file may add required tags but can never remove these.
const BUILT_IN_TAGS = ['owner', 'env', 'cost-center'];
const ENVS = ['dev', 'test', 'prod'];
const TAG_RULES = {
  owner: { test: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), hint: 'must be an email address' },
  env: { test: v => ENVS.includes(v), hint: 'must be one of ' + ENVS.join(', ') },
  'cost-center': { test: v => /^CC-\d{4}$/.test(v), hint: 'must look like CC-1234' }
};
// Name rules per resource type: pattern, maximum length and an example.
const NAME_RULES = {
  resourceGroup: { re: /^rg-[a-z][a-z0-9]{1,19}-(dev|test|prod)-[a-z]{2,12}$/, max: 90, example: 'rg-northlight-prod-weu', envGroup: 1 },
  webApp: { re: /^app-[a-z][a-z0-9]{1,19}-(dev|test|prod)-[a-z]{2,12}-\d{3}$/, max: 60, example: 'app-northlight-prod-weu-001', envGroup: 1 },
  storageAccount: { re: /^st[a-z][a-z0-9]*?(dev|test|prod)\d{3}$/, min: 3, max: 24, example: 'stnorthlightprod001', envGroup: 1 }
};

function checkResource(type, res, requiredTags) {
  const errors = [];
  const name = res && typeof res.name === 'string' ? res.name : '';
  const rule = NAME_RULES[type];
  if (!rule) {
    errors.push('unknown resource type "' + type + '"');
  } else if (!name) {
    errors.push('missing name');
  } else {
    if (name.length > rule.max) errors.push('name is ' + name.length + ' characters, the maximum is ' + rule.max);
    if (rule.min && name.length < rule.min) errors.push('name is shorter than ' + rule.min + ' characters');
    const m = rule.re.exec(name);
    if (!m) errors.push('bad name "' + name + '" (expected a name like ' + rule.example + ')');
    else if (res.tags && res.tags.env && m[rule.envGroup] !== res.tags.env) errors.push('name says env "' + m[rule.envGroup] + '" but the env tag is "' + res.tags.env + '"');
  }
  const tags = res && res.tags && typeof res.tags === 'object' ? res.tags : {};
  requiredTags.forEach(t => {
    const v = tags[t];
    if (v === undefined || v === null) errors.push('missing tag: ' + t);
    else if (String(v).trim() === '') errors.push('empty tag: ' + t);
    else if (TAG_RULES[t] && !TAG_RULES[t].test(String(v))) errors.push('bad tag value for ' + t + ' ("' + v + '"): ' + TAG_RULES[t].hint);
  });
  return { type, name: name || '(no name)', errors };
}

// Returns { results: [{type,name,errors}], errors: [global errors], ok }
function checkCloud(doc) {
  const global = [];
  const results = [];
  if (!doc || typeof doc !== 'object') return { results, errors: ['the cloud file is not a JSON object'], ok: false };
  const fromFile = Array.isArray(doc.requiredTags) ? doc.requiredTags.filter(t => typeof t === 'string' && t) : [];
  const requiredTags = Array.from(new Set(BUILT_IN_TAGS.concat(fromFile)));

  if (!doc.resourceGroup) global.push('missing resourceGroup');
  else results.push(checkResource('resourceGroup', doc.resourceGroup, requiredTags));
  if (!Array.isArray(doc.resources) || doc.resources.length === 0) global.push('no resources listed');
  else doc.resources.forEach(r => results.push(checkResource(r && r.type, r, requiredTags)));

  const seen = new Set();
  results.forEach(r => { const key = r.name.toLowerCase(); if (r.name !== '(no name)' && seen.has(key)) r.errors.push('duplicate name "' + r.name + '"'); seen.add(key); });

  const ok = global.length === 0 && results.every(r => r.errors.length === 0);
  return { results, errors: global, ok };
}

function format(report) {
  const lines = report.results.map(r => (r.errors.length ? '[FAIL] ' : '[PASS] ') + r.type + ' ' + r.name + (r.errors.length ? ' - ' + r.errors.join('; ') : ''));
  report.errors.forEach(e => lines.push('[FAIL] ' + e));
  return lines.join('\n');
}

function main(argv) {
  const file = argv[2] || path.join(__dirname, '..', 'northlight.cloud.json');
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('[FAIL] cannot read ' + file + ': ' + e.message); return 1; }
  const report = checkCloud(doc);
  console.log('Cloud design check (read-only): ' + path.basename(file) + '\n');
  console.log(format(report));
  console.log('\n' + (report.ok ? 'All checks passed.' : 'Cloud design check FAILED.'));
  return report.ok ? 0 : 1;
}

module.exports = { checkCloud, checkResource, format, BUILT_IN_TAGS, NAME_RULES };
if (require.main === module) process.exitCode = main(process.argv);

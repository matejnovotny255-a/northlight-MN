'use strict';
// Tests for tools/check-cloud.js using fake cloud designs. Nothing here touches the real file or the network.
// Run: node --test tools/test/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkCloud } = require('../check-cloud');

const TAGS = { owner: 'team@example.com', env: 'prod', 'cost-center': 'CC-1001' };
const good = () => JSON.parse(JSON.stringify({
  requiredTags: ['owner', 'env', 'cost-center'],
  resourceGroup: { name: 'rg-northlight-prod-weu', tags: TAGS },
  resources: [
    { type: 'webApp', name: 'app-northlight-prod-weu-001', tags: TAGS },
    { type: 'storageAccount', name: 'stnorthlightprod001', tags: TAGS }
  ]
}));
const errorsFor = doc => { const r = checkCloud(doc); return r.results.flatMap(x => x.errors).concat(r.errors); };

test('a correct design passes', () => {
  const r = checkCloud(good());
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(errorsFor(good()), []);
  assert.strictEqual(r.results.length, 3);
});

test('the real northlight.cloud.json passes', () => {
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'northlight.cloud.json'), 'utf8'));
  assert.deepStrictEqual(errorsFor(real), []);
});

for (const tag of ['owner', 'env', 'cost-center']) {
  test('missing tag "' + tag + '" fails on every resource type', () => {
    for (const where of ['rg', 'web', 'storage']) {
      const d = good();
      const target = where === 'rg' ? d.resourceGroup : d.resources[where === 'web' ? 0 : 1];
      delete target.tags[tag];
      const errs = errorsFor(d);
      assert.ok(errs.some(e => e === 'missing tag: ' + tag), where + ': ' + errs.join('|'));
      assert.strictEqual(checkCloud(d).ok, false);
    }
  });
}

test('resource with no tags object at all fails with all three missing', () => {
  const d = good(); delete d.resources[0].tags;
  const errs = errorsFor(d);
  ['owner', 'env', 'cost-center'].forEach(t => assert.ok(errs.includes('missing tag: ' + t)));
});

test('empty tag value fails', () => {
  const d = good(); d.resources[0].tags.owner = '   ';
  assert.ok(errorsFor(d).includes('empty tag: owner'));
});

test('bad tag values fail with a hint', () => {
  let d = good(); d.resources[0].tags.env = 'staging';
  assert.ok(errorsFor(d).some(e => /bad tag value for env/.test(e)));
  d = good(); d.resources[0].tags['cost-center'] = '1001';
  assert.ok(errorsFor(d).some(e => /CC-1234/.test(e)));
  d = good(); d.resources[0].tags.owner = 'not-an-email';
  assert.ok(errorsFor(d).some(e => /email/.test(e)));
});

test('bad names fail', () => {
  const bad = [
    ['storageAccount', 'StNorthlightProd001', /bad name/],           // uppercase
    ['storageAccount', 'st-northlight-prod-001', /bad name/],        // hyphens not allowed
    ['storageAccount', 'stnorthlightproductionstorage001', /maximum is 24/], // too long
    ['storageAccount', 'northlightprod001', /bad name/],             // missing st prefix
    ['webApp', 'northlight-prod-weu-001', /bad name/],               // missing app- prefix
    ['webApp', 'app-northlight-prod-weu', /bad name/],               // missing number
    ['webApp', 'app_northlight_prod_weu_001', /bad name/],           // underscores
    ['resourceGroup', 'northlight-rg', /bad name/]
  ];
  for (const [type, name, re] of bad) {
    const d = good();
    if (type === 'resourceGroup') d.resourceGroup.name = name; else d.resources[type === 'webApp' ? 0 : 1].name = name;
    assert.ok(errorsFor(d).some(e => re.test(e)), type + ' ' + name + ': ' + errorsFor(d).join('|'));
  }
});

test('missing name fails', () => {
  const d = good(); delete d.resources[1].name;
  assert.ok(errorsFor(d).includes('missing name'));
});

test('env in the name must match the env tag', () => {
  const d = good(); d.resources[0].tags.env = 'dev';
  assert.ok(errorsFor(d).some(e => /name says env "prod" but the env tag is "dev"/.test(e)));
});

test('duplicate names fail', () => {
  const d = good(); d.resources.push({ type: 'webApp', name: 'app-northlight-prod-weu-001', tags: TAGS });
  assert.ok(errorsFor(d).some(e => /duplicate name/.test(e)));
});

test('missing resource group, no resources and unknown types fail', () => {
  let d = good(); delete d.resourceGroup;
  assert.ok(errorsFor(d).includes('missing resourceGroup'));
  d = good(); d.resources = [];
  assert.ok(errorsFor(d).includes('no resources listed'));
  d = good(); d.resources[0].type = 'database';
  assert.ok(errorsFor(d).some(e => /unknown resource type/.test(e)));
  assert.strictEqual(checkCloud(null).ok, false);
  assert.strictEqual(checkCloud('nope').ok, false);
});

test('the file can require extra tags but cannot weaken the built-in ones', () => {
  let d = good(); d.requiredTags = ['owner', 'env', 'cost-center', 'team'];
  assert.ok(errorsFor(d).includes('missing tag: team'));
  d = good(); d.requiredTags = [];           // trying to drop all requirements
  delete d.resources[0].tags.owner;
  assert.ok(errorsFor(d).includes('missing tag: owner'));
  d = good(); delete d.requiredTags; delete d.resources[0].tags.env;
  assert.ok(errorsFor(d).includes('missing tag: env'));
});

test('command line: exit code 0 for the real file, 1 for a bad file and for a missing file', () => {
  const script = path.join(__dirname, '..', 'check-cloud.js');
  const okRun = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.strictEqual(okRun.status, 0, okRun.stdout + okRun.stderr);
  assert.match(okRun.stdout, /\[PASS\] webApp app-northlight-prod-weu-001/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudtest-'));
  try {
    const d = good(); delete d.resources[1].tags['cost-center']; d.resources[0].name = 'BadName';
    const badFile = path.join(dir, 'bad.json'); fs.writeFileSync(badFile, JSON.stringify(d));
    const bad = spawnSync(process.execPath, [script, badFile], { encoding: 'utf8' });
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stdout, /\[FAIL\] storageAccount stnorthlightprod001 - missing tag: cost-center/);
    assert.match(bad.stdout, /\[FAIL\] webApp BadName/);
    assert.match(bad.stdout, /FAILED/);

    const missing = spawnSync(process.execPath, [script, path.join(dir, 'nope.json')], { encoding: 'utf8' });
    assert.strictEqual(missing.status, 1);
    const broken = path.join(dir, 'broken.json'); fs.writeFileSync(broken, '{ not json');
    assert.strictEqual(spawnSync(process.execPath, [script, broken], { encoding: 'utf8' }).status, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the checker only reads: the real cloud file is unchanged by a run', () => {
  const file = path.join(__dirname, '..', '..', 'northlight.cloud.json');
  const before = fs.readFileSync(file, 'utf8');
  spawnSync(process.execPath, [path.join(__dirname, '..', 'check-cloud.js')], { encoding: 'utf8' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
});

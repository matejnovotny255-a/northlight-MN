/* Settings page: site info from health.json, settings from config.js, and "Export all data".
   Everything shown is stored in this browser only. */
(function () {
  'use strict';
  const cfg = window.NorthlightConfig || {};
  const $ = id => document.getElementById(id);

  async function loadHealth() {
    try {
      const res = await fetch(cfg.healthUrl || 'health.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) { return null; }
  }

  // Every localStorage record, with JSON values parsed so the file is readable.
  function readRecords() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.sort();
    const records = {};
    keys.forEach(k => {
      const raw = localStorage.getItem(k);
      try { records[k] = JSON.parse(raw); } catch (e) { records[k] = raw; }
    });
    return { keys, records };
  }

  async function buildExport() {
    const { keys, records } = readRecords();
    const health = await loadHealth();
    return {
      format: 'northlight-export',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      site: health ? { name: health.name, version: health.version, buildDate: health.buildDate, commit: health.commit } : null,
      origin: location.origin,
      notice: 'Demo data only. Contains everything stored in this browser for this site, including fake demo password hashes and secrets. Do not share it as if it were real data.',
      recordCount: keys.length,
      records
    };
  }

  function stamp(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }

  async function exportAll() {
    const data = await buildExport();
    const text = JSON.stringify(data, null, 2);
    const filename = (cfg.exportFilePrefix || 'export') + '-' + stamp(new Date()) + '.json';
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return { filename, count: data.recordCount, bytes: text.length };
  }

  window.NorthlightExport = { buildExport, exportAll, readRecords };

  // ---------- Page ----------
  if (!$('exportBtn')) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const kv = (body, k, v) => { const tr = el('tr'); tr.append(el('th', null, k), el('td', null, v)); body.append(tr); };
  const fmtDate = s => { const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString(cfg.locale || undefined, { dateStyle: 'long', timeStyle: /T/.test(s) ? 'short' : undefined }); };

  async function renderAbout() {
    const body = $('aboutBody'); body.replaceChildren();
    const h = await loadHealth();
    if (!h) { kv(body, 'Status', 'Could not load health.json (open the site over http or https).'); return; }
    kv(body, 'Name', h.name); kv(body, 'Version', h.version); kv(body, 'Build date', fmtDate(h.buildDate));
    if (h.commit) kv(body, 'Commit', h.commit);
  }
  function renderConfig() {
    const body = $('configBody'); body.replaceChildren();
    Object.keys(cfg).forEach(k => kv(body, k, String(cfg[k])));
    if (!Object.keys(cfg).length) kv(body, 'Settings', 'config.js is not loaded');
  }
  function renderData() {
    const { keys } = readRecords();
    $('recordCount').textContent = keys.length;
    const body = $('dataBody'); body.replaceChildren();
    if (!keys.length) { const tr = el('tr'); const td = el('td', 'empty', 'No data saved yet. Use the CRM, Help Desk or contact form first.'); td.colSpan = 3; tr.append(td); body.append(tr); return; }
    keys.forEach(k => {
      const raw = localStorage.getItem(k); let v; try { v = JSON.parse(raw); } catch (e) { v = raw; }
      const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
      const what = Array.isArray(v) ? plural(v.length, 'item') : v && typeof v === 'object' ? plural(Object.keys(v).length, 'field') : 'text';
      const tr = el('tr'); tr.append(el('td', null, k), el('td', null, what), el('td', null, (raw.length / 1024).toFixed(1) + ' KB')); body.append(tr);
    });
  }

  $('exportBtn').addEventListener('click', async () => {
    const s = $('exportStatus');
    try { const r = await exportAll(); s.textContent = 'Exported ' + r.count + ' records as ' + r.filename + '.'; s.className = 'msg good'; }
    catch (e) { s.textContent = 'Export failed: ' + e.message; s.className = 'msg bad'; }
  });
  window.addEventListener('storage', renderData);
  renderAbout(); renderConfig(); renderData();
})();

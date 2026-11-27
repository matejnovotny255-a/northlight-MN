/* Automation: runs the rules in rules.json when the website contact form is sent.
   Actions are a fixed, safe set (no eval). Everything is fake and stays in this browser.
   Nothing is really sent: alerts go to a simulated outbox. */
(function () {
  'use strict';

  const CRM_KEY = 'crm.data.v1';            // read by crm.js
  const HD_KEY = 'helpdesk.tickets.v2';     // read by helpdesk.js
  const OUTBOX_KEY = 'automation.outbox.v1';
  const LOG_KEY = 'automation.log.v1';
  const HD_ID_FLOOR = 1005;                 // demo tickets use HD-1001..1005
  const MAX_ITEMS = 200;
  // Priority is derived by the Help Desk from impact + urgency, so P1 means High + High.
  const PRIORITY_MAP = { P1: { impact: 'High', urgency: 'High' }, P2: { impact: 'Medium', urgency: 'Medium' }, P3: { impact: 'Low', urgency: 'Low' } };

  // Used only if rules.json cannot be loaded (for example when the page is opened as a file),
  // so a customer's message is never lost. They use the same actions as the rules file.
  const FALLBACK_RULES = [
    { id: 'DEFAULT-1', name: 'Create a CRM lead (built-in default)', event: 'contact_form_submitted', actions: [{ type: 'create_crm_lead' }] },
    { id: 'DEFAULT-2', name: 'Create a help desk ticket (built-in default)', event: 'contact_form_submitted', actions: [{ type: 'create_ticket' }] }
  ];

  // ---------- Storage helpers ----------
  const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value)); // may throw if storage is blocked
  const nowIso = () => new Date().toISOString();

  function crmLoad() {
    const d = readJson(CRM_KEY, null);
    const base = { leads: [], accounts: [], contacts: [], opportunities: [], cases: [], seeded: false };
    return d && typeof d === 'object' ? Object.assign(base, d) : base;
  }
  function nextNumber(list) { let max = 0; list.forEach(x => { const n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (n > max) max = n; }); return max + 1; }

  // ---------- Log and outbox ----------
  function logLine(entry) {
    const log = readJson(LOG_KEY, []);
    log.unshift(Object.assign({ at: nowIso() }, entry));
    try { writeJson(LOG_KEY, log.slice(0, MAX_ITEMS)); } catch (e) { /* logging must never break the form */ }
  }
  const getLog = () => readJson(LOG_KEY, []);
  const getOutbox = () => readJson(OUTBOX_KEY, []);
  const clearLog = () => localStorage.removeItem(LOG_KEY);
  const clearOutbox = () => localStorage.removeItem(OUTBOX_KEY);

  // ---------- Rule helpers ----------
  const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Whole word, any case: "URGENT!" matches, "urgently" and "insurgent" do not.
  function containsWord(text, word) {
    return new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRegex(String(word)) + '($|[^\\p{L}\\p{N}_])', 'iu').test(String(text || ''));
  }
  // Replaces {name}, {ticket.id}, {lead.id} ... from the run context. Unknown names become empty.
  function fill(template, ctx) {
    return String(template == null ? '' : template).replace(/\{([a-z]+(?:\.[a-z]+)?)\}/gi, (m, path) => {
      const parts = path.split('.'); let v = parts[0] in ctx.payload && parts.length === 1 ? ctx.payload[parts[0]] : parts.length === 2 ? (ctx[parts[0]] || {})[parts[1]] : undefined;
      return v == null ? '' : String(v);
    });
  }
  function checkCondition(cond, ctx) {
    if (!cond) return { pass: true };
    if ('containsWord' in cond) {
      const pass = containsWord(ctx.payload[cond.field], cond.containsWord);
      return { pass, why: 'the ' + cond.field + ' does ' + (pass ? '' : 'not ') + 'contain the word "' + cond.containsWord + '"' };
    }
    if ('equals' in cond) {
      const pass = String(ctx.payload[cond.field]) === String(cond.equals);
      return { pass, why: 'the ' + cond.field + (pass ? ' equals "' : ' does not equal "') + cond.equals + '"' };
    }
    throw new Error('Unknown condition type');
  }

  // ---------- Actions (fixed, safe set) ----------
  const ACTIONS = {
    create_crm_lead(params, ctx) {
      const d = crmLoad();
      const p = ctx.payload;
      const lead = { id: 'L-' + String(nextNumber(d.leads)).padStart(3, '0'), name: p.name, company: p.company || 'Not given (website)', email: p.email, value: 0, status: 'New', created: nowIso(), converted: null, source: 'Website form', note: p.message };
      d.leads.push(lead);
      writeJson(CRM_KEY, d);
      ctx.lead = lead;
      return 'CRM lead ' + lead.id + ' created for ' + lead.name;
    },
    create_ticket(params, ctx) {
      const tickets = readJson(HD_KEY, []);
      const list = Array.isArray(tickets) ? tickets : [];
      const p = ctx.payload;
      const ticket = {
        id: 'HD-' + (Math.max(HD_ID_FLOOR, nextNumber(list) - 1) + 1),
        requester: p.name,
        issue: ('Website enquiry (' + p.topic + ') from ' + p.email + ': ' + p.message).slice(0, 500),
        impact: 'Low',
        urgency: ['Low', 'Medium', 'High'].includes(p.urgency) ? p.urgency : 'Low',
        status: 'New',
        created: nowIso()
      };
      list.push(ticket);
      writeJson(HD_KEY, list);
      ctx.ticket = ticket;
      return 'Ticket ' + ticket.id + ' created';
    },
    set_ticket_priority(params, ctx) {
      if (!ctx.ticket) throw new Error('No ticket to change (a create_ticket rule must run first)');
      const map = PRIORITY_MAP[params.priority];
      if (!map) throw new Error('Unknown priority "' + params.priority + '"');
      const list = readJson(HD_KEY, []);
      const t = list.find(x => x.id === ctx.ticket.id);
      if (!t) throw new Error('Ticket ' + ctx.ticket.id + ' not found');
      t.impact = map.impact; t.urgency = map.urgency;
      writeJson(HD_KEY, list);
      ctx.ticket = t;
      return 'Ticket ' + t.id + ' set to ' + params.priority;
    },
    add_outbox_alert(params, ctx) {
      const out = getOutbox();
      const item = {
        id: 'OB-' + String(nextNumber(out)).padStart(3, '0'),
        at: nowIso(),
        to: params.to || (window.NorthlightConfig && window.NorthlightConfig.alertRecipient) || 'oncall@example.com', // default comes from config.js
        subject: fill(params.subject, ctx),
        body: fill(params.body, ctx),
        status: 'Simulated, not sent',
        ruleId: ctx.rule.id
      };
      out.unshift(item);
      writeJson(OUTBOX_KEY, out.slice(0, MAX_ITEMS));
      return 'Alert ' + item.id + ' added to outbox (to ' + item.to + ')';
    }
  };

  // ---------- Loading and validating rules ----------
  function validateRules(data) {
    if (!data || !Array.isArray(data.rules)) throw new Error('rules.json must contain a "rules" list');
    data.rules.forEach((r, i) => {
      if (!r || typeof r.id !== 'string' || typeof r.event !== 'string' || !Array.isArray(r.actions)) throw new Error('Rule #' + (i + 1) + ' needs id, event and actions');
    });
    return data.rules;
  }
  async function loadRules(url) {
    const res = await fetch(url || 'rules.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { rules: validateRules(await res.json()), data: null };
  }

  // ---------- The engine ----------
  // opts.rules (array) lets tests supply rules directly; opts.rulesUrl overrides the file name.
  async function run(event, rawPayload, opts) {
    opts = opts || {};
    const payload = {};
    Object.keys(rawPayload || {}).forEach(k => { payload[k] = typeof rawPayload[k] === 'string' ? rawPayload[k].trim() : rawPayload[k]; });
    const ctx = { payload, lead: null, ticket: null, rule: null };
    const results = [];
    let rules, usedFallback = false;
    try { rules = opts.rules ? validateRules({ rules: opts.rules }) : (await loadRules(opts.rulesUrl)).rules; }
    catch (e) {
      usedFallback = true; rules = FALLBACK_RULES;
      logLine({ ruleId: '-', ruleName: 'Load rules', event, status: 'error', detail: 'Could not load rules.json (' + e.message + '). Using the built-in default: CRM lead and ticket only.' });
    }
    for (const rule of rules.filter(r => r.event === event)) {
      const base = { ruleId: rule.id, ruleName: rule.name || rule.id, event };
      ctx.rule = rule;
      if (rule.enabled === false) { logLine(Object.assign(base, { status: 'skipped', detail: 'Rule is disabled' })); results.push({ rule: rule.id, status: 'skipped' }); continue; }
      const done = [];
      try {
        const c = checkCondition(rule.if, ctx);
        if (!c.pass) { logLine(Object.assign(base, { status: 'skipped', detail: 'Condition not met: ' + c.why })); results.push({ rule: rule.id, status: 'skipped' }); continue; }
        for (const action of rule.actions) {
          const fn = ACTIONS[action.type];
          if (!fn) throw new Error('Unknown action "' + action.type + '"');
          done.push(await fn(action, ctx));
        }
        logLine(Object.assign(base, { status: 'ok', detail: (rule.if ? 'Condition met: ' + c.why + '. ' : '') + done.join('; ') }));
        results.push({ rule: rule.id, status: 'ok' });
      } catch (e) {
        logLine(Object.assign(base, { status: 'error', detail: e.message + (done.length ? ' (done before the error: ' + done.join('; ') + ')' : '') }));
        results.push({ rule: rule.id, status: 'error' });
      }
    }
    return { usedFallback, results, lead: ctx.lead, ticket: ctx.ticket };
  }

  window.Automation = { run, loadRules, containsWord, fill, getLog, getOutbox, clearLog, clearOutbox, ACTIONS: Object.keys(ACTIONS) };

  // ---------- Page UI (automation.html) ----------
  const $ = id => document.getElementById(id);
  if (!$('outboxBody')) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const when = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
  function row(body, cells) { const tr = el('tr'); cells.forEach(c => { const td = el('td'); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); }); body.append(tr); }
  function empty(body, text, cols) { const tr = el('tr'); const td = el('td', 'empty', text); td.colSpan = cols; tr.append(td); body.append(tr); }

  async function render() {
    const outbox = getOutbox(), log = getLog();
    $('outCount').textContent = outbox.length; $('logCount').textContent = log.length;
    const ob = $('outboxBody'); ob.replaceChildren();
    if (!outbox.length) empty(ob, 'The outbox is empty. Urgent messages add alerts here.', 5);
    outbox.forEach(m => row(ob, [when(m.at), m.to, m.subject, m.body, el('span', 'pill Leaver', m.status)]));
    const lb = $('logBody'); lb.replaceChildren();
    if (!log.length) empty(lb, 'Nothing has run yet. Send the contact form or try the rules below.', 4);
    log.forEach(l => row(lb, [when(l.at), l.ruleId + ' ' + l.ruleName, el('span', 'pill ' + (l.status === 'ok' ? '' : l.status === 'error' ? 'bad' : 'Leaver'), l.status), l.detail]));
    const rb = $('rulesBody'); rb.replaceChildren();
    try {
      const { rules } = await loadRules();
      rules.forEach(r => row(rb, [r.id, r.name || '', r.event, r.if ? 'if ' + r.if.field + ' ' + ('containsWord' in r.if ? 'contains the word "' + r.if.containsWord + '"' : 'equals "' + r.if.equals + '"') : 'always', r.actions.map(a => a.type + (a.priority ? ' ' + a.priority : '')).join(', '), r.enabled === false ? 'off' : 'on']));
    } catch (e) { empty(rb, 'Could not load rules.json: ' + e.message + ' (open the site over http or https).', 6); }
  }

  $('tryForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('tryMessage').value.trim();
    if (msg.length < 3) { $('tryStatus').textContent = 'Type a test message first.'; $('tryStatus').className = 'msg bad'; return; }
    const r = await run('contact_form_submitted', { name: 'Test Person', email: 'test@example.com', topic: 'General question', message: msg, urgency: 'Low', company: '' });
    $('tryStatus').textContent = 'Rules ran. Ticket ' + (r.ticket ? r.ticket.id : '(none)') + ', lead ' + (r.lead ? r.lead.id : '(none)') + '.';
    $('tryStatus').className = 'msg good';
    render();
  });
  $('clearOutbox').addEventListener('click', () => { if (confirm('Clear the outbox?')) { clearOutbox(); render(); } });
  $('clearLog').addEventListener('click', () => { if (confirm('Clear the log?')) { clearLog(); render(); } });
  window.addEventListener('storage', render);
  render();
})();

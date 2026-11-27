/* Small CRM: leads, accounts, contacts, opportunities and support cases.
   Plain JavaScript and localStorage. All data is fake and stays in this browser. */
(function () {
  'use strict';

  const KEY = 'crm.data.v1';
  const STAGES = ['Lead', 'Qualified', 'Quote', 'Won', 'Lost'];
  const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
  const SLA_HOURS = { Critical: 4, High: 8, Medium: 24, Low: 72 }; // default time to resolve
  const HOUR = 3600000;

  // ---------- Storage ----------
  const empty = () => ({ leads: [], accounts: [], contacts: [], opportunities: [], cases: [], seeded: false });
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === 'object') { const e = empty(); Object.keys(e).forEach(k => { if (k in d) e[k] = d[k]; }); return e; }
    } catch (err) { /* fall through */ }
    return empty();
  }
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));

  function nextId(list, prefix) {
    let max = 0;
    list.forEach(x => { const n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (n > max) max = n; });
    return prefix + '-' + String(max + 1).padStart(3, '0');
  }
  const nowIso = () => new Date().toISOString();
  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  // ---------- Model ----------
  function seed() {
    const d = load();
    if (d.seeded) return;
    const hoursAhead = h => new Date(Date.now() + h * HOUR).toISOString();
    [
      { name: 'Mira Example', company: 'Brightwell Bakery', email: 'mira@example.com', value: 4500 },
      { name: 'Tomas Sample', company: 'Fjord Outdoor Gear', email: 'tomas@example.com', value: 12000 },
      { name: 'Lena Demo', company: 'Oakline Studio Rentals', email: 'lena@example.com', value: 7800 }
    ].forEach(l => { d.leads.push({ id: nextId(d.leads, 'L'), status: 'New', created: nowIso(), converted: null, ...l }); });
    d.cases.push({ id: nextId(d.cases, 'CS'), subject: 'Logo files will not download', accountId: null, priority: 'High', due: hoursAhead(6), status: 'Open', created: nowIso() });
    d.seeded = true;
    save(d);
  }

  function addLead({ name, company, email, value }) {
    name = String(name || '').trim(); company = String(company || '').trim(); email = String(email || '').trim();
    const num = value === '' || value == null ? 0 : Number(value);
    if (!name) throw new Error('Please enter the lead\'s name.');
    if (!company) throw new Error('Please enter the company name.');
    if (!isEmail(email)) throw new Error('Please enter a valid email address.');
    if (!Number.isFinite(num) || num < 0) throw new Error('Expected value must be a number, 0 or more.');
    const d = load();
    const lead = { id: nextId(d.leads, 'L'), name, company, email, value: num, status: 'New', created: nowIso(), converted: null };
    d.leads.push(lead); save(d);
    return lead;
  }

  // Lead -> account + contact + opportunity (stage Qualified). Done in one save, only once per lead.
  function convertLead(leadId) {
    const d = load();
    const lead = d.leads.find(l => l.id === leadId);
    if (!lead) throw new Error('Lead not found.');
    if (lead.status === 'Converted') throw new Error(lead.name + ' is already converted.');
    let account = d.accounts.find(a => a.name.toLowerCase() === lead.company.toLowerCase());
    const reused = !!account;
    if (!account) { account = { id: nextId(d.accounts, 'A'), name: lead.company, created: nowIso(), fromLead: lead.id }; d.accounts.push(account); }
    const contact = { id: nextId(d.contacts, 'C'), name: lead.name, email: lead.email, accountId: account.id };
    d.contacts.push(contact);
    const opp = { id: nextId(d.opportunities, 'O'), name: lead.company + ' opportunity', accountId: account.id, amount: lead.value || 0, stage: 'Qualified', created: nowIso() };
    d.opportunities.push(opp);
    lead.status = 'Converted';
    lead.converted = { accountId: account.id, contactId: contact.id, oppId: opp.id };
    save(d);
    return { account, contact, opportunity: opp, reusedAccount: reused };
  }

  function addOpportunity({ name, accountId, amount, stage }) {
    name = String(name || '').trim();
    const num = amount === '' || amount == null ? 0 : Number(amount);
    const d = load();
    if (!name) throw new Error('Please enter an opportunity name.');
    if (!d.accounts.some(a => a.id === accountId)) throw new Error('Choose an account (convert a lead first to create one).');
    if (!Number.isFinite(num) || num < 0) throw new Error('Amount must be a number, 0 or more.');
    if (!STAGES.includes(stage)) throw new Error('Choose a valid stage.');
    const opp = { id: nextId(d.opportunities, 'O'), name, accountId, amount: num, stage, created: nowIso() };
    d.opportunities.push(opp); save(d);
    return opp;
  }

  function setStage(oppId, stage) {
    if (!STAGES.includes(stage)) throw new Error('Invalid stage.');
    const d = load(); const o = d.opportunities.find(x => x.id === oppId);
    if (!o) throw new Error('Opportunity not found.');
    o.stage = stage; save(d); return o;
  }

  function addCase({ subject, accountId, priority, due }, now = Date.now()) {
    subject = String(subject || '').trim();
    const dueMs = Date.parse(due);
    const d = load();
    if (!subject) throw new Error('Please describe the case.');
    if (!PRIORITIES.includes(priority)) throw new Error('Choose a priority.');
    if (Number.isNaN(dueMs)) throw new Error('Please set a due date and time.');
    if (dueMs <= now) throw new Error('The due time must be in the future.');
    if (accountId && !d.accounts.some(a => a.id === accountId)) throw new Error('Unknown account.');
    const c = { id: nextId(d.cases, 'CS'), subject, accountId: accountId || null, priority, due: new Date(dueMs).toISOString(), status: 'Open', created: nowIso() };
    d.cases.push(c); save(d);
    return c;
  }

  function setCaseStatus(caseId, status) {
    if (!['Open', 'Closed'].includes(status)) throw new Error('Invalid status.');
    const d = load(); const c = d.cases.find(x => x.id === caseId);
    if (!c) throw new Error('Case not found.');
    c.status = status; save(d); return c;
  }

  const isOverdue = (c, now = Date.now()) => c.status === 'Open' && now > Date.parse(c.due);
  const defaultDue = (priority, now = Date.now()) => new Date(now + SLA_HOURS[priority] * HOUR);

  function stageSummary(opps) {
    return STAGES.map(s => { const list = opps.filter(o => o.stage === s); return { stage: s, count: list.length, amount: list.reduce((t, o) => t + (o.amount || 0), 0) }; });
  }

  window.CrmModel = { load, save, seed, addLead, convertLead, addOpportunity, setStage, addCase, setCaseStatus, isOverdue, defaultDue, stageSummary, STAGES, PRIORITIES, SLA_HOURS };

  // ---------- UI ----------
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const cfg = window.NorthlightConfig || {};  // settings from config.js (locale, currency)
  const money = n => new Intl.NumberFormat(cfg.locale || undefined, { style: 'currency', currency: cfg.currency || 'EUR', maximumFractionDigits: 0 }).format(n || 0);
  const when = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, text) => { const e = document.createElementNS(SVGNS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); if (text != null) e.textContent = text; return e; };

  function say(id, msg, good) { const n = $(id); n.textContent = msg || ''; n.className = 'msg ' + (good ? 'good' : 'bad'); }
  const accName = (d, id) => { const a = d.accounts.find(x => x.id === id); return a ? a.name : '—'; };

  function cell(tr, text, cls) { const td = el('td', cls, text); tr.append(td); return td; }
  function fillTable(bodyId, rows, emptyText, cols) {
    const body = $(bodyId); body.replaceChildren();
    if (!rows.length) { const tr = el('tr'); const td = el('td', 'empty', emptyText); td.colSpan = cols; tr.append(td); body.append(tr); }
    else rows.forEach(r => body.append(r));
  }

  // ----- Chart: opportunities by stage, plain SVG -----
  function drawChart(opps) {
    const data = stageSummary(opps);
    const W = 640, H = 330, L = 44, R = 16, T = 28, B = 62;
    const plotW = W - L - R, plotH = H - T - B;
    const maxCount = Math.max(1, ...data.map(x => x.count));
    const step = Math.max(1, Math.ceil(maxCount / 5));
    const top = Math.ceil(maxCount / step) * step;
    const slot = plotW / data.length, barW = Math.min(76, slot * 0.6);
    const label = 'Opportunities by stage: ' + data.map(x => x.stage + ' ' + x.count).join(', ') + '.';

    const root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-labelledby': 'chartTitle chartDesc', class: 'chart-svg', preserveAspectRatio: 'xMidYMid meet' });
    root.append(svg('title', { id: 'chartTitle' }, 'Opportunities by stage'), svg('desc', { id: 'chartDesc' }, label));
    for (let v = 0; v <= top; v += step) {
      const y = T + plotH - (v / top) * plotH;
      root.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: v === 0 ? 'axis' : 'grid' }));
      root.append(svg('text', { x: L - 8, y: y + 4, class: 'tick', 'text-anchor': 'end' }, String(v)));
    }
    data.forEach((s, i) => {
      const cx = L + slot * i + slot / 2;
      const h = (s.count / top) * plotH;
      root.append(svg('rect', { x: cx - barW / 2, y: T + plotH - h, width: barW, height: h, rx: 4, class: 'bar bar-' + s.stage, 'data-stage': s.stage, 'data-count': s.count }));
      root.append(svg('text', { x: cx, y: T + plotH - h - 7, class: 'bar-count', 'text-anchor': 'middle' }, String(s.count)));
      root.append(svg('text', { x: cx, y: H - B + 20, class: 'stage-label', 'text-anchor': 'middle' }, s.stage));
      root.append(svg('text', { x: cx, y: H - B + 38, class: 'amount-label', 'text-anchor': 'middle' }, money(s.amount)));
    });
    const box = $('chart'); box.replaceChildren(root);
    $('chartNote').textContent = opps.length ? '' : 'No opportunities yet. Convert a lead to create one.';
  }

  function renderOverview(d) {
    const open = d.opportunities.filter(o => o.stage !== 'Won' && o.stage !== 'Lost');
    const openCases = d.cases.filter(c => c.status === 'Open');
    const over = openCases.filter(c => isOverdue(c)).length;
    const tiles = [
      [d.leads.filter(l => l.status === 'New').length, 'New leads'],
      [open.length + ' · ' + money(open.reduce((t, o) => t + o.amount, 0)), 'Open opportunities'],
      [d.opportunities.filter(o => o.stage === 'Won').length + ' · ' + money(d.opportunities.filter(o => o.stage === 'Won').reduce((t, o) => t + o.amount, 0)), 'Won'],
      [openCases.length + (over ? ' (' + over + ' overdue)' : ''), 'Open cases']
    ];
    const box = $('tiles'); box.replaceChildren();
    tiles.forEach(([v, l]) => { const t = el('div', 'tile'); t.append(el('strong', null, String(v)), el('span', null, l)); box.append(t); });
    drawChart(d.opportunities);
  }

  function renderLeads(d) {
    const rows = d.leads.map(l => {
      const tr = el('tr', l.status === 'Converted' ? 'left' : '');
      cell(tr, l.id); cell(tr, l.name); cell(tr, l.company); cell(tr, l.email); cell(tr, money(l.value));
      const st = cell(tr, ''); st.append(el('span', 'pill ' + (l.status === 'Converted' ? 'Leaver' : ''), l.status));
      const act = cell(tr, '');
      const b = el('button', 'small', l.status === 'Converted' ? 'Converted' : 'Convert');
      b.type = 'button'; b.disabled = l.status === 'Converted';
      b.setAttribute('aria-label', (b.disabled ? 'Already converted: ' : 'Convert lead ') + l.name);
      b.dataset.convert = l.id;
      b.addEventListener('click', () => {
        try {
          const r = convertLead(l.id);
          say('leadMsg', l.name + ' converted: ' + (r.reusedAccount ? 'existing account ' : 'new account ') + r.account.name + ', contact ' + r.contact.name + ', opportunity ' + r.opportunity.id + ' (Qualified).', true);
        } catch (e) { say('leadMsg', e.message, false); }
        render();
      });
      act.append(b);
      return tr;
    });
    fillTable('leadsBody', rows, 'No leads yet.', 7);
  }

  function renderAccounts(d) {
    fillTable('accountsBody', d.accounts.map(a => { const tr = el('tr'); cell(tr, a.id); cell(tr, a.name); cell(tr, String(d.contacts.filter(c => c.accountId === a.id).length)); cell(tr, String(d.opportunities.filter(o => o.accountId === a.id).length)); return tr; }), 'No accounts yet. Convert a lead to create one.', 4);
    fillTable('contactsBody', d.contacts.map(c => { const tr = el('tr'); cell(tr, c.id); cell(tr, c.name); cell(tr, c.email); cell(tr, accName(d, c.accountId)); return tr; }), 'No contacts yet. Convert a lead to create one.', 4);
  }

  function renderOpps(d) {
    const sel = $('oppAccount'); const keep = sel.value; sel.replaceChildren();
    d.accounts.forEach(a => sel.append(new Option(a.name, a.id)));
    if (keep) sel.value = keep;
    fillTable('oppsBody', d.opportunities.map(o => {
      const tr = el('tr'); cell(tr, o.id); cell(tr, o.name); cell(tr, accName(d, o.accountId)); cell(tr, money(o.amount));
      const s = el('select', 'status-select'); s.setAttribute('aria-label', 'Stage for ' + o.name);
      STAGES.forEach(x => { const op = el('option', null, x); op.selected = x === o.stage; s.append(op); });
      s.addEventListener('change', () => { try { setStage(o.id, s.value); } catch (e) { say('oppMsg', e.message, false); } render(); });
      cell(tr, '').append(s);
      return tr;
    }), 'No opportunities yet.', 5);
  }

  function renderCases(d) {
    const sel = $('caseAccount'); const keep = sel.value; sel.replaceChildren(new Option('No account', ''));
    d.accounts.forEach(a => sel.append(new Option(a.name, a.id)));
    if (keep) sel.value = keep;
    const rank = c => (c.status === 'Open' ? 0 : 1);
    const sorted = d.cases.slice().sort((a, b) => rank(a) - rank(b) || Date.parse(a.due) - Date.parse(b.due));
    fillTable('casesBody', sorted.map(c => {
      const tr = el('tr', c.status === 'Closed' ? 'left' : ''); tr.dataset.id = c.id;
      cell(tr, c.id); cell(tr, c.subject); cell(tr, accName(d, c.accountId));
      cell(tr, '').append(el('span', 'badge pr-' + c.priority, c.priority));
      const due = cell(tr, when(c.due)); if (isOverdue(c)) due.append(' ', el('span', 'badge tag-overdue', 'Overdue'));
      cell(tr, c.status);
      const b = el('button', 'small secondary', c.status === 'Open' ? 'Close' : 'Reopen'); b.type = 'button';
      b.addEventListener('click', () => { try { setCaseStatus(c.id, c.status === 'Open' ? 'Closed' : 'Open'); } catch (e) { say('caseMsg', e.message, false); } render(); });
      cell(tr, '').append(b);
      return tr;
    }), 'No cases yet.', 7);
  }

  function render() {
    const d = load();
    renderOverview(d); renderLeads(d); renderAccounts(d); renderOpps(d); renderCases(d);
    const counts = { leads: d.leads.length, accounts: d.accounts.length, contacts: d.contacts.length, opps: d.opportunities.length, cases: d.cases.filter(c => c.status === 'Open').length };
    document.querySelectorAll('[data-count]').forEach(n => { n.textContent = counts[n.dataset.count]; });
  }

  // ----- Tabs -----
  function showTab(name) {
    document.querySelectorAll('[role=tab]').forEach(t => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('[role=tabpanel]').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
  }

  // ----- Forms -----
  function toLocalInput(date) {
    const p = n => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) + 'T' + p(date.getHours()) + ':' + p(date.getMinutes());
  }
  function suggestDue() { $('caseDue').value = toLocalInput(defaultDue($('casePriority').value)); }

  function init() {
    seed();
    document.querySelectorAll('[role=tab]').forEach(t => {
      t.addEventListener('click', () => showTab(t.dataset.tab));
      t.addEventListener('keydown', e => {
        const tabs = [...document.querySelectorAll('[role=tab]')]; const i = tabs.indexOf(t);
        const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : -1;
        if (j >= 0) { tabs[j].focus(); showTab(tabs[j].dataset.tab); e.preventDefault(); }
      });
    });
    PRIORITIES.forEach(p => $('casePriority').append(new Option(p, p)));
    $('casePriority').value = 'Medium';
    STAGES.forEach(s => $('oppStage').append(new Option(s, s)));
    $('oppStage').value = 'Qualified';
    suggestDue();
    $('casePriority').addEventListener('change', suggestDue);

    $('leadForm').addEventListener('submit', e => {
      e.preventDefault();
      try { const l = addLead({ name: $('leadName').value, company: $('leadCompany').value, email: $('leadEmail').value, value: $('leadValue').value }); $('leadForm').reset(); say('leadMsg', 'Lead ' + l.id + ' added.', true); }
      catch (err) { say('leadMsg', err.message, false); }
      render();
    });
    $('oppForm').addEventListener('submit', e => {
      e.preventDefault();
      try { const o = addOpportunity({ name: $('oppName').value, accountId: $('oppAccount').value, amount: $('oppAmount').value, stage: $('oppStage').value }); $('oppName').value = ''; $('oppAmount').value = ''; say('oppMsg', 'Opportunity ' + o.id + ' added.', true); }
      catch (err) { say('oppMsg', err.message, false); }
      render();
    });
    $('caseForm').addEventListener('submit', e => {
      e.preventDefault();
      try {
        const c = addCase({ subject: $('caseSubject').value, accountId: $('caseAccount').value, priority: $('casePriority').value, due: $('caseDue').value });
        $('caseSubject').value = ''; suggestDue(); say('caseMsg', 'Case ' + c.id + ' added.', true);
      } catch (err) { say('caseMsg', err.message, false); }
      render();
    });
    $('reset').addEventListener('click', () => {
      if (!confirm('Reset the CRM back to the three sample leads and one case?')) return;
      localStorage.removeItem(KEY); seed(); render(); say('leadMsg', '', true);
    });
    window.addEventListener('storage', render);
    setInterval(render, 60000); // keep Overdue labels current
    render();
  }

  if ($('tab-overview')) init();
})();

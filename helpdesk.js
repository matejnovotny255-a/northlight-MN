(function () {
  'use strict';

  const KEY = 'helpdesk.tickets.v2';
  const SEED_KEY = 'helpdesk.seeded.v2';
  const LEVELS = ['Low', 'Medium', 'High'];
  const STATUSES = ['New', 'In progress', 'Resolved'];
  const HOUR = 3600000;
  // Response target per priority, in hours.
  const TARGETS = { P1: { label: '1 hour', ms: HOUR }, P2: { label: '4 hours', ms: 4 * HOUR }, P3: { label: '24 hours', ms: 24 * HOUR } };

  // Priority matrix: impact + urgency score (2..6) -> P1 (5-6), P2 (3-4), P3 (2).
  function priorityFor(impact, urgency) {
    const score = LEVELS.indexOf(impact) + LEVELS.indexOf(urgency) + 2;
    return score >= 5 ? 'P1' : score >= 3 ? 'P2' : 'P3';
  }

  const ago = h => new Date(Date.now() - h * HOUR).toISOString();
  // Fake demo data only. Created times are relative to now so some tickets show as Overdue.
  const SAMPLE = [
    { id: 'HD-1001', requester: 'Alex Example', issue: 'Shared drive is unreachable for the whole team.', impact: 'High', urgency: 'High', status: 'New', created: ago(3) },
    { id: 'HD-1002', requester: 'Sam Sample', issue: 'Printer on floor 2 prints blank pages.', impact: 'Low', urgency: 'Medium', status: 'In progress', created: ago(5) },
    { id: 'HD-1003', requester: 'Jo Placeholder', issue: 'Need a licence for a design tool.', impact: 'Low', urgency: 'Low', status: 'New', created: ago(2) },
    { id: 'HD-1004', requester: 'Pat Demo', issue: 'VPN drops every few minutes.', impact: 'Medium', urgency: 'High', status: 'In progress', created: ago(0.5) },
    { id: 'HD-1005', requester: 'Kim Test', issue: 'Password reset for a new laptop.', impact: 'Low', urgency: 'Low', status: 'Resolved', created: ago(30) }
  ];

  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const save = t => localStorage.setItem(KEY, JSON.stringify(t));

  function seed() {
    if (localStorage.getItem(SEED_KEY)) return;
    const tickets = load();
    const ids = new Set(tickets.map(t => t.id));
    SAMPLE.forEach(s => { if (!ids.has(s.id)) tickets.push(s); });
    save(tickets);
    localStorage.setItem(SEED_KEY, '1');
  }

  function newId(tickets) {
    let max = 1000;
    tickets.forEach(t => { const n = parseInt(String(t.id).replace(/\D/g, ''), 10); if (n > max) max = n; });
    return 'HD-' + (max + 1);
  }

  const dueAt = t => new Date(t.created).getTime() + TARGETS[priorityFor(t.impact, t.urgency)].ms;
  const isOverdue = t => t.status !== 'Resolved' && Date.now() > dueAt(t);
  const fmt = ms => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function meta(label, value) { const d = el('div'); d.append(el('span', null, label), el('b', null, value)); return d; }

  function render() {
    const tickets = load();
    const list = document.getElementById('list');
    document.getElementById('count').textContent = tickets.length;
    list.replaceChildren();
    if (!tickets.length) { list.append(el('li', 'empty', 'No tickets yet.')); return; }

    const sorted = tickets.slice().sort((a, b) =>
      priorityFor(a.impact, a.urgency).localeCompare(priorityFor(b.impact, b.urgency)) ||
      new Date(a.created) - new Date(b.created));

    sorted.forEach(t => {
      const p = priorityFor(t.impact, t.urgency);
      const li = el('li', 'ticket ' + p + (t.status === 'Resolved' ? ' resolved' : ''));
      li.dataset.id = t.id;

      const top = el('div', 'top');
      top.append(el('span', 'id', t.id));
      const badges = el('span');
      badges.append(el('span', 'badge ' + p, p));
      if (isOverdue(t)) badges.append(el('span', 'badge overdue', 'Overdue'));
      top.append(badges);

      const sel = el('select', 'status-select');
      sel.setAttribute('aria-label', 'Status for ' + t.id);
      STATUSES.forEach(s => { const o = el('option', null, s); o.selected = s === t.status; sel.append(o); });
      sel.addEventListener('change', () => {
        const all = load();
        const target = all.find(x => x.id === t.id);
        if (target) { target.status = sel.value; save(all); render(); }
      });
      const statusBox = el('div'); statusBox.append(el('span', null, 'Status'), sel);

      const m = el('div', 'meta');
      m.append(meta('Requester', t.requester), meta('Impact / urgency', t.impact + ' / ' + t.urgency),
               meta('Response target', TARGETS[p].label), meta('Created', fmt(new Date(t.created).getTime())),
               meta('Due', fmt(dueAt(t))), statusBox);

      li.append(top, el('div', 'issue', t.issue), m);
      list.append(li);
    });
  }

  const form = document.getElementById('form');
  const preview = document.getElementById('preview');
  const rules = {
    requester: v => v ? '' : 'Requester is required.',
    issue: v => v ? '' : 'Issue is required.'
  };

  function updatePreview() {
    const p = priorityFor(form.impact.value, form.urgency.value);
    preview.textContent = 'Priority ' + p + ' · response target ' + TARGETS[p].label;
  }
  form.impact.addEventListener('change', updatePreview);
  form.urgency.addEventListener('change', updatePreview);

  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    Object.keys(rules).forEach(name => {
      const f = form.elements[name];
      const msg = rules[name](f.value.trim());
      f.classList.toggle('invalid', !!msg);
      f.parentElement.querySelector('.err').textContent = msg;
      if (msg && ok) { f.focus(); ok = false; }
    });
    if (!ok) return;
    const tickets = load();
    tickets.push({
      id: newId(tickets),
      requester: form.requester.value.trim(),
      issue: form.issue.value.trim(),
      impact: form.impact.value,
      urgency: form.urgency.value,
      status: 'New',
      created: new Date().toISOString()
    });
    save(tickets);
    form.reset();
    updatePreview();
    render();
  });

  seed();
  updatePreview();
  render();
  setInterval(render, 60000); // keep Overdue labels current
})();

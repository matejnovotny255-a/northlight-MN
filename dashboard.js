/* Dashboard: a live overview built from the data already saved in this browser.
   It seeds the CRM and Help Desk demo data the first time (same seeds those pages use), then only reads. */
(function () {
  'use strict';
  const NL = window.NL;
  const $ = id => document.getElementById(id);
  if (!$('stats') || !NL) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const data = NL.data;

  try { if (window.CrmModel) CrmModel.seed(); } catch (e) { /* storage blocked */ }
  try { if (window.HelpdeskModel) HelpdeskModel.seed(); } catch (e) { /* storage blocked */ }

  const ago = iso => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
  };
  const overBy = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : (m / 60).toFixed(m % 60 ? 1 : 0) + ' h'; };
  const clip = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;

  function stat(icon, tone, label, value, subNode) {
    const d = el('div', 'stat');
    const i = el('span', 'stat-ico ' + tone); i.append(NL.iconEl(icon));
    d.append(i, el('span', 'label', label), el('span', 'value', String(value)));
    const sub = el('span', 'sub'); if (subNode) sub.append(subNode); d.append(sub);
    return d;
  }
  const span = (cls, text) => el('span', cls, text);
  const join = (...parts) => { const f = document.createDocumentFragment(); parts.forEach(p => f.append(p)); return f; };

  function empty(icon, title, text, href, cta) {
    const d = el('div', 'empty-state'); d.append(NL.iconEl(icon), el('strong', null, title), document.createTextNode(text));
    if (href) { const a = el('a', 'btn secondary small', cta); a.href = href; d.append(el('br'), a); }
    return d;
  }

  function render() {
    const now = Date.now();
    const tickets = data.tickets(), crm = data.crm(), outbox = data.outbox(), log = data.log();
    const openT = tickets.filter(t => t.status !== 'Resolved');
    const p1 = openT.filter(t => data.priorityFor(t.impact, t.urgency) === 'P1');
    const overT = tickets.filter(t => data.ticketOverdue(t, now));
    const openC = crm.cases.filter(c => c.status === 'Open');
    const overC = openC.filter(c => data.caseOverdue(c, now));
    const openOpps = crm.opportunities.filter(o => o.stage !== 'Won' && o.stage !== 'Lost');
    const won = crm.opportunities.filter(o => o.stage === 'Won');
    const sum = l => l.reduce((t, o) => t + (o.amount || 0), 0);

    // ----- Stat cards -----
    const stats = $('stats'); stats.replaceChildren(
      stat('lifebuoy', '', 'Open tickets', openT.length, join(span(p1.length ? 'bad' : '', p1.length + ' P1'), document.createTextNode(' · ' + tickets.length + ' total'))),
      stat('alert', 'rose', 'Overdue', overT.length + overC.length, document.createTextNode(overT.length + ' tickets · ' + overC.length + ' cases')),
      stat('trend', 'teal', 'Open pipeline', NL.money(sum(openOpps)), document.createTextNode(openOpps.length + ' open ' + (openOpps.length === 1 ? 'opportunity' : 'opportunities'))),
      stat('check', 'violet', 'Won revenue', NL.money(sum(won)), document.createTextNode(won.length + ' won ' + (won.length === 1 ? 'deal' : 'deals'))),
      stat('users', 'amber', 'New leads', crm.leads.filter(l => l.status === 'New').length, document.createTextNode(crm.leads.length + ' leads in total')),
      stat('mail', '', 'Outbox alerts', outbox.length, document.createTextNode('Simulated, never sent'))
    );

    // ----- Pipeline by stage (bar) -----
    const stages = data.stageSummary(crm.opportunities);
    const cls = { Lead: 'bar-Lead', Qualified: 'bar-Qualified', Quote: 'bar-Quote', Won: 'bar-Won', Lost: 'bar-Lost' };
    NL.charts.bar($('pipeChart'), {
      title: 'Opportunities by stage',
      desc: 'Opportunities by stage: ' + stages.map(s => s.stage + ' ' + s.count).join(', ') + '.',
      data: stages.map(s => ({ key: s.stage, label: s.stage, value: s.count, sub: NL.money(s.amount), cls: cls[s.stage], attrs: { 'data-stage': s.stage, 'data-count': s.count }, tip: s.count + (s.count === 1 ? ' opportunity' : ' opportunities') + ' · ' + NL.money(s.amount) }))
    });
    $('pipeNote').textContent = crm.opportunities.length ? '' : 'No opportunities yet. Convert a lead in the CRM to see your pipeline.';

    // ----- Tickets by priority (donut) -----
    const tp = ['P1', 'P2', 'P3'].map(p => ({ key: p, label: p + ' · ' + data.TARGET_H[p] + (data.TARGET_H[p] === 1 ? ' hour' : ' hours'), value: openT.filter(t => data.priorityFor(t.impact, t.urgency) === p).length, cls: { P1: 's-rose', P2: 's-amber', P3: 's-teal' }[p] }));
    const tBox = $('ticketChart');
    if (openT.length) NL.charts.donut(tBox, { title: 'Open tickets by priority', desc: 'Open tickets by priority: ' + tp.map(x => x.key + ' ' + x.value).join(', ') + '.', data: tp, centerLabel: 'open' });
    else tBox.replaceChildren(empty('inbox', 'No open tickets', 'New tickets from the Help Desk and the contact form appear here.', 'helpdesk.html', 'Open Help Desk'));

    // ----- Cases by priority (donut) -----
    const prs = [['Critical', 's-rose'], ['High', 's-amber'], ['Medium', 's-blue'], ['Low', 's-teal']];
    const cp = prs.map(([p, c]) => ({ key: p, label: p, value: openC.filter(x => x.priority === p).length, cls: c }));
    const cBox = $('caseChart');
    if (openC.length) NL.charts.donut(cBox, { title: 'Open support cases by priority', desc: 'Open support cases by priority: ' + cp.map(x => x.key + ' ' + x.value).join(', ') + '.', data: cp, centerLabel: 'open cases' });
    else cBox.replaceChildren(empty('briefcase', 'No open cases', 'Support cases from the CRM appear here.', 'crm.html', 'Open CRM'));

    // ----- Needs attention -----
    const att = [];
    overT.forEach(t => att.push({ due: data.ticketDue(t), tone: 'danger', icon: 'clock', href: 'helpdesk.html', title: t.id + ' · ' + clip(t.issue, 48), sub: 'Overdue by ' + overBy(now - data.ticketDue(t)) + ' · ' + data.priorityFor(t.impact, t.urgency) }));
    overC.forEach(c => att.push({ due: Date.parse(c.due), tone: 'warning', icon: 'briefcase', href: 'crm.html', title: c.id + ' · ' + clip(c.subject, 48), sub: 'Case overdue by ' + overBy(now - Date.parse(c.due)) + ' · ' + c.priority }));
    p1.filter(t => !data.ticketOverdue(t, now)).forEach(t => att.push({ due: data.ticketDue(t), tone: 'danger', icon: 'alert', href: 'helpdesk.html', title: t.id + ' · ' + clip(t.issue, 48), sub: 'P1, due in ' + overBy(data.ticketDue(t) - now) }));
    att.sort((a, b) => a.due - b.due);
    const aBox = $('attention');
    if (att.length) {
      const ul = el('ul', 'list');
      att.slice(0, 6).forEach(i => { const li = el('li'); const ic = el('span', 'li-ico ' + i.tone); ic.append(NL.iconEl(i.icon)); const m = el('div', 'li-main'); const a = el('a'); a.href = i.href; a.append(el('strong', null, i.title)); m.append(a, el('small', null, i.sub)); li.append(ic, m); ul.append(li); });
      aBox.replaceChildren(ul);
    } else aBox.replaceChildren(empty('check', 'Nothing needs attention', 'No overdue tickets or cases, and no open P1 tickets.'));

    // ----- Recent automation activity -----
    const act = $('activity');
    if (log.length) {
      const ul = el('ul', 'list');
      log.slice(0, 6).forEach(l => {
        const tone = l.status === 'ok' ? 'ok' : l.status === 'error' ? 'danger' : '';
        const li = el('li'); const ic = el('span', 'li-ico ' + tone); ic.append(NL.iconEl(l.status === 'ok' ? 'check' : l.status === 'error' ? 'alert' : 'clock'));
        const m = el('div', 'li-main'); m.append(el('strong', null, l.ruleName || l.ruleId), el('small', null, clip(l.detail || '', 70) + ' · ' + ago(l.at)));
        li.append(ic, m); ul.append(li);
      });
      act.replaceChildren(ul);
    } else act.replaceChildren(empty('zap', 'No automation runs yet', 'Send the website contact form and the rules in rules.json run here.', 'index.html#contact', 'Open contact form'));
    if (NL.refreshBell) NL.refreshBell();
  }

  render();
  setInterval(render, 60000);
  window.addEventListener('storage', render);
})();

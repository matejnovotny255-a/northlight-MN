/* Northlight UI: icons, theme, app shell (sidebar, notifications, profile) and table/list filters.
   Plain JavaScript, no dependencies. Everything shown comes from data already in this browser. */
(function () {
  'use strict';
  const NL = window.NL = window.NL || {};

  // ---------- Theme (applied immediately to avoid a flash) ----------
  const THEME_KEY = 'ui.theme';
  const storedTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } };
  function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  applyTheme(storedTheme());
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);

  // ---------- Icons (24px grid, 1.75 stroke) ----------
  const ICONS = {
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20v-1.2A4.8 4.8 0 0 1 7.3 14h3.4a4.8 4.8 0 0 1 4.8 4.8V20"/><path d="M16 4.7a3.4 3.4 0 0 1 0 6.6M18.2 14.3a4.8 4.8 0 0 1 3.3 4.5V20"/>',
    lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
    zap: '<path d="M13.2 2.5L4.5 13.6h6.3l-.9 7.9 8.6-11.3h-6.2z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-2.1 5.5-5.5 2.1 2.1-5.5z"/>',
    shield: '<path d="M12 3l7.5 2.8v5.6c0 4.6-3.1 8-7.5 9.6-4.4-1.6-7.5-5-7.5-9.6V5.8z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
    sliders: '<path d="M4 6.5h8M17 6.5h3M4 12h3M12 12h8M4 17.5h10M19 17.5h1"/><circle cx="14.5" cy="6.5" r="2.2"/><circle cx="9.5" cy="12" r="2.2"/><circle cx="16.5" cy="17.5" r="2.2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    bell: '<path d="M6 9.5a6 6 0 0 1 12 0c0 5.5 2.2 7 2.2 7H3.8S6 15 6 9.5z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.6A8 8 0 1 1 9.4 4a6.4 6.4 0 0 0 10.6 10.6z"/>',
    download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
    'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1.2 3h5.6L16 13h5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    ticket: '<path d="M3 8.5A2 2 0 0 0 3 12.5v1A2 2 0 0 1 5 15.5h14a2 2 0 0 1 2-2v-1a2 2 0 0 0 0-4v-1a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v14" stroke-dasharray="2 3"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.2A1.7 1.7 0 0 1 10.7 3.5h2.6A1.7 1.7 0 0 1 15 5.2V7M3 13h18"/>',
    alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.2"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8.2 12.2l2.6 2.6 5-5.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20v-1a5.5 5.5 0 0 1 5.5-5.5h4a5.5 5.5 0 0 1 5.5 5.5v1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>'
  };
  NL.icon = name => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  NL.iconEl = name => { const t = document.createElement('template'); t.innerHTML = NL.icon(name); return t.content.firstChild; };
  function hydrateIcons(root) { (root || document).querySelectorAll('i[data-icon]').forEach(i => i.replaceWith(NL.iconEl(i.dataset.icon))); }
  NL.hydrateIcons = hydrateIcons;

  // ---------- Shared read-only data helpers (same rules the Help Desk and CRM pages use) ----------
  const HOUR = 3600000, LEVELS = ['Low', 'Medium', 'High'], TARGET_H = { P1: 1, P2: 4, P3: 24 };
  const readJson = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } };
  const data = NL.data = {
    HOUR, TARGET_H,
    priorityFor(impact, urgency) { const s = LEVELS.indexOf(impact) + LEVELS.indexOf(urgency) + 2; return s >= 5 ? 'P1' : s >= 3 ? 'P2' : 'P3'; },
    tickets() { const v = readJson('helpdesk.tickets.v2', []); return Array.isArray(v) ? v : []; },
    crm() { const d = readJson('crm.data.v1', {}); return Object.assign({ leads: [], accounts: [], contacts: [], opportunities: [], cases: [] }, d && typeof d === 'object' ? d : {}); },
    outbox() { const v = readJson('automation.outbox.v1', []); return Array.isArray(v) ? v : []; },
    log() { const v = readJson('automation.log.v1', []); return Array.isArray(v) ? v : []; },
    ticketDue(t) { return Date.parse(t.created) + TARGET_H[data.priorityFor(t.impact, t.urgency)] * HOUR; },
    ticketOverdue(t, now) { return t.status !== 'Resolved' && (now || Date.now()) > data.ticketDue(t); },
    caseOverdue(c, now) { return c.status === 'Open' && (now || Date.now()) > Date.parse(c.due); },
    stageSummary(opps) { return ['Lead', 'Qualified', 'Quote', 'Won', 'Lost'].map(s => { const l = opps.filter(o => o.stage === s); return { stage: s, count: l.length, amount: l.reduce((t, o) => t + (o.amount || 0), 0) }; }); }
  };
  const cfg = () => window.NorthlightConfig || {};
  NL.money = n => new Intl.NumberFormat(cfg().locale || undefined, { style: 'currency', currency: cfg().currency || 'EUR', maximumFractionDigits: 0 }).format(n || 0);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- App shell ----------
  function setupShell() {
    const menuBtn = $('#menuBtn');
    const setNav = open => { document.body.classList.toggle('nav-open', open); if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open)); };
    if (menuBtn) menuBtn.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
    document.querySelectorAll('[data-close-nav], .sidebar-close').forEach(b => b.addEventListener('click', () => setNav(false)));
    document.querySelectorAll('.side-nav a').forEach(a => a.addEventListener('click', () => setNav(false)));

    const themeBtn = $('#themeBtn');
    function paintTheme() { if (!themeBtn) return; themeBtn.replaceChildren(NL.iconEl(isDark() ? 'sun' : 'moon')); themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme'); }
    if (themeBtn) themeBtn.addEventListener('click', () => { const next = isDark() ? 'light' : 'dark'; applyTheme(next); try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage blocked */ } paintTheme(); document.dispatchEvent(new Event('themechange')); });
    paintTheme();

    // Notifications bell
    const bell = $('#bellBtn'), panel = $('#bellPanel'), count = $('#bellCount');
    function notifications() {
      const now = Date.now(), items = [];
      const tickets = data.tickets(), crm = data.crm(), outbox = data.outbox();
      const overdueT = tickets.filter(t => data.ticketOverdue(t, now));
      const p1 = tickets.filter(t => t.status !== 'Resolved' && data.priorityFor(t.impact, t.urgency) === 'P1');
      const overdueC = crm.cases.filter(c => data.caseOverdue(c, now));
      if (overdueT.length) items.push({ tone: 'danger', icon: 'clock', href: 'helpdesk.html', title: overdueT.length + (overdueT.length === 1 ? ' ticket is' : ' tickets are') + ' past the response target', sub: 'Open the Help Desk to respond', n: overdueT.length });
      if (p1.length) items.push({ tone: 'danger', icon: 'alert', href: 'helpdesk.html', title: p1.length + ' open P1 ' + (p1.length === 1 ? 'ticket' : 'tickets'), sub: 'Highest priority, 1 hour target', n: 0 });
      if (overdueC.length) items.push({ tone: 'warning', icon: 'briefcase', href: 'crm.html', title: overdueC.length + ' support ' + (overdueC.length === 1 ? 'case is' : 'cases are') + ' overdue', sub: 'Review the Cases tab in the CRM', n: overdueC.length });
      if (outbox.length) items.push({ tone: 'info', icon: 'mail', href: 'automation.html', title: outbox.length + ' alert' + (outbox.length === 1 ? '' : 's') + ' in the outbox', sub: 'Simulated, never really sent', n: outbox.length });
      return items;
    }
    function paintBell() {
      if (!bell) return;
      const items = notifications(), n = items.reduce((t, i) => t + i.n, 0);
      count.hidden = n === 0; count.textContent = n > 99 ? '99+' : String(n);
      bell.setAttribute('aria-label', n ? 'Notifications, ' + n + ' need attention' : 'Notifications, all clear');
      const list = panel.querySelector('ul'); list.replaceChildren();
      const good = panel.querySelector('.allgood'); good.hidden = items.length > 0;
      items.forEach(i => { const li = el('li', 'tone-' + i.tone); const a = el('a'); a.href = i.href; const t = el('div'); t.append(el('strong', null, i.title), el('small', null, i.sub)); a.append(NL.iconEl(i.icon), t); li.append(a); list.append(li); });
    }
    if (bell && panel) {
      bell.addEventListener('click', e => { e.stopPropagation(); const open = panel.hidden; panel.hidden = !open; bell.setAttribute('aria-expanded', String(open)); if (open) paintBell(); });
      panel.addEventListener('click', e => e.stopPropagation());
      paintBell(); setInterval(paintBell, 60000); window.addEventListener('storage', paintBell);
      NL.refreshBell = paintBell;
    }
    document.addEventListener('click', () => { if (panel && !panel.hidden) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (panel && !panel.hidden) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); bell.focus(); }
      if (document.body.classList.contains('nav-open')) { setNav(false); if (menuBtn) menuBtn.focus(); }
    });

    // Profile chip: the signed-in Staff user (session lives in sessionStorage), else Guest.
    function paintProfile() {
      const chip = $('#profile'); if (!chip) return;
      let u = null;
      try { const id = sessionStorage.getItem('staff.session.v1'); const users = readJson('staff.users.v1', []); u = users.find(x => x.id === id && x.status === 'Active') || null; } catch (e) { /* ignore */ }
      $('#profAvatar').textContent = u ? u.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'G';
      $('#profName').textContent = u ? u.name : 'Guest';
      $('#profRole').textContent = u ? u.group + ' · ' + u.role : 'Not signed in';
      chip.setAttribute('aria-label', u ? 'Signed in as ' + u.name + '. Open staff access' : 'Not signed in. Open staff access');
      document.querySelectorAll('[data-avatar]').forEach(a => { a.textContent = u ? $('#profAvatar').textContent : '?'; });
    }
    paintProfile(); window.addEventListener('staff-session', paintProfile); window.addEventListener('storage', paintProfile);

    // Version label from health.json (same file the Settings page shows)
    const ver = $('#verLabel');
    if (ver) fetch((cfg().healthUrl || 'health.json'), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(h => { if (h && h.version) ver.textContent = 'Version ' + h.version; }).catch(() => {});
  }

  // ---------- Search and filter chips ----------
  // <div class="toolbar" data-filter-for="#list" data-items="li.ticket"> with an input[type=search] and optional .chip[data-sel]
  function rowText(node) {
    // A clone does not keep which <option> is selected, so read the selection from the live selects.
    const live = [...node.querySelectorAll('select')];
    const c = node.cloneNode(true);
    c.querySelectorAll('select').forEach((s, i) => { const o = live[i]; s.replaceWith(document.createTextNode(o && o.options[o.selectedIndex] ? o.options[o.selectedIndex].text : '')); });
    return c.textContent.toLowerCase().replace(/\s+/g, ' ');
  }
  function setupFilter(bar) {
    const target = $(bar.dataset.filterFor); if (!target) return;
    const sel = bar.dataset.items || 'tr';
    const input = $('input[type=search]', bar);
    const chips = [...bar.querySelectorAll('.chip')];
    const none = el('div', 'no-match', 'No matches. Try a different search or clear the filter.'); none.hidden = true;
    (target.closest('.table-wrap') || target).after(none);
    let active = null, queued = false;
    function apply() {
      queued = false;
      const q = input ? input.value.trim().toLowerCase() : '';
      const items = [...target.querySelectorAll(sel)].filter(n => !n.querySelector('td.empty') && !n.classList.contains('empty'));
      let shown = 0;
      items.forEach(n => {
        const okQ = !q || rowText(n).includes(q);
        const okC = !active || n.matches(active) || !!n.querySelector(active);
        n.hidden = !(okQ && okC); if (!n.hidden) shown++;
      });
      none.hidden = !(items.length && shown === 0);
    }
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(apply); } };
    if (input) input.addEventListener('input', apply);
    chips.forEach(c => c.addEventListener('click', () => {
      const on = c.getAttribute('aria-pressed') !== 'true';
      chips.forEach(o => o.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', String(on)); active = on ? c.dataset.sel : null; apply();
    }));
    new MutationObserver(schedule).observe(target, { childList: true, subtree: true });
    apply();
  }

  function init() {
    hydrateIcons();
    setupShell();
    document.querySelectorAll('.toolbar[data-filter-for]').forEach(setupFilter);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* Northlight charts: a small, dependency-free chart kit drawn with plain SVG.
   NL.charts.bar(container, options)   - animated bar chart with gridlines, value labels and tooltips
   NL.charts.donut(container, options) - donut chart with a linked legend and tooltips
   Colours come from CSS variables (see site.css), so charts follow the light and dark themes. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  const svg = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k]));
    if (text != null) e.textContent = text;
    return e;
  };
  const html = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // One tooltip per container. Text is set with textContent only, never innerHTML.
  function tooltip(container) {
    let tip = container.querySelector(':scope > .chart-tip');
    if (!tip) { tip = html('div', 'chart-tip'); tip.setAttribute('aria-hidden', 'true'); container.append(tip); }
    return {
      el: tip,
      show(title, line, x, y) {
        tip.replaceChildren(html('b', null, title), html('span', null, line));
        const box = container.getBoundingClientRect();
        tip.style.left = Math.max(40, Math.min(box.width - 40, x - box.left)) + 'px';
        tip.style.top = (y - box.top - 10) + 'px';
        tip.classList.add('show');
      },
      hide() { tip.classList.remove('show'); }
    };
  }
  const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; };

  // ---------- Bar chart ----------
  // options: { title, desc, data: [{ key, label, value, sub, tip, cls, attrs }], tickStep? }
  function bar(container, options) {
    const data = options.data || [];
    const id = 'ch' + (++uid);
    // Phone-sized containers get a narrower drawing so labels stay readable instead of shrinking.
    const cw = container.clientWidth || 640, narrow = cw < 520;
    const W = narrow ? Math.max(300, Math.round(cw)) : 640, H = narrow ? 290 : 330, L = narrow ? 30 : 44, R = narrow ? 8 : 16, T = 30, B = narrow ? 58 : 64;
    const plotW = W - L - R, plotH = H - T - B, base = T + plotH;
    const max = Math.max(1, ...data.map(d => d.value));
    const step = options.tickStep || Math.max(1, Math.ceil(max / 5));
    const top = Math.ceil(max / step) * step;
    const slot = plotW / Math.max(1, data.length), barW = Math.min(78, slot * (narrow ? 0.62 : 0.58)), radius = narrow ? 5 : 7;

    const root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-labelledby': id + 't ' + id + 'd', class: 'chart-svg' + (narrow ? ' narrow' : ''), preserveAspectRatio: 'xMidYMid meet' });
    root.append(svg('title', { id: id + 't' }, options.title || 'Chart'), svg('desc', { id: id + 'd' }, options.desc || ''));
    const clip = svg('clipPath', { id: id + 'c' });
    clip.append(svg('rect', { x: 0, y: 0, width: W, height: base }));
    root.append(svg('defs', {}), clip);

    for (let v = 0; v <= top; v += step) {
      const y = base - (v / top) * plotH;
      root.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: v === 0 ? 'axis' : 'grid' }));
      root.append(svg('text', { x: L - 10, y: y + 4, class: 'tick', 'text-anchor': 'end' }, String(v)));
    }

    const tip = tooltip(container);
    const bars = svg('g', { 'clip-path': 'url(#' + id + 'c)' });
    root.append(bars);
    const rects = [];
    data.forEach((d, i) => {
      const cx = L + slot * i + slot / 2;
      const h = (d.value / top) * plotH;
      const attrs = Object.assign({ x: cx - barW / 2, y: base - h, width: barW, height: d.value > 0 ? h + radius : 0, rx: radius, class: 'bar ' + (d.cls || 's-blue'), tabindex: 0, style: 'animation-delay:' + (i * 70) + 'ms' }, d.attrs || {});
      const r = svg('rect', attrs);
      rects.push(r); bars.append(r);
      root.append(svg('text', { x: cx, y: base - h - 8, class: 'bar-count', 'text-anchor': 'middle' }, String(d.value)));
      root.append(svg('text', { x: cx, y: H - B + 22, class: 'stage-label', 'text-anchor': 'middle' }, d.label));
      if (d.sub != null) root.append(svg('text', { x: cx, y: H - B + 40, class: 'amount-label', 'text-anchor': 'middle' }, d.sub));
      const on = (x, y) => { root.classList.add('has-hover'); rects.forEach(o => o.classList.toggle('on', o === r)); tip.show(d.label, d.tip || (d.value + ' · ' + (d.sub || '')), x, y); };
      const off = () => { root.classList.remove('has-hover'); r.classList.remove('on'); tip.hide(); };
      r.addEventListener('pointerenter', e => on(e.clientX, e.clientY));
      r.addEventListener('pointermove', e => on(e.clientX, e.clientY));
      r.addEventListener('pointerleave', off);
      r.addEventListener('focus', () => { const c = centerOf(r); on(c.x, c.y); });
      r.addEventListener('blur', off);
    });
    container.replaceChildren(root, tip.el);
    // Redraw when the container crosses the phone breakpoint (rotation, resize, a hidden tab becoming visible).
    container._chartOpts = options; container._chartNarrow = narrow;
    if (!container._chartRO && 'ResizeObserver' in window) {
      container._chartRO = new ResizeObserver(() => {
        const n = container.clientWidth > 0 && container.clientWidth < 520;
        if (container.clientWidth > 0 && n !== container._chartNarrow && container._chartOpts) bar(container, container._chartOpts);
      });
      container._chartRO.observe(container);
    }
    return root;
  }

  // ---------- Donut chart ----------
  // options: { title, desc, data: [{ key, label, value, cls }], centerLabel }
  function donut(container, options) {
    const data = options.data || [];
    const id = 'dn' + (++uid);
    const total = data.reduce((t, d) => t + d.value, 0);
    const S = 180, c = S / 2, r = 64, C = 2 * Math.PI * r, gap = data.filter(d => d.value > 0).length > 1 ? 3 : 0;

    const wrap = html('div', 'donut-wrap');
    const box = html('div', 'donut-box');
    const root = svg('svg', { viewBox: '0 0 ' + S + ' ' + S, role: 'img', 'aria-labelledby': id + 't ' + id + 'd', class: 'donut chart-svg' });
    root.append(svg('title', { id: id + 't' }, options.title || 'Chart'), svg('desc', { id: id + 'd' }, options.desc || ''));
    root.append(svg('circle', { cx: c, cy: c, r, class: 'track' }));
    const tip = tooltip(box);
    const legend = html('ul', 'legend');
    const segs = [], items = [];
    let start = 0;
    data.forEach((d, i) => {
      const pct = total ? Math.round(d.value / total * 100) : 0;
      const li = html('li'); const sw = html('span', 'sw ' + (d.cls || 's-blue'));
      li.append(sw, html('span', null, d.label), html('b', null, String(d.value)), html('em', null, pct + '%'));
      legend.append(li); items.push(li);
      let seg = null;
      if (d.value > 0 && total) {
        const len = Math.max(0.5, d.value / total * C - gap);
        seg = svg('circle', { cx: c, cy: c, r, class: 'seg ' + (d.cls || 's-blue'), 'stroke-dasharray': len + ' ' + (C - len), 'stroke-dashoffset': -start, transform: 'rotate(-90 ' + c + ' ' + c + ')', tabindex: 0, style: 'animation-delay:' + (i * 90) + 'ms' });
        start += d.value / total * C;
        root.append(seg);
      }
      segs.push(seg);
      const on = (x, y) => {
        root.classList.add('has-hover'); segs.forEach(s => s && s.classList.toggle('on', s === seg)); items.forEach(o => o.style.fontWeight = o === li ? '650' : '');
        if (x != null) tip.show(d.label, d.value + ' (' + pct + '%)', x, y);
      };
      const off = () => { root.classList.remove('has-hover'); segs.forEach(s => s && s.classList.remove('on')); items.forEach(o => o.style.fontWeight = ''); tip.hide(); };
      li.addEventListener('pointerenter', () => on()); li.addEventListener('pointerleave', off);
      if (seg) {
        seg.addEventListener('pointermove', e => on(e.clientX, e.clientY)); seg.addEventListener('pointerleave', off);
        seg.addEventListener('focus', () => { const b = centerOf(seg); on(b.x, b.y); }); seg.addEventListener('blur', off);
      }
    });
    root.append(svg('text', { x: c, y: c + 4, class: 'center-num' }, String(total)));
    root.append(svg('text', { x: c, y: c + 24, class: 'center-label' }, options.centerLabel || 'total'));
    box.prepend(root);
    wrap.append(box, legend);
    container.replaceChildren(wrap);
    return root;
  }

  window.NL = window.NL || {};
  window.NL.charts = { bar, donut };
})();

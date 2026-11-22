/* Column layout for the five panels.
 *  - Resize: drag the gutters between panels (double-click a gutter to reset those two widths).
 *  - Fold: every panel folds down to a thin strip (its fold button, or click the strip to bring it back).
 *  - Reorder: drag a panel by its header (or a folded strip) left / right.
 * Order, widths and folds persist in localStorage. Panels are placed with grid-column, so reordering never
 * moves DOM nodes (scroll positions and listeners stay put). The Kit (pads) panel takes the spare width; when
 * it is folded, Pad details (then Browser, Library, Expansion) does. */
const Layout = (() => {
  // Default order, left to right.
  const COLS = [
    { k: 'browser', def: 360, min: 300, label: '<em>&#8981;</em>Sample Library' },
    { k: 'lib', def: 290, min: 210, label: '<em>4</em>Expansion Samples' },
    { k: 'pads', def: 520, min: 380, label: '<em>2</em>Kit' },
    { k: 'detail', def: 500, min: 420, label: '<em>3</em>Pad details' },
    { k: 'exp', def: 230, min: 200, label: '<em>1</em>Expansion · <em>5</em>Export' },
  ];
  // Expansion Samples starts folded (the pads already show what's in the kit). Bumping LAYOUT_V re-applies
  // the default order, folds and widths once for everyone.
  const DEFAULT_FOLD = { lib: true }, LAYOUT_V = 4;
  const byKey = Object.fromEntries(COLS.map(c => [c.k, c]));
  const FOLDED = 46, GUT = 14;
  const appEl = document.getElementById('app'), cols = document.querySelector('.cols');
  const gutEls = [...cols.querySelectorAll('.gutter')];
  const st = { w: {}, fold: {}, order: [] };
  try { Object.assign(st, JSON.parse(localStorage.getItem('eb.layout') || '{}')); } catch (e) {}
  const migrate = st.v !== LAYOUT_V;
  if (migrate) { st.v = LAYOUT_V; st.order = []; st.fold = { ...DEFAULT_FOLD }; st.w = {}; }
  st.order = (st.order || []).filter(k => byKey[k]);
  for (const c of COLS) if (!st.order.includes(c.k)) st.order.push(c.k);
  const save = () => { try { localStorage.setItem('eb.layout', JSON.stringify(st)); } catch (e) {} };
  if (migrate) save();
  const colEl = k => cols.querySelector(`[data-col="${k}"]`);
  const visible = k => k !== 'browser' || appEl.classList.contains('br-on');
  const width = k => st.fold[k] ? FOLDED : (st.w[k] || byKey[k].def);
  let flexKey = 'pads', side = {};          // side[k]: 'l' or 'r' (which window edge the panel folds toward)
  const gutPair = new Map();                // gutter element -> { L, R } keys

  /* Fold buttons and folded strips for every panel. The Pad details panel re-renders its whole contents,
   * so this runs again whenever the columns' DOM changes (it only touches what's missing). */
  function ensureChrome() {
    for (const c of COLS) {
      const el = colEl(c.k); if (!el) continue;
      if (!el.querySelector(':scope > .col-strip')) {
        const s = document.createElement('div');
        s.className = 'col-strip'; s.dataset.unfold = c.k; s.title = 'Show this panel · drag to move it';
        s.innerHTML = `<button class="col-fold" title="Expand"></button><span class="strip-lbl">${c.label}</span>`;
        el.prepend(s);
      }
      const host = c.k === 'pads' ? el.querySelector('.kit-tools') : c.k === 'browser' ? el.querySelector('.br-head') : el.querySelector(':scope > h2');
      if (host && !host.querySelector('[data-fold]')) {
        const b = document.createElement('button');
        b.className = 'col-fold'; b.dataset.fold = c.k; b.title = 'Collapse this panel';
        host.append(b);
      }
      const l = side[c.k] !== 'r';
      el.querySelectorAll('[data-fold]').forEach(b => { const t = l ? '‹' : '›'; if (b.textContent !== t) b.textContent = t; });
      el.querySelectorAll(':scope > .col-strip > .col-fold').forEach(b => { const t = l ? '›' : '‹'; if (b.textContent !== t) b.textContent = t; });
    }
  }

  let painted = 0;
  function apply() {
    const vis = st.order.filter(visible);
    const open = vis.filter(k => !st.fold[k]);
    flexKey = ['pads', 'detail', 'browser', 'lib', 'exp'].find(k => open.includes(k)) || null;
    vis.forEach((k, i) => { side[k] = i < (vis.length - 1) / 2 || (vis.length === 1) ? 'l' : 'r'; });
    // Squeeze the fixed panels proportionally if the window can't fit them plus the flexible one.
    const avail = cols.clientWidth - GUT * (vis.length - 1);
    const fixed = vis.filter(k => k !== flexKey);
    const want = fixed.reduce((a, k) => a + width(k), 0);
    const room = avail - (flexKey ? byKey[flexKey].min : 0);
    const shrinkable = fixed.filter(k => !st.fold[k]);
    const over = want - room;
    const px = {};
    for (const k of fixed) px[k] = width(k);
    if (over > 0 && shrinkable.length) {
      const slack = shrinkable.reduce((a, k) => a + (width(k) - byKey[k].min), 0);
      for (const k of shrinkable) px[k] = Math.max(byKey[k].min, Math.round(width(k) - (slack > 0 ? over * (width(k) - byKey[k].min) / slack : 0)));
    }
    const tracks = [];
    vis.forEach((k, i) => {
      if (i) tracks.push(GUT + 'px');
      tracks.push(k === flexKey ? 'minmax(0, 1fr)' : px[k] + 'px');
    });
    if (!flexKey) tracks.push('minmax(0, 1fr)');   // everything folded: spare room on the right
    cols.style.gridTemplateColumns = tracks.join(' ');
    for (const c of COLS) {
      const el = colEl(c.k); if (!el) continue;
      el.classList.toggle('collapsed', !!st.fold[c.k]);
      const i = vis.indexOf(c.k);
      el.style.gridColumn = i < 0 ? '' : String(2 * i + 1);
      el.style.gridRow = '1';
    }
    gutPair.clear();
    gutEls.forEach((g, i) => {
      const on = i < vis.length - 1;
      g.style.display = on ? '' : 'none';
      if (on) { g.style.gridColumn = String(2 * i + 2); g.style.gridRow = '1'; gutPair.set(g, { L: vis[i], R: vis[i + 1] }); }
    });
    ensureChrome();
    cancelAnimationFrame(painted);
    painted = requestAnimationFrame(() => {
      if (typeof paintWaves === 'function') paintWaves();
      if (typeof paintWaveEditor === 'function') paintWaveEditor();
      if (typeof reportDragRegion === 'function') reportDragRegion();
    });
  }

  function setFold(k, on) { st.fold[k] = on; save(); apply(); }

  // Drag a gutter. Next to the flexible panel only the other side changes; between two fixed panels the
  // boundary moves (one grows, the other shrinks). Folded panels don't resize.
  function startGutterDrag(e, g) {
    const pair = gutPair.get(g); if (!pair) return;
    e.preventDefault();
    const { L, R } = pair;
    const fixedL = L !== flexKey && !st.fold[L], fixedR = R !== flexKey && !st.fold[R];
    if (!fixedL && !fixedR) return;
    const x0 = e.clientX, wL = colEl(L).getBoundingClientRect().width, wR = colEl(R).getBoundingClientRect().width;
    const flexW = flexKey ? colEl(flexKey).getBoundingClientRect().width : cols.clientWidth;
    const flexRoom = flexW - (flexKey ? byKey[flexKey].min : 0);
    g.classList.add('gdrag'); document.body.classList.add('col-resizing');
    const move = ev => {
      let dx = ev.clientX - x0;
      if (fixedL && fixedR) {
        dx = Math.max(byKey[L].min - wL, Math.min(wR - byKey[R].min, dx));
        st.w[L] = Math.round(wL + dx); st.w[R] = Math.round(wR - dx);
      } else if (fixedL) {
        dx = Math.max(byKey[L].min - wL, Math.min(flexRoom, dx));
        st.w[L] = Math.round(wL + dx);
      } else {
        dx = Math.max(-flexRoom, Math.min(wR - byKey[R].min, dx));
        st.w[R] = Math.round(wR - dx);
      }
      apply();
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      g.classList.remove('gdrag'); document.body.classList.remove('col-resizing'); save();
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  }
  for (const g of gutEls) {
    g.addEventListener('mousedown', e => startGutterDrag(e, g));
    g.addEventListener('dblclick', () => { const p = gutPair.get(g); if (!p) return; delete st.w[p.L]; delete st.w[p.R]; save(); apply(); });
  }

  /* Reorder: press on a panel's header (not on a button / field) or on a folded strip, then drag sideways.
   * The panels swap live as the pointer crosses their middles. A plain click still does what it did before. */
  const HANDLE = '[data-col] > h2, [data-col] .br-head, [data-col] .kit-tools, #kitTabs, [data-col] > .col-strip, .panel.collapsed';
  const INTERACTIVE = 'button, input, select, textarea, a, label, [contenteditable], .kit-tab, [data-act], [draggable="true"]';
  let swallowClick = false;
  cols.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('.gutter')) return;
    const h = e.target.closest(HANDLE); if (!h) return;
    const panel = h.closest('[data-col]'); if (!panel) return;
    const inStrip = !!e.target.closest('.col-strip, .panel.collapsed');
    if (!inStrip && e.target.closest(INTERACTIVE)) return;
    const k = panel.dataset.col, x0 = e.clientX, y0 = e.clientY;
    let dragging = false;
    const move = ev => {
      if (!dragging) {
        if (Math.abs(ev.clientX - x0) < 6 || Math.abs(ev.clientX - x0) < Math.abs(ev.clientY - y0)) return;
        dragging = true; panel.classList.add('col-moving'); document.body.classList.add('col-reordering');
      }
      ev.preventDefault();
      const vis = st.order.filter(visible), others = vis.filter(o => o !== k);
      let idx = 0;
      for (const o of others) { const r = colEl(o).getBoundingClientRect(); if (ev.clientX > r.left + r.width / 2) idx++; }
      const want = [...others]; want.splice(idx, 0, k);
      if (want.join() === vis.join()) return;
      // Put the visible panels back into the slots visible panels occupied (a hidden Browser keeps its place).
      let j = 0; st.order = st.order.map(o => visible(o) ? want[j++] : o);
      apply();
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      if (dragging) { panel.classList.remove('col-moving'); document.body.classList.remove('col-reordering'); swallowClick = true; setTimeout(() => { swallowClick = false; }, 0); save(); }
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  });
  cols.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);

  cols.addEventListener('click', e => {
    const f = e.target.closest('[data-fold]'); if (f) { e.stopPropagation(); setFold(f.dataset.fold, true); return; }
    if (e.target.closest('[data-act]')) return;
    const u = e.target.closest('[data-unfold]') || e.target.closest('.panel.collapsed');
    if (u) setFold(u.dataset.unfold || u.dataset.col, false);
  });
  // The browser toggle (browser.js) flips #app.br-on: re-lay the columns when it does.
  new MutationObserver(apply).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(ensureChrome).observe(cols, { childList: true, subtree: true });
  window.addEventListener('resize', apply);
  apply();
  return { apply, setFold, state: st, reset() { st.order = COLS.map(c => c.k); st.w = {}; st.fold = { ...DEFAULT_FOLD }; save(); apply(); } };
})();

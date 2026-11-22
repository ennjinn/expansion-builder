/* Column layout: drag the gutters between panels to resize them, fold the Expansion and
 * Sample library panels down to a thin strip. Widths / folds persist in localStorage. */
const Layout = (() => {
  const COLS = [
    { k: 'exp', def: 280, min: 220 },
    { k: 'pads', flex: true, min: 380 },
    { k: 'detail', def: 460, min: 340 },
    { k: 'lib', def: 290, min: 210 },
    { k: 'browser', def: 430, min: 320 },
  ];
  const FOLDED = 46, GUT = 14;
  const appEl = document.getElementById('app'), cols = document.querySelector('.cols');
  const st = { w: {}, fold: {} };
  try { Object.assign(st, JSON.parse(localStorage.getItem('eb.layout') || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem('eb.layout', JSON.stringify(st)); } catch (e) {} };
  const colEl = k => cols.querySelector(`[data-col="${k}"]`);
  const visible = c => c.k !== 'browser' || appEl.classList.contains('br-on');
  const width = c => st.fold[c.k] ? FOLDED : (st.w[c.k] || c.def);

  // Every gutter sits right before a column; it is shown only when that column is.
  function gutters() {
    return [...cols.querySelectorAll('.gutter')].map(g => {
      let r = g.nextElementSibling; let l = g.previousElementSibling;
      return { g, L: COLS.find(c => c.k === l.dataset.col), R: COLS.find(c => c.k === r.dataset.col) };
    });
  }

  let painted = 0;
  function apply() {
    const vis = COLS.filter(visible);
    for (const c of COLS) {
      const el = colEl(c.k); if (!el) continue;
      el.classList.toggle('collapsed', !!st.fold[c.k]);
    }
    for (const { g, R } of gutters()) g.style.display = visible(R) ? '' : 'none';
    // Squeeze the fixed columns proportionally if the window can't fit them and the pads.
    const avail = cols.clientWidth - GUT * (vis.length - 1);
    const fixed = vis.filter(c => !c.flex);
    const want = fixed.reduce((a, c) => a + width(c), 0);
    const room = avail - COLS[1].min;
    const shrinkable = fixed.filter(c => !st.fold[c.k]);
    const over = want - room;
    const px = {};
    for (const c of fixed) px[c.k] = width(c);
    if (over > 0 && shrinkable.length) {
      const slack = shrinkable.reduce((a, c) => a + (width(c) - c.min), 0);
      for (const c of shrinkable) px[c.k] = width(c) - (slack > 0 ? over * (width(c) - c.min) / slack : 0);
      for (const c of shrinkable) px[c.k] = Math.max(c.min, Math.round(px[c.k]));
    }
    cols.style.gridTemplateColumns = vis.map(c => c.flex ? 'minmax(0, 1fr)' : px[c.k] + 'px').join(` ${GUT}px `);
    cancelAnimationFrame(painted);
    painted = requestAnimationFrame(() => {
      if (typeof paintWaves === 'function') paintWaves();
      if (typeof paintWaveEditor === 'function') paintWaveEditor();
      if (typeof reportDragRegion === 'function') reportDragRegion();
    });
  }

  function setFold(k, on) { st.fold[k] = on; save(); apply(); }

  // Drag a gutter. Next to the flexible pads column only the fixed side changes; between two
  // fixed columns the boundary moves (one grows, the other shrinks).
  function startDrag(e, gu) {
    e.preventDefault();
    const { L, R } = gu;
    const fixedL = !L.flex && !st.fold[L.k], fixedR = !R.flex && !st.fold[R.k];
    if (!fixedL && !fixedR) return;
    const x0 = e.clientX, wL = colEl(L.k).getBoundingClientRect().width, wR = colEl(R.k).getBoundingClientRect().width;
    const padsW = colEl('pads').getBoundingClientRect().width;
    gu.g.classList.add('gdrag'); document.body.classList.add('col-resizing');
    const move = ev => {
      let dx = ev.clientX - x0;
      if (fixedL && fixedR) {
        dx = Math.max(L.min - wL, Math.min(wR - R.min, dx));
        st.w[L.k] = Math.round(wL + dx); st.w[R.k] = Math.round(wR - dx);
      } else if (fixedL) {
        dx = Math.max(L.min - wL, Math.min(padsW - COLS[1].min, dx));
        st.w[L.k] = Math.round(wL + dx);
      } else {
        dx = Math.max(-(padsW - COLS[1].min), Math.min(wR - R.min, dx));
        st.w[R.k] = Math.round(wR - dx);
      }
      apply();
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      gu.g.classList.remove('gdrag'); document.body.classList.remove('col-resizing'); save();
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  }

  for (const gu of gutters()) {
    gu.g.addEventListener('mousedown', e => startDrag(e, gu));
    gu.g.addEventListener('dblclick', () => { delete st.w[gu.L.k]; delete st.w[gu.R.k]; save(); apply(); });
  }
  cols.addEventListener('click', e => {
    const f = e.target.closest('[data-fold]'); if (f) { e.stopPropagation(); setFold(f.dataset.fold, true); return; }
    const u = e.target.closest('[data-unfold]');
    if (u && !e.target.closest('[data-act]')) setFold(u.dataset.unfold, false);
  });
  // The browser toggle (browser.js) flips #app.br-on: re-lay the columns when it does.
  new MutationObserver(apply).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', apply);
  apply();
  return { apply, setFold, state: st };
})();

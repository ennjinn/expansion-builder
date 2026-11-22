// Sample browser pane: indexes a samples folder (natively, cached), auto-categorises every file
// (categorize.js) and shows categories | samples with a virtualised list.
// Loaded after app.js and uses its globals ($, bridge, fileURL, importPaths, assignSamples, …).
'use strict';

const Browser = (() => {
  const ROW = 30;
  const DEFAULT_ROOT = '~/Documents/Samples';
  const CATS = Categorize.GROUPS.flatMap(([, list]) => list);
  const CAT_ID = new Map(CATS.map((c, i) => [c, i]));

  const st = {
    root: DEFAULT_ROOT, rootAbs: '', show: true, cat: 'Kicks', pack: '', dedupe: true, search: '',
    status: '', loading: false,
    // parallel arrays, one entry per file
    rel: [], lower: [], size: [], catOf: null, packOf: null, dupe: null, packs: [],
    view: [], counts: null, sel: -1,
  };
  try { Object.assign(st, JSON.parse(localStorage.getItem('eb.browser') || '{}')); } catch (e) {}
  st.sel = -1; st.view = []; st.show = true;   // always shown now (fold it from its header instead)
  const savePrefs = () => { try { localStorage.setItem('eb.browser', JSON.stringify({ root: st.root, show: st.show, cat: st.cat, pack: st.pack, dedupe: st.dedupe })); } catch (e) {} };

  const el = id => document.getElementById(id);
  const fullPath = i => st.rootAbs + '/' + st.rel[i];
  const baseName = rel => rel.slice(rel.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
  const prettyRoot = p => p.replace(/^\/Users\/[^/]+/, '~');

  /* ---------------- loading ---------------- */
  async function load(refresh = false) {
    if (!hasBridge) { setStatus('The Sample Library needs the Expansion Builder app.'); return; }
    st.loading = true;
    setStatus(refresh ? 'Rescanning…' : 'Loading library…');
    try {
      const t = setTimeout(() => setStatus(`Scanning ${prettyRoot(st.root)}… (first time can take a minute)`), 600);
      const info = await bridge('scanLibrary', { root: st.root, refresh });
      clearTimeout(t);
      st.rootAbs = info.root;
      setStatus('Reading index…');
      const text = await (await fetch(fileURL(info.index))).text();
      ingest(text);
      const when = info.scanned ? new Date(info.scanned).toLocaleDateString() : '';
      setStatus('', `${st.rel.length.toLocaleString()} files · indexed ${when}`);
    } catch (e) {
      setStatus('Could not load: ' + e.message);
      st.rel = []; st.catOf = null;
    }
    st.loading = false;
    render();
  }

  function ingest(text) {
    const lines = text ? text.split('\n') : [];
    const n = lines.length;
    st.rel = new Array(n); st.lower = new Array(n); st.size = new Float64Array(n);
    st.catOf = new Uint8Array(n); st.packOf = new Uint16Array(n); st.dupe = new Uint8Array(n);
    Categorize.reset();
    // Pack = top folder, or top/second folder when the top folder is just a container of packs.
    const tops = new Map(); // top -> Set(second)
    const parsed = lines.map(l => { const k = l.lastIndexOf('\t'); return k < 0 ? [l, 0] : [l.slice(0, k), +l.slice(k + 1)]; });
    for (const [rel] of parsed) { const p = rel.split('/'); if (p.length > 2) { let s = tops.get(p[0]); if (!s) tops.set(p[0], s = new Set()); s.add(p[1]); } }
    const container = new Set([...tops].filter(([, s]) => s.size >= 6).map(([t]) => t));
    const packIds = new Map(); st.packs = [];
    const seen = new Set();
    parsed.forEach(([rel, size], i) => {
      st.rel[i] = rel; st.lower[i] = rel.toLowerCase(); st.size[i] = size;
      st.catOf[i] = CAT_ID.get(Categorize.categorize(rel)) ?? CAT_ID.get('Uncategorized');
      const p = rel.split('/');
      const pk = p.length < 2 ? '(root)' : (container.has(p[0]) && p.length > 2 ? `${p[0].trim()} / ${p[1].trim()}` : p[0].trim());
      let id = packIds.get(pk); if (id == null) { id = st.packs.length; st.packs.push(pk); packIds.set(pk, id); }
      st.packOf[i] = id;
      // The same sound shipped in several formats (Kontakt/Maschine/Battery/WAV…): same name + same size.
      const key = baseName(rel).toLowerCase() + '|' + size;
      if (seen.has(key)) st.dupe[i] = 1; else seen.add(key);
    });
  }

  /* ---------------- filtering ---------------- */
  function filter() {
    const terms = st.search.toLowerCase().split(/\s+/).filter(Boolean);
    const packId = st.pack ? st.packs.indexOf(st.pack) : -1;
    const want = CAT_ID.get(st.cat) ?? -1; // -1 = All
    const counts = new Uint32Array(CATS.length); let total = 0;
    const view = [];
    for (let i = 0, n = st.rel.length; i < n; i++) {
      if (st.dedupe && st.dupe[i]) continue;
      if (packId >= 0 && st.packOf[i] !== packId) continue;
      if (terms.length) { const s = st.lower[i]; let ok = true; for (const t of terms) if (!s.includes(t)) { ok = false; break; } if (!ok) continue; }
      counts[st.catOf[i]]++; total++;
      if (want < 0 || st.catOf[i] === want) view.push(i);
    }
    st.counts = counts; st.total = total; st.view = view;
  }

  /* ---------------- rendering ---------------- */
  function setStatus(msg, meta = null) {
    st.status = msg;
    const c = el('brCount'); if (!c) return;
    if (msg) c.textContent = msg; else if (meta) c.dataset.meta = meta;
  }
  function render() {
    document.getElementById('app').classList.toggle('br-on', st.show);
    if (!st.show) { reportDragRegion(); return; }
    el('brRoot').textContent = prettyRoot(st.rootAbs || st.root);
    el('brRoot').title = st.rootAbs || st.root;
    el('brDedupe').checked = st.dedupe;
    if (document.activeElement !== el('brSearch')) el('brSearch').value = st.search;
    if (!st.catOf || !st.rel.length) {
      el('brCats').innerHTML = ''; el('brPack').innerHTML = '<option value="">All packs</option>';
      el('brRows').innerHTML = ''; el('brSpacer').style.height = '0px';
      if (st.status) el('brCount').textContent = st.status;
      return;
    }
    filter();
    // categories
    el('brCats').innerHTML = `<li class="br-cat ${st.cat === 'All' ? 'on' : ''}" data-cat="All"><span>All</span><b>${st.total.toLocaleString()}</b></li>`
      + Categorize.GROUPS.map(([g, list]) => `<li class="br-grp">${esc(g)}</li>` + list.map(c => {
        const n = st.counts[CAT_ID.get(c)];
        return `<li class="br-cat ${st.cat === c ? 'on' : ''} ${n ? '' : 'zero'}" data-cat="${esc(c)}"><span>${esc(c)}</span><b>${n ? n.toLocaleString() : ''}</b></li>`;
      }).join('')).join('');
    // pack filter
    const packOpts = st.packs.map(p => p).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    el('brPack').innerHTML = `<option value="">All packs (${st.packs.length})</option>` + packOpts.map(p => `<option value="${esc(p)}" ${p === st.pack ? 'selected' : ''}>${esc(p)}</option>`).join('');
    el('brCount').textContent = st.status || `${st.view.length.toLocaleString()} sounds${st.cat !== 'All' ? ' in ' + st.cat : ''} · ${el('brCount').dataset.meta || ''}`;
    el('brSpacer').style.height = st.view.length * ROW + 'px';
    if (st.sel >= st.view.length) st.sel = -1;
    renderRows();
  }
  function renderRows() {
    const list = el('brList'), top = list.scrollTop, h = list.clientHeight;
    const a = Math.max(0, Math.floor(top / ROW) - 6), b = Math.min(st.view.length, Math.ceil((top + h) / ROW) + 6);
    let html = '';
    for (let k = a; k < b; k++) {
      const i = st.view[k], rel = st.rel[i], dir = rel.slice(0, Math.max(0, rel.lastIndexOf('/')));
      html += `<div class="br-row ${k === st.sel ? 'on' : ''}" style="top:${k * ROW}px" data-k="${k}" draggable="true" title="${esc(rel)}">
        <span class="nm">${esc(baseName(rel))}</span><span class="dir">${st.cat === 'All' ? `<i>${esc(CATS[st.catOf[i]])}</i> ` : ''}${esc(dir.split('/').slice(-2).join(' / '))}</span></div>`;
    }
    el('brRows').innerHTML = html;
  }

  /* ---------------- preview / assign ---------------- */
  const cache = new Map(); let playTok = 0;
  async function buffer(path) {
    if (cache.has(path)) { const b = cache.get(path); cache.delete(path); cache.set(path, b); return b; }
    const r = await fetch(fileURL(path)); if (!r.ok) throw new Error('read failed');
    const b = await Audio.decode(await r.arrayBuffer());
    cache.set(path, b); if (cache.size > 40) cache.delete(cache.keys().next().value);
    return b;
  }
  async function preview(k) {
    const i = st.view[k]; if (i == null) return;
    const tok = ++playTok;
    try {
      const b = await buffer(fullPath(i)); if (tok !== playTok) return;
      Audio.killPad('browser');
      Audio.trigger([{ layer: { buffer: b }, gain: 1 }], { velocity: 110, padKey: 'browser', mono: true });
      Tuner.show(b, { name: baseName(st.rel[i]) });
    } catch (e) { if (tok === playTok) toast('Could not play ' + baseName(st.rel[i]), true); }
  }
  function select(k, play = true) {
    if (k < 0 || k >= st.view.length) return;
    st.sel = k;
    const list = el('brList'), y = k * ROW;
    if (y < list.scrollTop) list.scrollTop = y; else if (y + ROW > list.scrollTop + list.clientHeight) list.scrollTop = y + ROW - list.clientHeight;
    // Only move the highlight: re-rendering the rows mid-click would break double-click and drag.
    const rows = el('brRows'), on = rows.querySelector(`.br-row[data-k="${k}"]`);
    if (on) { rows.querySelectorAll('.br-row.on').forEach(r => r.classList.remove('on')); on.classList.add('on'); } else renderRows();
    if (play) preview(k);
  }
  async function assign(k) {
    const i = st.view[k]; if (i == null) return;
    const added = await importPaths([fullPath(i)]); if (!added.length) return;
    const p = curPad();
    assignSamples(ui.pad, [added[0].id], p && p.mpce ? ui.quad : null);
    toast(`${added[0].name} → ${padLabel(ui.pad)}${p && p.mpce ? ' ' + QSHORT[ui.quad] : ''}`);
  }

  /* ---------------- events ---------------- */
  let searchT = 0;
  function bind() {
    el('brCats').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (!c) return; st.cat = c.dataset.cat; st.sel = -1; el('brList').scrollTop = 0; savePrefs(); render(); });
    el('brPack').addEventListener('change', e => { st.pack = e.target.value; st.sel = -1; el('brList').scrollTop = 0; savePrefs(); render(); });
    el('brDedupe').addEventListener('change', e => { st.dedupe = e.target.checked; st.sel = -1; savePrefs(); render(); });
    el('brSearch').addEventListener('input', e => { clearTimeout(searchT); searchT = setTimeout(() => { st.search = e.target.value; st.sel = -1; el('brList').scrollTop = 0; render(); }, 120); });
    el('brSearch').addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); el('brList').focus(); select(0); } });
    el('brRescan').addEventListener('click', () => load(true));
    el('brFolder').addEventListener('click', async () => {
      try { const p = await bridge('pickFolder', { message: 'Choose your samples folder', prompt: 'Use Folder' }); if (p) { st.root = p; st.pack = ''; savePrefs(); load(); } }
      catch (e) { toast(e.message, true); }
    });
    const list = el('brList');
    list.addEventListener('scroll', () => requestAnimationFrame(renderRows));
    list.addEventListener('mousedown', e => { const r = e.target.closest('.br-row'); if (!r) return; list.focus(); select(+r.dataset.k); });
    list.addEventListener('dblclick', e => { const r = e.target.closest('.br-row'); if (r) assign(+r.dataset.k); else if (st.sel >= 0) assign(st.sel); });
    list.addEventListener('dragstart', e => {
      const r = e.target.closest('.br-row'); if (!r) return;
      e.dataTransfer.setData('application/x-eb-path', fullPath(st.view[+r.dataset.k])); e.dataTransfer.effectAllowed = 'copy';
    });
    // Arrow keys browse (and preview); Enter puts the sound on the selected pad / quadrant.
    list.addEventListener('keydown', e => {
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); select(st.sel < 0 ? 0 : st.sel + (k === 'ArrowDown' ? 1 : -1)); }
      else if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); e.stopPropagation(); const step = Math.floor(list.clientHeight / ROW); select(Math.max(0, Math.min(st.view.length - 1, st.sel + (k === 'PageDown' ? step : -step)))); }
      else if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); if (st.sel >= 0) assign(st.sel); }
      else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); stepCat(k === 'ArrowRight' ? 1 : -1); }
      else if (k.length === 1 && k !== ' ') e.stopPropagation(); // don't fire pad keys while browsing
    });
    window.addEventListener('resize', () => { if (st.show) renderRows(); });
  }
  function stepCat(d) {
    const all = ['All', ...CATS].filter(c => c === 'All' || st.counts[CAT_ID.get(c)]);
    const at = Math.max(0, all.indexOf(st.cat));
    st.cat = all[(at + d + all.length) % all.length]; st.sel = -1; el('brList').scrollTop = 0; savePrefs(); render(); select(0);
  }

  function init() { bind(); render(); if (st.show) load(); }
  return { init, load, st, render };
})();
Browser.init();

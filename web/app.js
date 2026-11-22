// Expansion Builder — UI + state.
'use strict';

/* ================================================================ bridge */
const hasBridge = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge);
let bridgeSeq = 0; const bridgePending = new Map();
function bridge(cmd, args = {}) {
  if (!hasBridge) return Promise.reject(new Error('This needs the Expansion Builder app (no native bridge in a plain browser).'));
  return new Promise((res, rej) => { const id = ++bridgeSeq; bridgePending.set(id, { res, rej }); window.webkit.messageHandlers.bridge.postMessage({ id, cmd, args }); });
}
window.__bridgeReply = (id, ok, v) => { const p = bridgePending.get(id); if (!p) return; bridgePending.delete(id); ok ? p.res(v) : p.rej(new Error(v || 'Failed')); };
const fileURL = path => 'lab://app/__file__' + path.split('/').map(encodeURIComponent).join('/');

/* ================================================================ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 10);
const BANKS = 'ABCDEFGH';
const QNAMES = ['Bottom Left', 'Bottom Right', 'Top Left', 'Top Right'];
const QSHORT = ['BL', 'BR', 'TL', 'TR'];
const GRID_ROWS = [[12, 13, 14, 15], [8, 9, 10, 11], [4, 5, 6, 7], [0, 1, 2, 3]];
const KEYS = [['1', '2', '3', '4'], ['q', 'w', 'e', 'r'], ['a', 's', 'd', 'f'], ['z', 'x', 'c', 'v']];
const KEY_TO_SLOT = {}; GRID_ROWS.forEach((row, r) => row.forEach((slot, c) => { KEY_TO_SLOT[KEYS[r][c]] = slot; }));
const SLOT_KEY = {}; Object.entries(KEY_TO_SLOT).forEach(([k, s]) => { SLOT_KEY[s] = k.toUpperCase(); });
const PAD_COLORS = ['#ff3b30', '#ff7a1a', '#ffb400', '#f2e600', '#9be000', '#2ed158', '#00c9a7', '#2ec5ff', '#3b82ff', '#6c5cff', '#b07cff', '#ff4fd8', '#ff6b9a', '#a0522d', '#f0f0f0'];
const mixHex = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const c = k => Math.round(((pa >> k) & 255) * (1 - t) + ((pb >> k) & 255) * t); return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0'); };
const padStyle = p => p && p.color ? ` custom" style="--pc:${p.color}` : '';
const padWave = (p, fallback) => p && p.color ? mixHex(p.color, '#ffffff', 0.25) : fallback;
const padLabel = i => BANKS[Math.floor(i / 16)] + String(i % 16 + 1).padStart(2, '0');

const newArt = () => ({ type: 0, scale: 1, speed: 0.5, dynamics: 0.5, stereo: 1 });
const newLayer = (sample = null) => ({ sample, vlo: 0, vhi: 127, tune: 0, fine: 0, start: 0, level: 0, pan: 0, reverse: false });
const newQuad = () => ({ layers: [newLayer()], art: newArt() });
const newPad = () => ({ name: '', color: null, mpce: true, oneShot: true, mono: true, muteGroup: 0, xy: 'snap', layers: [newLayer()], art: newArt(), quads: [newQuad(), newQuad(), newQuad(), newQuad()], expr: { xCutoff: 0, yReso: 0 } });
const newKit = name => ({ id: uid(), name, color: '#ff3b30', pads: Array(128).fill(null) });
const newState = () => ({ expansion: { name: '', author: '', description: '', version: '1.0.0', identifier: '', image: null }, kits: [newKit('Kit 1')] });

/* ================================================================ state */
let S = newState();
const samples = new Map();      // id -> sample
let libOrder = [];              // sample ids
const ui = { kit: 0, bank: 0, pad: 0, quad: 0, layer: 0, libSel: null, search: '' };
let dirty = false, projPath = null;

const kit = () => S.kits[ui.kit];
const padAt = (i, k = kit()) => k.pads[i];
const ensurePad = i => kit().pads[i] || (kit().pads[i] = newPad());
const curPad = () => padAt(ui.pad);

function padUsed(p) { return !!p && Exporter.padUsed(p); }
function padSamples(p) {
  if (!p) return [];
  const ls = p.mpce ? p.quads.flatMap(q => q.layers) : p.layers;
  return ls.filter(l => l.sample && samples.has(l.sample)).map(l => l.sample);
}
function padDisplayName(p) {
  if (!p) return '';
  if (p.name) return p.name;
  const s = padSamples(p)[0];
  return s ? samples.get(s).name : '';
}
function usedSampleIds(k = null) {
  const set = new Set();
  for (const kk of (k ? [k] : S.kits)) for (const p of kk.pads) for (const id of padSamples(p)) set.add(id);
  return set;
}

/* ================================================================ undo */
const undoStack = [], redoStack = [];
let undoArmed = true;
function snapshot() { return JSON.stringify({ e: S.expansion, k: S.kits }); }
function pushUndo() { if (!undoArmed) return; undoStack.push(snapshot()); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; undoArmed = false; setTimeout(() => { undoArmed = true; }, 400); }
function restore(snap) { const o = JSON.parse(snap); S.expansion = o.e; S.kits = o.k; ui.kit = clamp(ui.kit, 0, S.kits.length - 1); markDirty(); renderAll(); }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); toast('Undo'); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); toast('Redo'); }
function mutate(fn, { detail = true } = {}) { pushUndo(); fn(); markDirty(); renderGrid(); renderLcd(); renderBanks(); if (detail) renderDetail(); renderLibrary(); renderPreviewCard(); renderSeq(); }
function markDirty() { dirty = true; renderProjName(); }

/* ================================================================ toast / busy */
let toastT = 0;
function toast(msg, err = false) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, err ? 5000 : 2200); }
function busy(text) { const b = $('#busy'); if (text === false) { b.hidden = true; return; } $('#busyText').textContent = text; b.hidden = false; }

/* ================================================================ samples */
const AUDIO_RE = /\.(wav|wave|aif|aiff|aifc|mp3|m4a|flac|caf|ogg)$/i;
async function addSampleBytes(name, bytes, { id = null, srcPath = null, savedTo = null } = {}) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [, 'wav'])[1].toLowerCase();
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  if (!id) for (const s of samples.values()) if (s.name === base && s.bytes.byteLength === bytes.byteLength) return s; // dedupe
  const buffer = await Audio.decode(bytes);
  const info = Audio.wavInfo(bytes);
  const s = { id: id || uid(), name: base, ext, bytes, buffer, info, peaks: Audio.peaks(buffer), dur: buffer.duration, srcPath, savedTo };
  samples.set(s.id, s);
  if (!libOrder.includes(s.id)) libOrder.push(s.id);
  return s;
}
async function importFiles(files) {
  const list = files.filter(f => AUDIO_RE.test(f.name));
  if (!list.length) { toast('No audio files found', true); return []; }
  const out = []; let fail = 0;
  if (list.length > 6) busy(`Importing ${list.length} sounds…`);
  for (const f of list) {
    try { out.push(await addSampleBytes(f.name, await f.arrayBuffer(), { srcPath: f.path || null })); }
    catch (e) { fail++; console.warn('decode failed', f.name, e); }
  }
  busy(false);
  if (fail) toast(`${fail} file(s) could not be decoded`, true);
  markDirty(); renderLibrary();
  return out;
}
async function importPaths(paths) {
  const files = paths.map(p => ({ name: p.split('/').pop(), path: p, arrayBuffer: () => fetch(fileURL(p)).then(r => { if (!r.ok) throw new Error('read failed'); return r.arrayBuffer(); }) }));
  return importFiles(files);
}
async function filesFromDrop(dt) {
  const items = [...(dt.items || [])];
  const entries = items.map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return [...(dt.files || [])];
  const out = [];
  const walk = async entry => {
    if (entry.isFile) { out.push(await new Promise((res, rej) => entry.file(res, rej))); return; }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const e of batch) await walk(e); } while (batch.length);
    }
  };
  for (const e of entries) await walk(e);
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/* ================================================================ waveforms */
function drawWave(cv, s, color, opts = {}) {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  if (!s) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, h / 2 - 0.5, w, 1); return; }
  let pk = s.peaks; if (opts.reverse) pk = Float32Array.from(pk).reverse();
  const n = pk.length, bw = w / n, mid = h / 2;
  const startFrac = opts.start && s.dur ? clamp(opts.start / 1000 / s.dur, 0, 1) : 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0.6, pk[i] * mid * 0.95);
    g.fillStyle = (i / n) < startFrac ? 'rgba(255,255,255,.12)' : color;
    g.fillRect(i * bw, mid - a, Math.max(1, bw * 0.62), a * 2);
  }
  if (startFrac > 0) { g.fillStyle = '#fff'; g.fillRect(startFrac * w, 0, 1, h); }
}
function paintWaves(root = document) {
  requestAnimationFrame(() => $$('canvas[data-sid]', root).forEach(cv => {
    drawWave(cv, samples.get(cv.dataset.sid), cv.dataset.color || '#ff6b61', { reverse: cv.dataset.rev === '1', start: +cv.dataset.start || 0 });
  }));
}
const waveCanvas = (sid, color, cls = 'wave', layer = null) => sid && samples.has(sid)
  ? `<canvas class="${cls}" data-sid="${sid}" data-color="${color}" data-rev="${layer && layer.reverse ? 1 : 0}" data-start="${layer ? layer.start || 0 : 0}"></canvas>` : '';

/* ================================================================ articulation labels */
const ARTS = window.ARTICULATIONS || [];
function artShort(type) {
  const a = ARTS[type - 1]; if (!a) return '';
  if (a.group === 'Note Repeats') return 'NR ' + a.name;
  const n = a.name.replace(/Standard |Rudiments?/g, '').trim();
  return n.length > 12 ? n.slice(0, 11) + '…' : n;
}
function artLabel(type) { const a = ARTS[type - 1]; return a ? `${a.group} · ${a.name}` : 'Off — plain hit'; }
const ART_OPTIONS = (() => {
  const groups = {}; ARTS.forEach(a => (groups[a.group] = groups[a.group] || []).push(a));
  return '<option value="0">Off — plain hit</option>' + Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${esc(g)}">${list.map(a => `<option value="${a.id}">${esc(a.name)}${a.looped ? ' ⟳' : ''}</option>`).join('')}</optgroup>`).join('');
})();

/* ================================================================ audition */
function layerForPlay(L) { const s = samples.get(L.sample); return s ? { buffer: s.buffer, tune: L.tune, fine: L.fine, start: L.start, level: L.level, pan: L.pan, reverse: L.reverse } : null; }
const inVel = (L, v) => v >= (L.vlo ?? 0) && v <= (L.vhi ?? 127);
function quadOf(x, y) { return (y >= 0.5 ? 2 : 0) + (x >= 0.5 ? 1 : 0); }
const testVel = () => +$('#testVel').value || 100;
const testBpm = () => clamp(kit().bpm || 120, 40, 300);

/** Plays pad i. opts: quad, x, y (0..1 within the pad, y up), velocity, layer (index to force), when (AudioContext time) */
function playPad(i, opts = {}) {
  const p = padAt(i); if (!padUsed(p)) return null;
  const vel = opts.velocity ?? testVel();
  let parts = [], art = null, q = null;
  const pick = (layers, gain = 1) => {
    const ls = opts.layer != null ? [layers[opts.layer]].filter(Boolean) : layers.filter(L => L.sample && inVel(L, vel));
    for (const L of ls) { const pl = L.sample && layerForPlay(L); if (pl) parts.push({ layer: pl, gain }); }
  };
  if (p.mpce) {
    q = opts.quad;
    if (p.xy === 'morph' && opts.x != null && opts.layer == null) {
      const x = opts.x, y = opts.y, w = [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y];
      w.forEach((wt, qi) => { if (wt > 0.02) pick(p.quads[qi].layers, Math.sqrt(wt)); });
      q = quadOf(x, y);
    } else {
      if (q == null) q = opts.x != null ? quadOf(opts.x, opts.y) : 0;
      pick(p.quads[q].layers);
    }
    art = p.quads[q].art;
  } else {
    pick(p.layers); art = p.art;
  }
  if (!parts.length) return null;
  const when = opts.when ?? null;
  if (when == null) { const L = parts[0].layer, s = [...samples.values()].find(x => x.buffer === L.buffer); Tuner.show(L.buffer, { name: s && s.name, tune: L.tune, fine: L.fine }); }
  const delay = when != null ? Math.max(0, (when - Audio.ctx.currentTime) * 1000) : 0;
  if (delay > 4) setTimeout(() => flash(i, p.mpce ? q : null), delay); else flash(i, p.mpce ? q : null);
  // Mute group: this pad cuts every other pad of the kit in the same group.
  if (p.muteGroup) kit().pads.forEach((pp, j) => { if (j !== i && pp && pp.muteGroup === p.muteGroup) Audio.killPad(ui.kit + ':' + j, when); });
  return Audio.trigger(parts, { art, velocity: vel, bpm: testBpm(), mono: p.mono, padKey: ui.kit + ':' + i, oneShot: p.oneShot, when });
}
function flash(i, q = null) {
  const el = $(`.pad[data-i="${i}"]`); if (!el) return;
  const t = q != null ? $(`.quad[data-q="${q}"]`, el) : el;
  if (!t) return;
  t.classList.add('hit'); setTimeout(() => t.classList.remove('hit'), 110);
}
/* ---- articulation browsing: every preview cuts whatever was sounding first ---- */
let artCycle = null;           // { timer, pad, quad } while cycling
let artAuditionHandle = null, artReleaseT = 0;
function curArt() { const p = curPad(); return p ? (p.mpce ? p.quads[ui.quad].art : p.art) : null; }
/** Cut everything, then play the current pad/quadrant once; looped patterns auto-release. Returns ms to wait before the next one. */
function auditionArt() {
  Audio.stopAll(); clearTimeout(artReleaseT);
  const p = curPad(); if (!padUsed(p)) return 800;
  artAuditionHandle = playPad(ui.pad, { quad: p.mpce ? ui.quad : null });
  const A = curArt(), def = A && A.type ? ARTS[A.type - 1] : null;
  if (!def) return 900;
  const rate = [0.5, 1, 2][A.scale ?? 1] * Math.pow(2, ((A.speed ?? 0.5) - 0.5) * 2) * (def.synced ? testBpm() / (def.baseTempo || 120) : 1);
  if (def.looped) {
    const h = artAuditionHandle; artReleaseT = setTimeout(() => h && h.release(), 1600);
    return 2300;
  }
  const len = def.hits.reduce((n, h) => n + h[1], 0) / rate;
  return clamp(len + 700, 900, 4000);
}
function stepArt(dir) {
  const A = curArt(); if (!A) return;
  pushUndo();
  A.type = ((A.type || 0) + dir + ARTS.length + 1) % (ARTS.length + 1);
  markDirty(); renderDetail(); renderGrid();
  return auditionArt();
}
function stopArtCycle() { if (artCycle) { clearTimeout(artCycle.timer); artCycle = null; Audio.stopAll(); } }
function toggleArtCycle() {
  if (artCycle) { stopArtCycle(); renderDetail(); return; }
  if (!padUsed(curPad())) { toast('Put a sample on this pad first', true); return; }
  artCycle = { pad: ui.pad, quad: ui.quad, timer: 0 };
  const tick = () => {
    if (!artCycle || artCycle.pad !== ui.pad || artCycle.quad !== ui.quad) { stopArtCycle(); renderDetail(); return; }
    const wait = stepArt(1);
    if (curArt().type === ARTS.length) { artCycle.timer = setTimeout(() => { stopArtCycle(); renderDetail(); toast('Cycled the whole list'); }, wait); return; }
    artCycle.timer = setTimeout(tick, wait);
  };
  tick();
}

function playSample(id) {
  const s = samples.get(id); if (!s) return;
  Audio.stopAll(); Audio.trigger([{ layer: { buffer: s.buffer }, gain: 1 }], { velocity: 110, padKey: 'lib', mono: true });
  Tuner.show(s.buffer, { name: s.name });
}

/* ================================================================ render: expansion */
function renderExpansion() {
  const e = S.expansion;
  $('#expName').value = e.name; $('#expAuthor').value = e.author; $('#expDesc').value = e.description;
  $('#expVersion').value = e.version || ''; $('#expId').value = e.identifier || '';
  $('#expId').placeholder = Exporter.identifier({ ...e, identifier: '' });
  const art = $('#art');
  art.style.backgroundImage = e.image ? `url(${e.image})` : ''; art.classList.toggle('has', !!e.image);
  $('#artRemove').disabled = !e.image;
  renderPreviewCard();
}
function renderPreviewCard() {
  const e = S.expansion;
  $('#pcArt').style.backgroundImage = e.image ? `url(${e.image})` : '';
  $('#pcTitle').textContent = e.name || 'Untitled expansion';
  const kits = S.kits.filter(k => k.pads.some(padUsed)).length;
  $('#pcMeta').textContent = `${e.author || 'No author'} · ${kits} kit(s) · ${usedSampleIds().size} sound(s)`;
}
function renderProjName() {
  $('#projName').textContent = (projPath ? projPath.split('/').pop() : 'Unsaved project') + (dirty ? ' •' : '');
}

/* ================================================================ render: kits/lcd/banks/grid */
function renderKitTabs() {
  $('#kitTabs').innerHTML = S.kits.map((k, i) => `<button class="kit-tab ${i === ui.kit ? 'on' : ''}" data-kit="${i}">${esc(k.name || 'Kit')}${S.kits.length > 1 ? `<span class="x" data-delkit="${i}" title="Delete kit">✕</span>` : ''}</button>`).join('')
    + `<button class="kit-tab" data-addkit>+ Kit</button>`;
}
function renderLcd() {
  const k = kit();
  if (document.activeElement !== $('#kitName')) $('#kitName').value = k.name;
  const used = k.pads.filter(padUsed).length, mp = k.pads.filter(p => padUsed(p) && p.mpce).length;
  const zones = k.pads.reduce((n, p) => n + (padUsed(p) ? (p.mpce ? p.quads.filter(q => q.layers.some(l => l.sample)).length : 1) : 0), 0);
  $('#lcdMeta').innerHTML = `BANK ${BANKS[ui.bank]} &nbsp; ${used} / 128 PADS &nbsp; ${zones} ZONES${mp ? ` &nbsp; <b>${mp} MPCe</b>` : ''}`;
}
function renderBanks() {
  $('#banks').innerHTML = [...BANKS].map((b, i) => {
    const used = kit().pads.slice(i * 16, i * 16 + 16).some(padUsed);
    return `<button class="bank ${i === ui.bank ? 'on' : ''} ${used ? 'used' : ''}" data-bank="${i}">${b}</button>`;
  }).join('');
}
const mgTag = p => p && p.muteGroup ? `<small>MG${p.muteGroup}</small>` : '';

// "Mute groups by colour": walks the kit A01 → H16; the first pad of each colour opens the next group (1, 2, 3 …)
// and every later pad of that colour joins it. Pads on automatic colour (no colour picked) are set to Off.
const MAX_MUTE_GROUPS = 16;
function muteGroupsByColor() {
  const k = kit(), groups = new Map();
  let off = 0, over = 0;
  const used = k.pads.map((p, i) => [p, i]).filter(([p]) => padUsed(p));
  if (!used.length) { toast('This kit has no sounds on its pads yet', true); return; }
  mutate(() => {
    for (const [p] of used) {
      if (!p.color) { p.muteGroup = 0; off++; continue; }
      const c = p.color.toLowerCase();
      if (!groups.has(c)) groups.set(c, groups.size < MAX_MUTE_GROUPS ? groups.size + 1 : 0);
      p.muteGroup = groups.get(c);
      if (!p.muteGroup) over++;
    }
  });
  const n = [...groups.values()].filter(Boolean).length;
  let msg = n ? `${n} mute group${n > 1 ? 's' : ''} set by colour` : 'No coloured pads — give pads colours first';
  if (off) msg += ` · ${off} uncoloured pad${off > 1 ? 's' : ''} set to Off`;
  if (over) msg += ` · ${over} pad${over > 1 ? 's' : ''} left Off (more than ${MAX_MUTE_GROUPS} colours)`;
  toast(msg, !n || over > 0);
}

function renderGrid() {
  const k = kit(), html = [];
  for (const row of GRID_ROWS) for (const slot of row) {
    const i = ui.bank * 16 + slot, p = k.pads[i], used = padUsed(p), sel = i === ui.pad;
    if (p && p.mpce) {
      const quads = [2, 3, 0, 1].map(q => {
        const Q = p.quads[q], L = Q.layers.find(l => l.sample && samples.has(l.sample));
        const nVel = Q.layers.filter(l => l.sample).length;
        return `<div class="quad ${L ? 'filled' : ''} ${sel && ui.quad === q ? 'qsel' : ''}" data-q="${q}">
          ${nVel > 1 ? `<span class="q-vl">${nVel}V</span>` : ''}${Q.art.type ? `<span class="q-art">${esc(artShort(Q.art.type))}</span>` : ''}
          ${L ? waveCanvas(L.sample, padWave(p, '#c6a2ff'), 'wave', L) : ''}<span class="q-name">${L ? esc(samples.get(L.sample).name) : ''}</span></div>`;
      }).join('');
      html.push(`<div class="pad mpce ${p.xy === 'morph' ? 'morph' : ''} ${sel ? 'sel' : ''}${padStyle(p)}" data-i="${i}" draggable="true">${quads}<span class="pad-lbl">${padLabel(i)}${mgTag(p)}</span></div>`);
    } else {
      const L = p && p.layers.find(l => l.sample && samples.has(l.sample));
      const nl = p ? p.layers.filter(l => l.sample).length : 0;
      const badge = !used ? '' : (p.art.type ? artShort(p.art.type).toUpperCase() : nl > 1 ? `${nl} LAYERS` : (p.oneShot ? 'ONE SHOT' : 'NOTE ON'));
      html.push(`<div class="pad ${used ? 'filled' : 'empty'} ${p && !p.oneShot ? 'noteon' : ''} ${sel ? 'sel' : ''}${used ? padStyle(p) : ''}" data-i="${i}" draggable="true">
        <span class="pad-lbl">${padLabel(i)}${used ? mgTag(p) : ''}</span><span class="pad-key">${SLOT_KEY[slot] || ''}</span>
        ${L ? waveCanvas(L.sample, padWave(p, p.oneShot ? '#ff6b61' : '#4fc3f7'), 'wave', L) : ''}
        ${badge ? `<span class="pad-badge">${esc(badge)}</span>` : ''}
        <span class="pad-name">${used ? esc(padDisplayName(p)) : 'Empty'}</span></div>`);
    }
  }
  $('#padGrid').innerHTML = html.join('');
  paintWaves($('#padGrid'));
}

/* ================================================================ render: detail */
function param(label, bind, min, max, step, value, fmt) {
  return `<div class="param"><div class="ph"><span>${label}</span><b data-fmt="${bind}" title="Click to type a value · ⌥-click or double-click the slider to reset">${fmt(value)}</b></div>
    <input type="range" data-bind="${bind}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
}
const FMT = {
  'L.tune': v => (v > 0 ? '+' : '') + (v | 0) + ' st',
  'L.fine': v => (v > 0 ? '+' : '') + (v | 0) + ' ct',
  'L.start': v => (+v).toFixed(0) + ' ms',
  'L.level': v => (+v <= -48 ? '-∞' : (+v).toFixed(1)) + ' dB',
  'L.pan': v => +v === 0 ? 'C' : (v < 0 ? 'L' + (-v) : 'R' + v),
  'A.speed': v => '×' + Math.pow(2, (v - 0.5) * 2).toFixed(2),
  'A.dynamics': v => Math.round(v * 200) + '%',
  'A.stereo': v => Math.round(v * 100) + '%',
  'pad.expr.xCutoff': v => +v ? Math.round(v * 100) + '%' : 'Off',
  'pad.expr.yReso': v => +v ? Math.round(v * 100) + '%' : 'Off',
};

function layerRows(layers, max, color, isQuad) {
  const rows = layers.map((L, li) => {
    const s = L.sample && samples.get(L.sample);
    return `<div class="layer ${li === ui.layer ? 'on' : ''}" data-layer="${li}">
      <div class="ln">${isQuad ? (li ? 'HI' : 'LO') : li + 1}</div>
      <div class="lmain"><div class="lname ${s ? '' : 'none'}">${s ? esc(s.name) : 'Drop a sample here'}</div>${s ? waveCanvas(L.sample, color, '', L) : ''}</div>
      <div class="vel"><input type="number" min="0" max="127" data-vel="lo" data-layer="${li}" value="${L.vlo}">–<input type="number" min="0" max="127" data-vel="hi" data-layer="${li}" value="${L.vhi}">
        <button class="play" data-playlayer="${li}" title="Play this layer">▶</button>
        ${layers.length > 1 || s ? `<button class="play" data-dellayer="${li}" title="Remove layer">✕</button>` : ''}</div></div>`;
  }).join('');
  const colors = ['#ff6b61', '#4fc3f7', '#3ddc84', '#ffb340', '#c6a2ff', '#ff8fd0', '#9be7ff', '#e6ee9c'];
  const bar = layers.map((L, li) => L.sample ? `<i style="left:${L.vlo / 128 * 100}%;width:${(L.vhi - L.vlo + 1) / 128 * 100}%;background:${colors[li % 8]};top:${2 + (li % 3) * 0}px"></i>` : '').join('');
  return `<div class="layers">${rows}</div>
    <div class="velbar" title="Velocity map (white line = test velocity)">${bar}<span class="cur" style="left:${testVel() / 128 * 100}%"></span></div>
    <div class="lyr-actions">
      ${layers.length < max ? `<button class="btn tiny" data-addlayer>+ Velocity layer</button>` : ''}
      ${layers.filter(l => l.sample).length > 1 ? `<button class="btn tiny" data-autosplit>Auto-split velocity</button><button class="btn tiny" data-fullrange>All full range</button>` : ''}
    </div>`;
}

function soundParams(L) {
  const s = L && L.sample && samples.get(L.sample);
  if (!s) return `<p class="note">Pick a layer with a sample to edit its sound.</p>`;
  const maxStart = Math.max(1, Math.floor(s.dur * 1000) - 5);
  return `<div class="wed"><canvas class="wed-cv" data-color="${curPad().mpce ? '#c6a2ff' : '#ff6b61'}" title="Click or drag to set the start point · Shift-drag = fine · scroll / pinch to zoom · double-click = fit"></canvas>
    <div class="wed-bar"><span>Start <b id="wedStart">${FMT['L.start'](L.start)}</b> of ${(s.dur * 1000).toFixed(0)} ms</span>
      <span class="wed-zoom"><button class="btn tiny" data-wzoom="out" title="Zoom out">−</button><button class="btn tiny" data-wzoom="in" title="Zoom in on the start point">+</button><button class="btn tiny" data-wzoom="fit" title="Show the whole sample">Fit</button></span></div></div>
  <div class="params">
    ${param('Tune', 'L.tune', -36, 36, 1, L.tune, FMT['L.tune'])}
    ${param('Fine', 'L.fine', -99, 99, 1, L.fine, FMT['L.fine'])}
    ${param('Start', 'L.start', 0, maxStart, 1, L.start, FMT['L.start'])}
    ${param('Level', 'L.level', -48, 0, 0.5, L.level, FMT['L.level'])}
    ${param('Pan', 'L.pan', -50, 50, 1, L.pan, FMT['L.pan'])}
    <div class="param"><div class="ph"><span>Direction</span></div><div class="seg" data-seg="L.reverse"><button data-v="0" class="${L.reverse ? '' : 'on'}">Forward</button><button data-v="1" class="${L.reverse ? 'on' : ''}">Reverse</button></div></div>
  </div>`;
}

function artSection(A, violet, title) {
  const def = A.type ? ARTS[A.type - 1] : null;
  return `<div class="sect ${violet ? 'violet' : ''}"><h3>${title} ${def && def.looped ? '<span class="tag">⟳ repeats while held</span>' : ''}</h3>
    <div class="art-sel"><button class="play" data-artstep="-1" title="Previous articulation  ( , )">‹</button><select data-bind="A.type" data-type="int">${ART_OPTIONS}</select><button class="play" data-artstep="1" title="Next articulation  ( . )">›</button><button class="play" data-playart title="Play">▶</button></div>
    <div class="row" style="margin-top:8px"><button class="btn tiny ${artCycle ? 'on' : ''}" data-artcycle title="Step through the whole list, playing each one">${artCycle ? '■ Stop cycling' : '⟳ Cycle all'}</button><span class="note" style="margin:0">${A.type || 0} / ${ARTS.length} · keys <b>,</b> and <b>.</b> step</span></div>
    ${def ? `<div class="row"><span class="lbl">Speed</span><div class="seg ${violet ? 'v' : ''}" data-seg="A.scale">${['×½', '×1', '×2'].map((t, i) => `<button data-v="${i}" class="${(A.scale ?? 1) === i ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="params" style="margin-top:12px">
        ${param('Speed (fine)', 'A.speed', 0, 1, 0.01, A.speed, FMT['A.speed'])}
        ${param('Dynamics', 'A.dynamics', 0, 1, 0.01, A.dynamics, FMT['A.dynamics'])}
        ${param('Stereo', 'A.stereo', 0, 1, 0.01, A.stereo, FMT['A.stereo'])}
        <div class="param"><div class="ph"><span>Hits</span><b>${def.hits.length}${def.synced ? ' · tempo sync' : ''}</b></div></div>
      </div>` : `<p class="note">Flams, drags, rudiments, rolls, buzzes, pitched rolls, note repeats and tuplets — the MPC's own articulation library (${ARTS.length}).</p>`}
  </div>`;
}

function renderDetail() {
  const el = $('#detail');
  const i = ui.pad, p = curPad();
  const label = padLabel(i);
  if (!p) {
    el.innerHTML = `<h2><em>3</em>Pad · ${label}</h2>
      <div class="mpce-toggle on" data-mpce><div><b>MPCe Expressive pad</b><small>4 corners · the first sample you drop goes on all four</small></div><span class="switch"></span></div>
      <div class="empty-detail">Empty pad.<br><br>Drag a sample here from the library or drop files on the pad.<br>It fills all 4 corners; then drop on a corner to replace just that one.</div>`;
    return;
  }
  const mp = p.mpce;
  ui.quad = clamp(ui.quad, 0, 3);
  const Q = mp ? p.quads[ui.quad] : null;
  const layers = mp ? Q.layers : p.layers;
  ui.layer = clamp(ui.layer, 0, layers.length - 1);
  const L = layers[ui.layer];
  const A = mp ? Q.art : p.art;
  const mg = `<select data-bind="pad.muteGroup" data-type="int">${['Off', ...Array.from({ length: 16 }, (_, n) => 'Group ' + (n + 1))].map((t, n) => `<option value="${n}" ${p.muteGroup === n ? 'selected' : ''}>${t}</option>`).join('')}</select>`;

  let body = `<h2><em>3</em>${mp ? 'Pad · Quadrant' : 'Pad'} details</h2>
    <div class="d-head ${mp ? 'mpce' : ''}"><span class="pid">${label}</span><input data-bind="pad.name" data-type="str" placeholder="${esc(padDisplayName({ ...p, name: '' }) || 'Pad name')}" value="${esc(p.name)}"><button class="play" data-playpad title="Play pad">▶</button></div>
    <div class="mpce-toggle ${mp ? 'on' : ''}" data-mpce><div><b>MPCe Expressive pad</b><small>${mp ? '4 corners · 64 strike zones per bank' : 'Split into 4 corners, each with its own sample, articulation and sound.'}</small></div><span class="switch"></span></div>
    <div class="row"><span class="lbl">Trigger</span><div class="seg" data-seg="pad.oneShot"><button data-v="1" class="${p.oneShot ? 'on' : ''}">One Shot</button><button data-v="0" class="${p.oneShot ? '' : 'on'}">Note On</button></div>
      <label class="chk" style="margin:0"><input type="checkbox" data-bind="pad.mono" data-type="bool" ${p.mono ? 'checked' : ''}>Mono</label></div>
    <div class="row"><span class="lbl">Mute group</span>${mg}</div>
    <div class="row"><span class="lbl">Pad colour</span><div class="swatches">
      <button class="sw auto ${p.color ? '' : 'on'}" data-color="" title="Automatic (red, or purple for MPCe)">A</button>
      ${PAD_COLORS.map(c => `<button class="sw ${p.color === c ? 'on' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
      <label class="sw custom-sw ${p.color && !PAD_COLORS.includes(p.color) ? 'on' : ''}" title="Custom colour" style="${p.color && !PAD_COLORS.includes(p.color) ? `background:${p.color}` : ''}"><input type="color" data-padcolor value="${p.color || '#ff3b30'}">+</label>
    </div><button class="btn tiny" data-colorbank title="Give every used pad in this bank this colour">Apply to bank</button></div>`;

  if (mp) {
    body += `<div class="row"><span class="lbl">XY mode</span><div class="seg v" data-seg="pad.xy"><button data-v="snap" class="${p.xy !== 'morph' ? 'on' : ''}">Snap to quadrant</button><button data-v="morph" class="${p.xy === 'morph' ? 'on' : ''}">Morph (blend)</button></div></div>
      <p class="note">${p.xy === 'morph' ? 'Finger position blends all four corner samples (Akai “4 Samples XY”). Click anywhere on the pad to hear the blend.' : 'Each corner plays its own sample — Akai’s “64 Pad Layout”.'}</p>
      <h3>Quadrant</h3>
      <div class="qpick">${[2, 3, 0, 1].map(q => {
        const QQ = p.quads[q], LL = QQ.layers.find(l => l.sample && samples.has(l.sample));
        return `<div class="qbtn ${q === ui.quad ? 'on' : ''}" data-qsel="${q}"><span class="qpos">${QSHORT[q]} · ${QNAMES[q].toUpperCase()}</span>
          <span class="qs">${LL ? esc(samples.get(LL.sample).name) : '—'}</span><span class="qa">${QQ.art.type ? esc(artLabel(QQ.art.type)) : 'Plain hit'}${QQ.layers.filter(l => l.sample).length > 1 ? ' · 2 vel layers' : ''}</span></div>`;
      }).join('')}</div>
      <div class="sect violet"><h3>${QNAMES[ui.quad]} · samples</h3>
        ${layerRows(layers, 2, '#c6a2ff', true)}
        <div class="lyr-actions"><button class="btn tiny" data-copyquad>Copy quadrant to all 4</button><button class="btn tiny" data-clearquad>Clear quadrant</button></div>
      </div>
      <div class="sect violet"><h3>Sound · ${ui.layer ? 'hi' : 'lo'} layer</h3>${soundParams(L)}</div>
      ${artSection(A, true, `Articulation · ${QSHORT[ui.quad]}`)}`;
  } else {
    body += `<div class="sect"><h3>Samples · velocity layers <span class="tag">${layers.filter(l => l.sample).length}/8</span></h3>${layerRows(layers, 8, '#ff6b61', false)}</div>
      <div class="sect"><h3>Sound · layer ${ui.layer + 1}</h3>${soundParams(L)}</div>
      ${artSection(A, false, 'Articulation')}`;
  }
  body += `<div class="sect"><h3>MPCe expression <span class="tag v">PAD X / Y</span></h3>
      <div class="params">${param('X → Filter cutoff', 'pad.expr.xCutoff', 0, 1, 0.01, p.expr.xCutoff || 0, FMT['pad.expr.xCutoff'])}${param('Y → Resonance', 'pad.expr.yReso', 0, 1, 0.01, p.expr.yReso || 0, FMT['pad.expr.yReso'])}</div>
      <p class="note">Slide your finger on the MPC pad to open a low-pass filter (left → right) and add resonance (bottom → top). Not simulated here.</p>
      <div class="lyr-actions"><button class="btn tiny" data-clearpad>Clear pad</button></div></div>`;
  el.innerHTML = body;
  const sel = $('select[data-bind="A.type"]', el); if (sel) sel.value = String(A.type || 0);
  paintWaves(el); requestAnimationFrame(paintWaveEditor);
}

/* ================================================================ render: library */
function renderLibrary() {
  const q = ui.search.trim().toLowerCase();
  const used = usedSampleIds(kit()), usedAny = usedSampleIds();
  const ids = libOrder.filter(id => samples.has(id) && (!q || samples.get(id).name.toLowerCase().includes(q)));
  $('#libCount').textContent = libOrder.length ? `${ids.length} of ${libOrder.length} sounds · ${used.size} on this kit` : '';
  $('#libStripCount').textContent = libOrder.length ? `· ${libOrder.length}` : '';
  $('#libList').innerHTML = ids.map(id => {
    const s = samples.get(id);
    return `<li class="lib-item ${used.has(id) ? 'used' : ''} ${ui.libSel === id ? 'on' : ''}" draggable="true" data-sid="${id}" title="${esc(s.name)}${usedAny.has(id) && !used.has(id) ? ' (used in another kit)' : ''}">
      <span class="grip">⋮⋮</span>${waveCanvas(id, '#3ddc84', '')}<div style="min-width:0"><div class="nm">${esc(s.name)}</div><div class="meta">${s.dur.toFixed(2)}s · ${s.ext.toUpperCase()}</div></div><span class="dot"></span></li>`;
  }).join('') || `<li class="note" style="padding:20px 6px;text-align:center">No sounds yet.</li>`;
  paintWaves($('#libList'));
}

function renderAll() { renderExpansion(); renderKitTabs(); renderLcd(); renderBanks(); renderGrid(); renderDetail(); renderLibrary(); renderProjName(); renderSeq(); }

/* ================================================================ assignment */
function setLayerSample(layers, li, sid) {
  while (layers.length <= li) layers.push(newLayer());
  layers[li].sample = sid;
}
const quadsEmpty = p => !p.quads.some(Q => Q.layers.some(l => l.sample));
/** One sample onto an MPCe quadrant: the first sample on an empty pad goes to all 4 corners,
 *  after that it only replaces the quadrant it was dropped on. */
function dropOnQuad(p, q, sid) {
  if (quadsEmpty(p)) p.quads.forEach(Q => setLayerSample(Q.layers, 0, sid));
  else setLayerSample(p.quads[q].layers, 0, sid);
}
/** Assign sample ids starting at pad i (and quadrant q for MPCe pads). */
function assignSamples(i, ids, q = null) {
  if (!ids.length) return;
  mutate(() => {
    let pi = i, qi = q, n = 0;
    while (n < ids.length && pi < 128) {
      const p = ensurePad(pi);
      if (p.mpce && ids.length === 1 && (qi != null || quadsEmpty(p))) {
        dropOnQuad(p, qi ?? 0, ids[n++]);
      } else if (p.mpce) {
        let start = qi ?? 0;
        if (ids.length === 1 && q == null) { const empty = p.quads.findIndex(Q => !Q.layers.some(l => l.sample)); start = empty >= 0 ? empty : (pi === ui.pad ? ui.quad : 0); }
        for (let k = start; k < 4 && n < ids.length; k++) setLayerSample(p.quads[k].layers, 0, ids[n++]);
      } else {
        setLayerSample(p.layers, pi === ui.pad && ids.length === 1 ? ui.layer : 0, ids[n++]);
      }
      pi++; qi = null;
    }
    ui.pad = i; if (q != null) ui.quad = q;
  });
}
function swapPads(a, b) {
  if (a === b) return;
  mutate(() => { const k = kit(); [k.pads[a], k.pads[b]] = [k.pads[b], k.pads[a]]; ui.pad = b; });
}

/* ================================================================ events: header + expansion */
document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]'); if (act) { app.menu(act.dataset.act); }
});
['expName', 'expAuthor', 'expDesc', 'expVersion', 'expId'].forEach(id => {
  const key = { expName: 'name', expAuthor: 'author', expDesc: 'description', expVersion: 'version', expId: 'identifier' }[id];
  $('#' + id).addEventListener('input', ev => { pushUndo(); S.expansion[key] = ev.target.value; markDirty(); renderPreviewCard(); $('#expId').placeholder = Exporter.identifier({ ...S.expansion, identifier: '' }); });
});
async function imageToJpeg(src) {
  const img = new Image(); img.src = src; await img.decode();
  const size = 1000, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const s = Math.min(img.width, img.height);
  g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.9);
}
async function setImageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try { const jpg = await imageToJpeg(url); pushUndo(); S.expansion.image = jpg; markDirty(); renderExpansion(); }
  catch (e) { toast('Could not read that image', true); }
  finally { URL.revokeObjectURL(url); }
}
$('#art').addEventListener('click', async () => {
  try { const p = await bridge('pickImage'); if (p) setImageFromBlob(await (await fetch(fileURL(p))).blob()); } catch (e) { toast(e.message, true); }
});
$('#artRemove').addEventListener('click', () => { pushUndo(); S.expansion.image = null; markDirty(); renderExpansion(); });
dropTarget($('#art'), { files: async files => { const img = files.find(f => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|heic|tiff?)$/i.test(f.name)); if (img) setImageFromBlob(img); } });

/* ================================================================ events: kits, banks, lcd */
$('#kitTabs').addEventListener('click', e => {
  const del = e.target.closest('[data-delkit]');
  if (del) { e.stopPropagation(); const k = +del.dataset.delkit; if (confirm(`Delete kit “${S.kits[k].name}”?`)) mutate(() => { S.kits.splice(k, 1); ui.kit = clamp(ui.kit >= k ? ui.kit - 1 : ui.kit, 0, S.kits.length - 1); }); renderKitTabs(); return; }
  if (e.target.closest('[data-addkit]')) { mutate(() => { S.kits.push(newKit('Kit ' + (S.kits.length + 1))); ui.kit = S.kits.length - 1; ui.pad = 0; ui.bank = 0; }); renderKitTabs(); setTimeout(() => $('#kitName').select(), 0); return; }
  const t = e.target.closest('[data-kit]'); if (t) { ui.kit = +t.dataset.kit; ui.pad = ui.bank * 16; renderAll(); }
});
$('#kitName').addEventListener('input', e => { pushUndo(); kit().name = e.target.value; markDirty(); renderKitTabs(); });
$('#banks').addEventListener('click', e => { const b = e.target.closest('[data-bank]'); if (!b) return; ui.bank = +b.dataset.bank; ui.pad = ui.bank * 16 + (ui.pad % 16); renderLcd(); renderBanks(); renderGrid(); renderDetail(); });
$('#testVel').addEventListener('input', e => { $('#testVelV').textContent = e.target.value; const c = $('.velbar .cur'); if (c) c.style.left = (e.target.value / 128 * 100) + '%'; });

/* ================================================================ events: pad grid */
let heldHandle = null;
$('#padGrid').addEventListener('mousedown', e => {
  const pe = e.target.closest('.pad'); if (!pe || e.button !== 0) return;
  const i = +pe.dataset.i;
  if (e.altKey) { togglePadMpce(i); return; }
  const r = pe.getBoundingClientRect();
  const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
  const qe = e.target.closest('.quad');
  const q = qe ? +qe.dataset.q : null;
  const changed = ui.pad !== i || (q != null && ui.quad !== q);
  ui.pad = i; if (q != null) { if (ui.quad !== q) ui.layer = 0; ui.quad = q; }
  if (changed) { renderGrid(); renderDetail(); renderSeq(); }
  heldHandle = playPad(i, { quad: q, x, y });
});
window.addEventListener('mouseup', () => { if (heldHandle) { heldHandle.release(); heldHandle = null; } });
$('#padGrid').addEventListener('dragstart', e => {
  const pe = e.target.closest('.pad'); if (!pe) return;
  if (heldHandle) { heldHandle.release(); heldHandle = null; }
  e.dataTransfer.setData('application/x-eb-pad', pe.dataset.i); e.dataTransfer.effectAllowed = 'move';
});
function togglePadMpce(i) {
  mutate(() => {
    const p = ensurePad(i);
    p.mpce = !p.mpce;
    // carry samples across when switching so nothing is lost
    if (p.mpce && quadsEmpty(p)) { const ls = p.layers.filter(l => l.sample); (ls.length === 1 ? [ls[0], ls[0], ls[0], ls[0]] : ls.slice(0, 4)).forEach((l, n) => { p.quads[n].layers[0] = { ...l, vlo: 0, vhi: 127 }; }); }
    if (!p.mpce && !p.layers.some(l => l.sample)) { const ls = p.quads.map(Q => Q.layers.find(l => l.sample)).filter(Boolean); if (ls.length) p.layers = ls.map(l => ({ ...l })); }
    ui.pad = i; ui.layer = 0;
  });
  toast(padAt(i).mpce ? `${padLabel(i)} → MPCe (4 quadrants)` : `${padLabel(i)} → standard pad`);
}

/* ================================================================ drag & drop plumbing */
function dropTarget(el, { files, sample, pad, over } = {}) {
  el.addEventListener('dragover', e => {
    const t = e.dataTransfer.types;
    const ok = (files && t.includes('Files')) || (sample && t.includes('application/x-eb-sample')) || (pad && t.includes('application/x-eb-pad')) || ((sample || files) && t.includes('application/x-eb-path'));
    if (!ok) return;
    e.preventDefault(); e.stopPropagation();
    if (over) over(e, true); else el.classList.add('drag');
  });
  el.addEventListener('dragleave', e => { if (over) over(e, false); else if (!el.contains(e.relatedTarget)) el.classList.remove('drag'); });
  el.addEventListener('drop', async e => {
    const t = e.dataTransfer.types;
    if (!((files && t.includes('Files')) || (sample && t.includes('application/x-eb-sample')) || (pad && t.includes('application/x-eb-pad')) || ((sample || files) && t.includes('application/x-eb-path')))) return;
    e.preventDefault(); e.stopPropagation();
    if (over) over(e, false); else el.classList.remove('drag');
    if (t.includes('application/x-eb-sample') && sample) return sample(e.dataTransfer.getData('application/x-eb-sample'), e);
    if (t.includes('application/x-eb-pad') && pad) return pad(+e.dataTransfer.getData('application/x-eb-pad'), e);
    if (t.includes('application/x-eb-path')) { // a sound dragged from the browser
      const added = await importPaths([e.dataTransfer.getData('application/x-eb-path')]);
      if (added.length && sample) sample(added[0].id, e);
      return;
    }
    if (t.includes('Files') && files) return files(await filesFromDrop(e.dataTransfer), e);
  });
}
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

// pad grid drops
function gridTarget(e) {
  const pe = e.target.closest('.pad'); if (!pe) return null;
  const qe = e.target.closest('.quad');
  return { i: +pe.dataset.i, q: qe ? +qe.dataset.q : null, el: qe || pe };
}
let lastDropEl = null;
dropTarget($('#padGrid'), {
  over: (e, on) => { if (lastDropEl) lastDropEl.classList.remove('drop'); lastDropEl = null; if (on) { const t = gridTarget(e); if (t) { t.el.classList.add('drop'); lastDropEl = t.el; } } },
  sample: (sid, e) => { const t = gridTarget(e); if (t) assignSamples(t.i, [sid], t.q); },
  pad: (from, e) => { const t = gridTarget(e); if (t) swapPads(from, t.i); },
  files: async (files, e) => { const t = gridTarget(e); const added = await importFiles(files); if (t && added.length) assignSamples(t.i, added.map(s => s.id), t.q); },
});

// detail panel drops (quadrant buttons / layer rows / the panel itself)
let detailDropEl = null;
function detailTarget(e) {
  const qb = e.target.closest('[data-qsel]'); if (qb) return { el: qb, q: +qb.dataset.qsel };
  const lr = e.target.closest('.layer'); if (lr) return { el: lr, layer: +lr.dataset.layer };
  return { el: null };
}
function dropIntoDetail(ids, e) {
  const t = detailTarget(e), i = ui.pad;
  if (t.q != null) { const p = ensurePad(i); if (!p.mpce) return; mutate(() => { dropOnQuad(p, t.q, ids[0]); ui.quad = t.q; ui.layer = 0; }); return; }
  if (t.layer === 0 && ids.length === 1 && curPad() && curPad().mpce && quadsEmpty(curPad())) { mutate(() => { dropOnQuad(curPad(), ui.quad, ids[0]); ui.layer = 0; }); return; }
  if (t.layer != null) { mutate(() => { const p = ensurePad(i); const ls = p.mpce ? p.quads[ui.quad].layers : p.layers; ids.slice(0, (p.mpce ? 2 : 8) - t.layer).forEach((id, n) => setLayerSample(ls, t.layer + n, id)); ui.layer = t.layer; }); return; }
  assignSamples(i, ids, curPad() && curPad().mpce ? ui.quad : null);
}
dropTarget($('#detail'), {
  over: (e, on) => { if (detailDropEl) detailDropEl.classList.remove('drop'); detailDropEl = null; if (on) { const t = detailTarget(e); if (t.el) { t.el.classList.add('drop'); detailDropEl = t.el; } } },
  sample: (sid, e) => dropIntoDetail([sid], e),
  files: async (files, e) => { const added = await importFiles(files); if (added.length) dropIntoDetail(added.map(s => s.id), e); },
});

/* ================================================================ events: detail panel */
function bindCtx() {
  const p = curPad(); if (!p) return {};
  const Q = p.mpce ? p.quads[ui.quad] : null;
  const layers = p.mpce ? Q.layers : p.layers;
  return { pad: p, L: layers[ui.layer], A: p.mpce ? Q.art : p.art, layers };
}
function setPath(path, val) {
  const ctx = bindCtx(); const parts = path.split('.');
  let o = ctx[parts[0]]; if (!o) return;
  for (let k = 1; k < parts.length - 1; k++) o = o[parts[k]] = o[parts[k]] || {};
  o[parts[parts.length - 1]] = val;
}
const detail = $('#detail');
detail.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.padcolor !== undefined) { pushUndo(); curPad().color = t.value; markDirty(); renderGrid(); const l = t.closest('.custom-sw'); if (l) l.style.background = t.value; return; }
  if (t.dataset.vel) {
    const ctx = bindCtx(); const L = ctx.layers[+t.dataset.layer]; if (!L) return;
    pushUndo(); const v = clamp(parseInt(t.value, 10) || 0, 0, 127);
    if (t.dataset.vel === 'lo') L.vlo = Math.min(v, L.vhi); else L.vhi = Math.max(v, L.vlo);
    markDirty(); return;
  }
  const b = t.dataset.bind; if (!b) return;
  pushUndo();
  let v = t.type === 'checkbox' ? t.checked : t.value;
  const ty = t.dataset.type;
  if (ty === 'int') v = parseInt(v, 10) || 0; else if (ty === 'str') v = String(v); else if (ty === 'bool') v = !!v; else if (t.type === 'range') v = parseFloat(v);
  setPath(b, v); markDirty();
  const f = detail.querySelector(`[data-fmt="${b}"]`); if (f && FMT[b]) f.textContent = FMT[b](v);
  if (b === 'pad.name' || b.startsWith('L.') || b === 'A.type') renderGrid();
  if (b === 'L.start') startChanged(v);
});
detail.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.vel) { renderDetail(); renderGrid(); return; }
  if (t.dataset.padcolor !== undefined) { renderDetail(); return; }
  if (t.dataset.bind === 'A.type' || t.dataset.bind === 'pad.muteGroup' || t.dataset.bind === 'pad.mono') { renderDetail(); renderGrid(); }
  if (t.dataset.bind === 'A.type') { stopArtCycle(); renderDetail(); auditionArt(); }
});
const PARAM_DEFAULTS = { 'L.tune': 0, 'L.fine': 0, 'L.start': 0, 'L.level': 0, 'L.pan': 0, 'A.speed': 0.5, 'A.dynamics': 0.5, 'A.stereo': 1, 'pad.expr.xCutoff': 0, 'pad.expr.yReso': 0 };
function resetParam(b) { if (b in PARAM_DEFAULTS) { pushUndo(); setPath(b, PARAM_DEFAULTS[b]); markDirty(); renderDetail(); renderGrid(); } }
detail.addEventListener('dblclick', e => { // double-click a slider to reset it
  const r = e.target.closest('input[type=range][data-bind]'); if (r) resetParam(r.dataset.bind);
});

/* ---- type a value: click the number next to a slider */
const numIn = t => { const m = String(t).replace(',', '.').match(/[-+]?\d*\.?\d+/); return m ? parseFloat(m[0]) : NaN; };
const pct = d => t => /off/i.test(t) ? 0 : numIn(t) / d;
const PARSE = {
  'L.tune': numIn, 'L.fine': numIn, 'L.start': numIn,
  'L.level': t => /inf|∞/i.test(t) ? -48 : numIn(t),
  'L.pan': t => { t = String(t).trim().toUpperCase(); if (t === 'C') return 0; const n = numIn(t); if (isNaN(n)) return NaN; return /^L/.test(t) ? -Math.abs(n) : /^R/.test(t) ? Math.abs(n) : n; },
  'A.speed': t => { const r = numIn(t); return r > 0 ? Math.log2(r) / 2 + 0.5 : NaN; },
  'A.dynamics': pct(200), 'A.stereo': pct(100), 'pad.expr.xCutoff': pct(100), 'pad.expr.yReso': pct(100),
};
/** Swap a value label for a text box; onCommit(text) runs on Enter / blur, Esc cancels. */
function inlineEdit(el, text, onCommit) {
  const old = el.innerHTML, inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'val-edit'; inp.value = text; inp.spellcheck = false;
  el.textContent = ''; el.appendChild(inp); inp.focus(); inp.select();
  let done = false;
  const finish = ok => { if (done) return; done = true; const v = inp.value; el.innerHTML = old; if (ok) onCommit(v); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('mousedown', e => e.stopPropagation());
}
function editParam(f) {
  const b = f.dataset.fmt, r = detail.querySelector(`input[type=range][data-bind="${b}"]`); if (!r || !PARSE[b]) return;
  const shown = f.textContent.trim().replace(/\s*(st|ct|ms|dB)$/, '').replace(/^×/, '').replace(/%$/, '').replace(/^\+/, '');
  inlineEdit(f, shown, txt => {
    let v = PARSE[b](txt); if (!isFinite(v)) { toast('Not a number: ' + txt, true); return; }
    const step = +r.step || 1; if (step >= 1) v = Math.round(v);
    v = clamp(v, +r.min, +r.max);
    pushUndo(); setPath(b, v); markDirty(); renderDetail(); renderGrid();
  });
}
$('#testVelV').addEventListener('click', e => {
  const el = e.currentTarget; if (el.querySelector('input')) return;
  inlineEdit(el, el.textContent, t => { const v = Math.round(numIn(t)); if (!isFinite(v)) return; const r = $('#testVel'); r.value = clamp(v, 1, 127); r.dispatchEvent(new Event('input', { bubbles: true })); });
});

/* ---- big waveform: drag the start point */
let wedView = { sid: null, v0: 0, v1: 1 };
const bufPeak = new WeakMap();
function peakOf(buf) {
  if (bufPeak.has(buf)) return bufPeak.get(buf);
  let m = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 2) { const a = Math.abs(d[i]); if (a > m) m = a; } }
  bufPeak.set(buf, m || 1); return m || 1;
}
function wedCtx() {
  const cv = $('#detail .wed-cv'); if (!cv) return null;
  const { L } = bindCtx(); const s = L && L.sample && samples.get(L.sample); if (!s) return null;
  if (wedView.sid !== L.sample) wedView = { sid: L.sample, v0: 0, v1: 1 };
  return { cv, L, s };
}
function paintWaveEditor() {
  const c = wedCtx(); if (!c) return;
  const { cv, L, s } = c, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const { v0, v1 } = wedView, durMs = s.dur * 1000, top = 16, bot = h - 4, mid = (top + bot) / 2, amp = (bot - top) / 2 * 0.96;
  // time grid
  const spanMs = (v1 - v0) * durMs, steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000];
  const tick = steps.find(t => t / spanMs * w >= 64) || 60000;
  g.font = '9.5px "SF Mono", Menlo, monospace'; g.textBaseline = 'top';
  for (let t = Math.ceil(v0 * durMs / tick) * tick; t <= v1 * durMs; t += tick) {
    const x = Math.round((t / durMs - v0) / (v1 - v0) * w) + 0.5;
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, top, 1, bot - top);
    g.fillStyle = '#5a5a64'; g.fillText((tick < 1 ? t.toFixed(1) : t >= 1000 && tick >= 1000 ? (t / 1000) + 's' : Math.round(t)) + '', x + 3, 3);
  }
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, Math.round(mid), w, 1);
  // min / max per pixel column straight from the buffer
  const buf = s.buffer, N = buf.length, chs = Math.min(2, buf.numberOfChannels), data = [];
  for (let k = 0; k < chs; k++) data.push(buf.getChannelData(k));
  const norm = 1 / peakOf(buf), startFrac = clamp((L.start || 0) / durMs, 0, 1), color = cv.dataset.color || '#ff6b61';
  for (let x = 0; x < w; x++) {
    const fa = v0 + (x / w) * (v1 - v0), fb = v0 + ((x + 1) / w) * (v1 - v0);
    let ia = Math.floor(fa * N), ib = Math.max(ia + 1, Math.floor(fb * N));
    if (L.reverse) { const a = N - ib, b2 = N - ia; ia = a; ib = b2; }
    ia = clamp(ia, 0, N - 1); ib = clamp(ib, ia + 1, N);
    const stride = Math.max(1, Math.floor((ib - ia) / 96));
    let lo = 0, hi = 0;
    for (const d of data) for (let i = ia; i < ib; i += stride) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const y1 = mid - hi * norm * amp, y2 = mid - lo * norm * amp;
    g.fillStyle = fa < startFrac ? 'rgba(255,255,255,.16)' : color;
    g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
  // start marker
  const sx = (startFrac - v0) / (v1 - v0) * w;
  if (sx >= -1 && sx <= w + 1) {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, top, Math.max(0, sx), bot - top);
    g.fillStyle = '#fff'; g.fillRect(Math.round(sx) - 0.5, top - 2, 1.5, bot - top + 2);
    g.beginPath(); g.moveTo(sx - 6, top - 6); g.lineTo(sx + 6, top - 6); g.lineTo(sx, top + 2); g.closePath(); g.fill();
  } else {
    g.fillStyle = '#fff'; g.font = '700 10px "SF Mono", Menlo, monospace'; g.textBaseline = 'middle';
    if (sx < 0) g.fillText('◀ start', 4, mid); else { g.textAlign = 'right'; g.fillText('start ▶', w - 4, mid); g.textAlign = 'left'; }
  }
  if (v0 > 0 || v1 < 1) { // overview strip: where we are in the sample
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, h - 3, w, 3);
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(v0 * w, h - 3, Math.max(2, (v1 - v0) * w), 3);
  }
}
function startChanged(v) {
  const cv = detail.querySelector('.layer.on canvas'); if (cv) { cv.dataset.start = v; paintWaves(detail); }
  const r = detail.querySelector('input[type=range][data-bind="L.start"]'); if (r) r.value = v;
  const f = detail.querySelector('[data-fmt="L.start"]'); if (f && !f.querySelector('input')) f.textContent = FMT['L.start'](v);
  const ws = $('#wedStart'); if (ws) ws.textContent = FMT['L.start'](v);
  paintWaveEditor();
}
function wedZoom(factor, at) { // at = 0..1 within the sample
  let span = clamp((wedView.v1 - wedView.v0) * factor, 0.0005, 1);
  const c = wedCtx(); if (c) span = Math.max(span, Math.min(1, 4 / (c.s.dur * 1000))); // never closer than 4 ms
  const rel = (at - wedView.v0) / (wedView.v1 - wedView.v0);
  let v0 = at - rel * span; v0 = clamp(v0, 0, 1 - span);
  wedView.v0 = v0; wedView.v1 = v0 + span; paintWaveEditor();
}
detail.addEventListener('mousedown', e => {
  const cv = e.target.closest('.wed-cv'); if (!cv) return;
  const c = wedCtx(); if (!c) return;
  e.preventDefault(); e.stopPropagation();
  const { L, s } = c, durMs = s.dur * 1000, maxStart = Math.max(1, Math.floor(durMs) - 5);
  const r = cv.getBoundingClientRect();
  const msAt = x => (wedView.v0 + clamp((x - r.left) / r.width, 0, 1) * (wedView.v1 - wedView.v0)) * durMs;
  pushUndo(); stopArtCycle(); Audio.stopAll();
  let cur = L.start || 0, lastX = e.clientX;
  const set = ms => { cur = clamp(ms, 0, maxStart); L.start = Math.round(cur); markDirty(); startChanged(L.start); };
  if (!e.shiftKey) set(msAt(e.clientX));
  const move = ev => {
    if (ev.shiftKey) set(cur + (ev.clientX - lastX) / r.width * (wedView.v1 - wedView.v0) * durMs / 10);
    else set(msAt(ev.clientX));
    lastX = ev.clientX;
  };
  const up = () => {
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    renderGrid();
    const p = curPad(); const h = playPad(ui.pad, { quad: p.mpce ? ui.quad : null, layer: ui.layer, velocity: Math.round((L.vlo + L.vhi) / 2) || 100 });
    if (h) setTimeout(() => h.release(), Math.max(300, durMs - L.start));
  };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
}, true);
detail.addEventListener('wheel', e => {
  const cv = e.target.closest('.wed-cv'); if (!cv) return;
  e.preventDefault();
  const r = cv.getBoundingClientRect(), span = wedView.v1 - wedView.v0;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const v0 = clamp(wedView.v0 + e.deltaX / r.width * span, 0, 1 - span); wedView.v0 = v0; wedView.v1 = v0 + span; paintWaveEditor(); return; }
  wedZoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.004)), wedView.v0 + clamp((e.clientX - r.left) / r.width, 0, 1) * span);
}, { passive: false });
detail.addEventListener('dblclick', e => { if (e.target.closest('.wed-cv')) { wedView.v0 = 0; wedView.v1 = 1; paintWaveEditor(); } });
let detailHeld = null;
detail.addEventListener('mousedown', e => {
  const p = curPad();
  const pl = e.target.closest('[data-playlayer]');
  if (pl) { e.stopPropagation(); stopArtCycle(); Audio.stopAll(); const li = +pl.dataset.playlayer; const ls = bindCtx().layers; const L = ls[li]; detailHeld = playPad(ui.pad, { quad: p.mpce ? ui.quad : null, layer: li, velocity: L ? Math.round((L.vlo + L.vhi) / 2) || 100 : 100 }); return; }
  if (e.target.closest('[data-artstep]')) { stopArtCycle(); stepArt(+e.target.closest('[data-artstep]').dataset.artstep); return; }
  if (e.target.closest('[data-playart]') || e.target.closest('[data-playpad]')) { stopArtCycle(); Audio.stopAll(); detailHeld = playPad(ui.pad, { quad: p && p.mpce ? ui.quad : null }); return; }
});
window.addEventListener('mouseup', () => { if (detailHeld) { detailHeld.release(); detailHeld = null; } });
detail.addEventListener('click', e => {
  const t = e.target;
  const fv = t.closest('b[data-fmt]');
  if (fv) { if (!fv.querySelector('input')) { if (e.altKey) resetParam(fv.dataset.fmt); else editParam(fv); } return; }
  const wz = t.closest('[data-wzoom]');
  if (wz) { const c = wedCtx(); if (!c) return; const z = wz.dataset.wzoom, sf = clamp((c.L.start || 0) / (c.s.dur * 1000), 0, 1);
    if (z === 'fit') { wedView.v0 = 0; wedView.v1 = 1; paintWaveEditor(); } else wedZoom(z === 'in' ? 0.25 : 4, z === 'in' ? sf : (wedView.v0 + wedView.v1) / 2); return; }
  if (t.closest('[data-mpce]')) { togglePadMpce(ui.pad); return; }
  if (t.closest('[data-artcycle]')) { toggleArtCycle(); return; }
  const qs = t.closest('[data-qsel]'); if (qs) { stopArtCycle(); ui.quad = +qs.dataset.qsel; ui.layer = 0; renderDetail(); renderGrid(); Audio.stopAll(); playPad(ui.pad, { quad: ui.quad }); return; }
  const seg = t.closest('.seg button'); if (seg) {
    const path = seg.parentElement.dataset.seg; let v = seg.dataset.v;
    if (path === 'pad.oneShot' || path === 'L.reverse') v = v === '1'; else if (path === 'A.scale') v = +v;
    mutate(() => setPath(path, v)); return;
  }
  if (t.closest('[data-dellayer]')) { const li = +t.closest('[data-dellayer]').dataset.dellayer; mutate(() => { const ls = bindCtx().layers; if (ls.length > 1) ls.splice(li, 1); else Object.assign(ls[0], newLayer()); ui.layer = clamp(ui.layer, 0, ls.length - 1); }); return; }
  const lr = t.closest('.layer'); if (lr && !t.closest('input') && !t.closest('button')) { ui.layer = +lr.dataset.layer; renderDetail(); return; }
  if (t.closest('[data-addlayer]')) { mutate(() => { const c = bindCtx(); const max = c.pad.mpce ? 2 : 8; if (c.layers.length < max) { c.layers.push(newLayer()); ui.layer = c.layers.length - 1; } }); return; }
  if (t.closest('[data-autosplit]')) { mutate(() => { const ls = bindCtx().layers.filter(l => l.sample); const n = ls.length; ls.forEach((l, k) => { l.vlo = Math.round(k * 128 / n); l.vhi = Math.round((k + 1) * 128 / n) - 1; }); }); toast('Velocity split evenly — lowest layer = softest'); return; }
  if (t.closest('[data-fullrange]')) { mutate(() => bindCtx().layers.forEach(l => { l.vlo = 0; l.vhi = 127; })); return; }
  if (t.closest('[data-copyquad]')) { mutate(() => { const p = curPad(); const src = JSON.stringify(p.quads[ui.quad]); p.quads = p.quads.map(() => JSON.parse(src)); }); toast('Copied to all 4 quadrants'); return; }
  if (t.closest('[data-clearquad]')) { mutate(() => { curPad().quads[ui.quad] = newQuad(); ui.layer = 0; }); return; }
  const sw = t.closest('[data-color]'); if (sw) { mutate(() => { curPad().color = sw.dataset.color || null; }); return; }
  if (t.closest('[data-colorbank]')) { const c = curPad().color; mutate(() => { for (let n = ui.bank * 16; n < ui.bank * 16 + 16; n++) { const pp = kit().pads[n]; if (padUsed(pp)) pp.color = c; } }); toast(c ? 'Bank coloured' : 'Bank set to automatic colours'); return; }
  if (t.closest('[data-clearpad]')) { if (confirm(`Clear pad ${padLabel(ui.pad)}?`)) mutate(() => { kit().pads[ui.pad] = null; }); return; }
});

/* ================================================================ events: library */
const libList = $('#libList');
libList.addEventListener('mousedown', e => { const it = e.target.closest('.lib-item'); if (!it) return; ui.libSel = it.dataset.sid; $$('.lib-item.on', libList).forEach(x => x.classList.remove('on')); it.classList.add('on'); playSample(it.dataset.sid); });
libList.addEventListener('dblclick', e => { const it = e.target.closest('.lib-item'); if (!it) return; const p = curPad(); assignSamples(ui.pad, [it.dataset.sid], p && p.mpce ? ui.quad : null); });
libList.addEventListener('dragstart', e => { const it = e.target.closest('.lib-item'); if (!it) return; e.dataTransfer.setData('application/x-eb-sample', it.dataset.sid); e.dataTransfer.effectAllowed = 'copy'; });
$('#libSearch').addEventListener('input', e => { ui.search = e.target.value; renderLibrary(); });
$('#libDrop').addEventListener('click', () => app.menu('addSamples'));
dropTarget($('.col-lib'), { files: files => importFiles(files) });
$('#fillEmpty').addEventListener('click', () => {
  const used = usedSampleIds(kit());
  const free = libOrder.filter(id => samples.has(id) && !used.has(id));
  if (!free.length) { toast('Every sample is already on a pad'); return; }
  mutate(() => {
    let n = 0;
    for (let i = ui.bank * 16; i < 128 && n < free.length; i++) {
      const p = kit().pads[i];
      if (p && p.mpce) { p.quads.forEach(Q => { if (n < free.length && !Q.layers.some(l => l.sample)) Q.layers[0].sample = free[n++]; }); }
      else if (!padUsed(p)) { ensurePad(i).layers[0].sample = free[n++]; }
    }
  });
  toast('Filled empty pads');
});
$('#clearUnused').addEventListener('click', () => {
  const used = usedSampleIds(); const unused = libOrder.filter(id => !used.has(id));
  if (!unused.length) { toast('No unused samples'); return; }
  if (!confirm(`Remove ${unused.length} unused sample(s) from the library?`)) return;
  unused.forEach(id => samples.delete(id)); libOrder = libOrder.filter(id => samples.has(id)); markDirty(); renderLibrary();
});

/* ================================================================ keyboard */
const heldKeys = new Map();
window.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' && !['range', 'checkbox'].includes(e.target.type) || tag === 'textarea' || tag === 'select';
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k in KEY_TO_SLOT) {
    e.preventDefault(); if (e.repeat || heldKeys.has(k)) return;
    const i = ui.bank * 16 + KEY_TO_SLOT[k]; const p = padAt(i);
    const q = p && p.mpce ? (i === ui.pad ? ui.quad : 0) : null;
    heldKeys.set(k, playPad(i, { quad: q }));
    return;
  }
  if (k === 'arrowleft' || k === 'arrowright') { ui.bank = (ui.bank + (k === 'arrowright' ? 1 : 7)) % 8; ui.pad = ui.bank * 16 + ui.pad % 16; renderLcd(); renderBanks(); renderGrid(); renderDetail(); }
  if (k === 'm') togglePadMpce(ui.pad);
  if (k === ',' || k === '<') { e.preventDefault(); stopArtCycle(); stepArt(-1); }
  if (k === '.' || k === '>') { e.preventDefault(); stopArtCycle(); stepArt(1); }
  if (k === ' ') { e.preventDefault(); if (!e.repeat) seqToggle(); return; }
  if (k === 'escape') { seqStop(); stopArtCycle(); Audio.stopAll(); renderDetail(); }
});
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); const h = heldKeys.get(k); heldKeys.delete(k); if (h) h.release(); });

/* ================================================================ binary writes via bridge */
function abToB64(ab) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(new Blob([ab])); });
}
async function writeBinary(path, ab) {
  const CH = 3 * 1024 * 1024; const u8 = new Uint8Array(ab);
  if (u8.byteLength === 0) return bridge('writeChunk', { path, b64: '', append: false });
  for (let o = 0; o < u8.byteLength; o += CH) await bridge('writeChunk', { path, b64: await abToB64(u8.subarray(o, o + CH)), append: o > 0 });
}
function dataUrlToAb(d) { const b = atob(d.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }

/* ================================================================ project save / open */
async function saveProject(as = false) {
  try {
    let p = projPath;
    if (!p || as) {
      p = await bridge('pickSaveLocation', { name: Exporter.safeName(S.expansion.name || 'My Expansion') + '.ebproj', message: 'Save the project (a folder with your samples inside)' });
      if (!p) return false;
      if (!/\.ebproj$/i.test(p)) p += '.ebproj';
    }
    busy('Saving project…');
    await bridge('mkdir', { path: p + '/samples' });
    const list = [];
    for (const id of libOrder) {
      const s = samples.get(id); if (!s) continue;
      const file = `${id}.${s.ext}`;
      if (s.savedTo !== p) { await writeBinary(`${p}/samples/${file}`, s.bytes); s.savedTo = p; }
      list.push({ id, name: s.name, ext: s.ext, file });
    }
    const proj = { format: 'expansion-builder', version: 1, saved: new Date().toISOString(), expansion: S.expansion, kits: S.kits, samples: list, ui: { kit: ui.kit, bank: ui.bank } };
    await bridge('writeText', { path: p + '/project.json', text: JSON.stringify(proj) });
    projPath = p; dirty = false; renderProjName();
    try { localStorage.setItem('eb.lastProject', p); } catch (e) {}
    busy(false); toast('Project saved');
    return true;
  } catch (e) { busy(false); toast('Save failed: ' + e.message, true); return false; }
}
async function openProject(path = null) {
  try {
    if (!path) { if (dirty && !confirm('Discard unsaved changes?')) return; path = await bridge('pickProjectToOpen'); if (!path) return; }
    busy('Opening project…');
    const proj = JSON.parse(await bridge('readText', { path: path + '/project.json' }));
    if (proj.format !== 'expansion-builder') throw new Error('Not an Expansion Builder project');
    samples.clear(); libOrder = [];
    let missing = 0;
    for (const s of proj.samples) {
      try { const r = await fetch(fileURL(`${path}/samples/${s.file}`)); if (!r.ok) throw 0; await addSampleBytes(`${s.name}.${s.ext}`, await r.arrayBuffer(), { id: s.id, savedTo: path }); }
      catch (e) { missing++; }
    }
    S = { expansion: Object.assign(newState().expansion, proj.expansion), kits: proj.kits.map(k => ({ ...newKit(k.name), ...k, pads: k.pads.map(p => p ? normalizePad(p) : null) })) };
    ui.kit = clamp(proj.ui?.kit || 0, 0, S.kits.length - 1); ui.bank = proj.ui?.bank || 0; ui.pad = ui.bank * 16; ui.quad = 0; ui.layer = 0;
    projPath = path; dirty = false; undoStack.length = redoStack.length = 0;
    renderAll(); busy(false);
    toast(missing ? `Opened, but ${missing} sample(s) were missing` : 'Project opened', !!missing);
  } catch (e) { busy(false); toast('Open failed: ' + e.message, true); }
}
function normalizePad(p) {
  const d = newPad(); const o = Object.assign(d, p);
  o.layers = (p.layers && p.layers.length ? p.layers : [newLayer()]).map(l => Object.assign(newLayer(), l));
  o.quads = [0, 1, 2, 3].map(q => { const Q = (p.quads || [])[q] || newQuad(); return { layers: (Q.layers && Q.layers.length ? Q.layers : [newLayer()]).map(l => Object.assign(newLayer(), l)), art: Object.assign(newArt(), Q.art), ...(Q.seq ? { seq: Q.seq } : {}) }; });
  o.art = Object.assign(newArt(), p.art); o.expr = Object.assign({ xCutoff: 0, yReso: 0 }, p.expr);
  return o;
}

/* ================================================================ export */
const optEls = { zip: '#optZip', preview: '#optPreview' };
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('eb.prefs') || '{}');
    for (const [k, sel] of Object.entries(optEls)) if (k in p) $(sel).checked = !!p[k];
    $('#mpcHost').value = p.host || ''; $('#mpcDrive').value = p.drive || 'nvme'; $('#mpcPw').value = p.pw || '';
  } catch (e) {}
}
function savePrefs() {
  const p = { host: $('#mpcHost').value.trim(), drive: $('#mpcDrive').value.trim(), pw: $('#mpcPw').value };
  for (const [k, sel] of Object.entries(optEls)) p[k] = $(sel).checked;
  try { localStorage.setItem('eb.prefs', JSON.stringify(p)); } catch (e) {}
}
['#optZip', '#optPreview', '#mpcHost', '#mpcDrive', '#mpcPw'].forEach(s => $(s).addEventListener('input', savePrefs));

function log(msg, cls = '') { const l = $('#exportLog'); l.hidden = false; l.innerHTML += `<div class="${cls}">${esc(msg)}</div>`; l.scrollTop = l.scrollHeight; }

async function sampleFileData(s) {
  if (s.ext === 'wav' && s.info && s.info.mpcSafe && s.info.frames > 0) return { bytes: s.bytes, frames: s.info.frames, rate: s.info.rate };
  const buf = await Audio.decodeAt(s.bytes, 44100);
  return { bytes: Audio.encodeWav(buf, 24), frames: buf.length, rate: 44100 };
}

function previewEvents(k) {
  const ev = []; let t = 0.05;
  const pads = k.pads.map((p, i) => [p, i]).filter(([p]) => padUsed(p)).slice(0, 16);
  for (const [p] of pads) {
    const layers = p.mpce ? (p.quads.find(Q => Q.layers.some(l => l.sample)) || p.quads[0]).layers : p.layers;
    const ls = layers.filter(l => l.sample && inVel(l, 110)); const L = ls[0] || layers.find(l => l.sample);
    if (L) ev.push({ t, velocity: 110, parts: [{ layer: layerForPlay(L), gain: 1 }] });
    t += 0.25;
  }
  return { ev, dur: Math.min(12, t + 1.6) };
}

// Builds the expansion in the app's outbox and streams it into <drive>/Expansions on the MPC. No Finder, no folder picker.
async function sendToMPC() {
  if (!$('#mpcHost').value.trim()) { toast('Enter the MPC address first', true); $('#mpcHost').focus(); return; }
  if (!hasBridge) { toast('Sending needs the Expansion Builder app', true); return; }
  const root = await bridge('stagingDir').catch(err => { toast(err.message, true); return null; });
  if (root) await doExport(false, root, true);
}

async function doExport(kitOnly = false, rootOverride = null, send = false) {
  const e = S.expansion;
  const kits = kitOnly ? [kit()] : S.kits;
  const usable = kits.filter(k => k.pads.some(padUsed));
  if (!usable.length) { toast(kitOnly ? 'This kit has no sounds on its pads yet' : 'Put some sounds on pads first', true); return; }
  if (!kitOnly && !e.name.trim()) { toast('Give the expansion a name first', true); $('#expName').focus(); return; }
  if (!hasBridge) { toast('Export needs the Expansion Builder app', true); return; }
  const root = rootOverride || await bridge('pickFolder', { message: kitOnly ? 'Choose where to export the kit' : 'Choose where to export the expansion', prompt: 'Export Here' }).catch(err => { toast(err.message, true); return null; });
  if (!root) return;
  const title = Exporter.safeName(e.name, 'My Expansion');
  const base = `${root}/${kitOnly ? Exporter.safeName(kit().name, 'Kit') : title}`;
  $('#exportLog').innerHTML = '';
  try {
    if (await bridge('exists', { path: base })) {
      if (!rootOverride && !confirm(`“${base.split('/').pop()}” already exists there. Replace it? (The old folder goes to the Trash.)`)) return;
      await bridge('remove', { path: base, permanent: send });
    }
    busy('Exporting…');
    const t0 = performance.now();
    await Exporter.loadTemplate();
    const id = Exporter.identifier(e);
    let catDir = base;
    if (!kitOnly) {
      const img = `${id}.jpg`;
      await bridge('writeText', { path: `${base}/Expansion.xml`, text: Exporter.expansionXml(e, img) });
      if (e.image) await writeBinary(`${base}/${img}`, dataUrlToAb(e.image));
      else log('No cover art — the MPC will show a blank tile', 'err');
      catDir = `${base}/${title}`;
      log(`Expansion.xml · ${id}`);
    }
    let nSamples = 0;
    for (const k of usable) {
      const kname = Exporter.safeName(k.name, 'Kit');
      busy(`Exporting ${kname}…`);
      const tdDir = `${catDir}/${kname}_[TrackData]`;
      const files = new Map(); const names = new Set();
      for (const sid of usedSampleIds(k)) {
        const s = samples.get(sid); if (!s) continue;
        let nm = Exporter.safeName(s.name, 'Sample'), n = 2;
        while (names.has(nm.toLowerCase())) nm = `${Exporter.safeName(s.name, 'Sample')} ${n++}`;
        names.add(nm.toLowerCase());
        const fd = await sampleFileData(s);
        await writeBinary(`${tdDir}/${nm}.wav`, fd.bytes);
        files.set(sid, { file: `${nm}.wav`, name: nm, frames: fd.frames, rate: fd.rate });
        nSamples++;
      }
      const xtd = await Exporter.buildTrack(k, files);
      await writeBinary(`${catDir}/${kname}.xtd`, xtd);
      const mp = k.pads.filter(p => padUsed(p) && p.mpce).length;
      log(`${kname}.xtd · ${k.pads.filter(padUsed).length} pads${mp ? ` (${mp} MPCe)` : ''} · ${files.size} samples`);
      if (!kitOnly && $('#optPreview').checked) {
        busy(`Rendering preview for ${kname}…`);
        const { ev, dur } = previewEvents(k);
        if (ev.length) await writeBinary(`${catDir}/[Previews]/${kname}.xtd.wav`, await Audio.renderPreview(ev, dur));
      }
    }
    log(`✓ Exported to ${base}  (${((performance.now() - t0) / 1000).toFixed(1)}s)`, 'ok');
    if (!send && $('#optZip').checked) {
      busy('Zipping…');
      const z = await bridge('zip', { src: base, dest: `${base}.zip` });
      log(`✓ ${z.split('/').pop()}`, 'ok');
    }
    if (send) {
      const host = $('#mpcHost').value.trim();
      busy(`Sending to MPC at ${host}…`);
      try {
        const where = await bridge('sendToMPC', { src: base, host, password: $('#mpcPw').value, drive: $('#mpcDrive').value.trim() || 'nvme' });
        log(`✓ On the MPC: ${where}`, 'ok'); log('If it does not show yet, re-open Browse → Expansions on the MPC.');
        busy(false); toast('Sent to MPC');
      } catch (err) { busy(false); log('Send to MPC failed: ' + err.message, 'err'); toast('Send to MPC failed — is the MPC on and on Wi-Fi?', true); }
      return;
    }
    busy(false);
    toast(kitOnly ? 'Kit exported' : 'Expansion exported');
    if (!rootOverride) bridge('reveal', { path: base }).catch(() => {});
  } catch (err) {
    busy(false); log('Export failed: ' + err.message, 'err'); toast('Export failed: ' + err.message, true); console.error(err);
  }
}

/* ================================================================ test sequencer
 * A 16-step pattern per kit for auditioning while building. Never exported.
 * Notes live on the thing they play: pad.seq (standard pad) or pad.quads[q].seq (MPCe quadrant),
 * so swapping / clearing pads carries or clears their notes. Note = { s: step, len: steps, v: velocity }.
 */
const STEPS = 16;
const seq = { playing: false, step: 0, nextT: 0, timer: 0, releases: [], marks: [], raf: 0, mute: new Set(), solo: new Set(), lastVel: 100, folded: false };
const seqTarget = r => r.q == null ? r.p : r.p.quads[r.q];
const seqNotes = r => { const t = seqTarget(r); return t.seq || (t.seq = []); };
const rowColor = p => p.color || (p.mpce ? '#a259ff' : '#ff3b30'); // same defaults the exporter writes
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a.toFixed(3)})`; };
const velAlpha = v => 0.18 + 0.82 * clamp(v, 1, 127) / 127;

/** One row per playable zone: pads in pad order (A01…H16); MPCe pads give one row per filled quadrant (BL, BR, TL, TR). */
function seqRows(k = kit()) {
  const rows = [];
  k.pads.forEach((p, i) => {
    if (!padUsed(p)) return;
    if (p.mpce) p.quads.forEach((Q, q) => { if (Q.layers.some(l => l.sample && samples.has(l.sample))) rows.push({ i, q, p, key: i + ':' + q }); });
    else rows.push({ i, q: null, p, key: i + ':-' });
  });
  return rows;
}
function rowName(r) {
  if (r.q == null) return padDisplayName(r.p);
  const L = r.p.quads[r.q].layers.find(l => l.sample && samples.has(l.sample));
  return L ? samples.get(L.sample).name : '';
}
const rowAudible = r => !seq.mute.has(r.key) && (!seq.solo.size || seq.solo.has(r.key));
const noteHtml = (n, color) => `<i class="sn" data-s="${n.s}" style="left:${n.s / STEPS * 100}%;width:calc(${n.len / STEPS * 100}% - 3px);background:${hexA(color, velAlpha(n.v))};border-color:${color}"><b>${n.v}</b></i>`;

function renderSeq() {
  const body = $('#seqBody'); if (!body) return;
  if (document.activeElement !== $('#testBpm')) $('#testBpm').value = kit().bpm || 120;
  $('#seq').classList.toggle('folded', seq.folded);
  $('#seqFold').textContent = seq.folded ? '▸' : '▾';
  const rows = seqRows();
  const nums = Array.from({ length: STEPS }, (_, n) => `<span class="${n % 4 ? '' : 'beat'}">${n + 1}</span>`).join('');
  if (!rows.length) { body.innerHTML = `<div class="seq-empty">Put samples on pads and they show up here as rows, one per pad (one per filled quadrant on MPCe pads).</div>`; return; }
  body.innerHTML = `<div class="seq-row seq-top"><span></span><span class="seq-lbl"></span><span></span><div class="seq-lane seq-nums">${nums}</div></div>`
    + rows.map(r => {
      const c = rowColor(r.p), sel = r.i === ui.pad && (r.q == null || r.q === ui.quad);
      return `<div class="seq-row ${rowAudible(r) ? '' : 'silent'} ${sel ? 'sel' : ''}" data-key="${r.key}">
        <span class="seq-bar" style="background:${c}"></span>
        <span class="seq-lbl" data-row="${r.key}" title="Click to play &amp; select"><b>${padLabel(r.i)}${r.q != null ? ' · ' + QSHORT[r.q] : ''}</b><em>${esc(rowName(r))}</em>${r.p.muteGroup ? `<small class="tag">MG${r.p.muteGroup}</small>` : ''}</span>
        <span class="seq-ms"><button class="${seq.mute.has(r.key) ? 'on' : ''}" data-mute="${r.key}" title="Mute row">M</button><button class="${seq.solo.has(r.key) ? 'on' : ''}" data-solo="${r.key}" title="Solo row">S</button></span>
        <div class="seq-lane" data-lane="${r.key}">${seqNotes(r).map(n => noteHtml(n, c)).join('')}</div></div>`;
    }).join('');
  body.style.setProperty('--st', seq.step);
}
const rowByKey = key => seqRows().find(r => r.key === key);

/* ---- playback (Web Audio lookahead scheduler) ---- */
const stepDur = () => 60 / testBpm() / 4;
function playRow(r, when, vel) { return playPad(r.i, { quad: r.q, velocity: vel, when }); }
function seqTick() {
  const c = Audio.ctx, horizon = c.currentTime + 0.12;
  if (seq.nextT < c.currentTime - 0.25) seq.nextT = c.currentTime + 0.03; // timers were throttled: skip ahead instead of bursting
  while (seq.nextT < horizon) {
    const st = seq.step, t = seq.nextT, d = stepDur();
    for (const r of seqRows()) {
      if (!rowAudible(r)) continue;
      const n = (seqTarget(r).seq || []).find(n => n.s === st); if (!n) continue;
      const h = playRow(r, t, n.v);
      if (h) seq.releases.push({ h, t: t + n.len * d - 0.004 });
    }
    seq.marks.push({ step: st, t });
    seq.nextT += d; seq.step = (st + 1) % STEPS;
  }
  seq.releases = seq.releases.filter(x => { if (x.t < horizon) { x.h.release(x.t); return false; } return true; });
}
function seqDraw() {
  if (!seq.playing) return;
  const now = Audio.ctx.currentTime;
  let cur = null; while (seq.marks.length && seq.marks[0].t <= now) cur = seq.marks.shift();
  if (cur) $('#seqBody').style.setProperty('--st', cur.step);
  seq.raf = requestAnimationFrame(seqDraw);
}
function seqStart() {
  if (seq.playing) return;
  const c = Audio.ctx;
  seq.playing = true; seq.step = 0; seq.nextT = c.currentTime + 0.06; seq.releases = []; seq.marks = [];
  seq.timer = setInterval(seqTick, 25); seqTick();
  $('#seq').classList.add('playing'); $('#seqPlay').textContent = '■ Stop'; $('#seqPlay').classList.add('on');
  seq.raf = requestAnimationFrame(seqDraw);
}
function seqStop() {
  if (!seq.playing) return;
  seq.playing = false; clearInterval(seq.timer); cancelAnimationFrame(seq.raf);
  for (const x of seq.releases) x.h.release();
  seq.releases = []; seq.marks = [];
  Audio.stopAll();
  $('#seq').classList.remove('playing'); $('#seqPlay').textContent = '▶ Play'; $('#seqPlay').classList.remove('on');
}
const seqToggle = () => seq.playing ? seqStop() : seqStart();

/* ---- editing ---- */
$('#seqPlay').addEventListener('click', e => { e.currentTarget.blur(); seqToggle(); });
$('#seqFold').addEventListener('click', () => { seq.folded = !seq.folded; renderSeq(); });
$('#seqClear').addEventListener('click', () => {
  const rows = seqRows(); if (!rows.some(r => seqNotes(r).length)) return;
  pushUndo(); kit().pads.forEach(p => { if (!p) return; delete p.seq; p.quads.forEach(Q => delete Q.seq); }); markDirty(); renderSeq();
});
$('#testBpm').addEventListener('input', e => { const v = parseInt(e.target.value, 10); if (v >= 40 && v <= 300) { kit().bpm = v; markDirty(); } });
$('#testBpm').addEventListener('change', e => { kit().bpm = clamp(parseInt(e.target.value, 10) || 120, 40, 300); e.target.value = kit().bpm; markDirty(); });

let seqDrag = null;
$('#seqBody').addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const ms = e.target.closest('[data-mute],[data-solo]');
  if (ms) {
    const set = ms.dataset.mute ? seq.mute : seq.solo, key = ms.dataset.mute || ms.dataset.solo;
    set.has(key) ? set.delete(key) : set.add(key); renderSeq(); return;
  }
  const lbl = e.target.closest('[data-row]');
  if (lbl) {
    const r = rowByKey(lbl.dataset.row); if (!r) return;
    ui.pad = r.i; ui.bank = Math.floor(r.i / 16); if (r.q != null) { if (ui.quad !== r.q) ui.layer = 0; ui.quad = r.q; }
    renderLcd(); renderBanks(); renderGrid(); renderDetail(); renderSeq();
    heldHandle = playPad(r.i, { quad: r.q }); return;
  }
  const lane = e.target.closest('[data-lane]'); if (!lane) return;
  const r = rowByKey(lane.dataset.lane); if (!r) return;
  e.preventDefault();
  const box = lane.getBoundingClientRect();
  const stepAt = x => clamp(Math.floor((x - box.left) / box.width * STEPS), 0, STEPS - 1);
  const st = stepAt(e.clientX), notes = seqNotes(r);
  pushUndo();
  let n = notes.find(n => st >= n.s && st < n.s + n.len), created = false;
  if (!n) { n = { s: st, len: 1, v: seq.lastVel }; notes.push(n); notes.sort((a, b) => a.s - b.s); created = true; }
  const next = notes.find(m => m.s > n.s);
  // New notes are editable straight away; an existing note waits for movement so a plain click can remove it.
  seqDrag = { r, n, lane, created, mode: created ? 'edit' : 'pending', x0: e.clientX, y0: e.clientY, v0: n.v, len0: n.len, velOn: false,
    stepW: box.width / STEPS, maxLen: (next ? next.s : STEPS) - n.s, color: rowColor(r.p) };
  markDirty(); seqPaintNote(seqDrag);
  if (created) try { playRow(r, null, n.v); } catch (err) { console.error(err); }
});
function seqPaintNote(d) {
  let el = $(`.sn[data-s="${d.n.s}"]`, d.lane);
  if (!el) { d.lane.insertAdjacentHTML('beforeend', noteHtml(d.n, d.color)); el = d.lane.lastElementChild; }
  el.style.width = `calc(${d.n.len / STEPS * 100}% - 3px)`;
  el.style.background = hexA(d.color, velAlpha(d.n.v));
  el.firstChild.textContent = d.n.v;
  el.classList.toggle('vel', !!d.velOn);
}
window.addEventListener('mousemove', e => {
  const d = seqDrag; if (!d) return;
  const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
  if (d.mode === 'pending') { if (Math.hypot(dx, dy) <= 4) return; d.mode = 'edit'; }
  // Sideways = length (relative to where you grabbed it, in whole steps); up/down = velocity (after a small dead zone).
  d.n.len = clamp(d.len0 + Math.round(dx / d.stepW), 1, d.maxLen);
  if (!d.velOn && Math.abs(dy) > 6) { d.velOn = true; d.y0 += Math.sign(dy) * 6; }
  if (d.velOn) d.n.v = clamp(Math.round(d.v0 - (e.clientY - d.y0)), 1, 127);
  seqPaintNote(d);
});
window.addEventListener('mouseup', () => {
  const d = seqDrag; if (!d) return; seqDrag = null;
  if (d.mode === 'pending') { const ns = seqNotes(d.r); ns.splice(ns.indexOf(d.n), 1); } // plain click on a note = remove
  else { seq.lastVel = d.n.v; if (d.velOn) playRow(d.r, null, d.n.v); }
  markDirty(); renderSeq();
});

/* ================================================================ app api (menu) */
window.app = {
  isDirty: () => dirty,
  // Caps Lock (sent from the native side on every press, on or off) = stop everything.
  panic() { seqStop(); stopArtCycle(); Audio.stopAll(); renderDetail(); toast('All audio stopped'); },
  // test hooks (used by tools/ui_test.js via --snapshot --script)
  _t: { S: () => S, ui, samples, seq, seqStart, seqStop, seqRows, importPaths, assignSamples, togglePadMpce, renderAll, doExport, sendToMPC, muteGroupsByColor, playPad, mutate },
  async menu(cmd) {
    switch (cmd) {
      case 'new':
        if (dirty && !confirm('Discard unsaved changes and start a new expansion?')) return;
        seqStop(); S = newState(); samples.clear(); libOrder = []; projPath = null; dirty = false; Object.assign(ui, { kit: 0, bank: 0, pad: 0, quad: 0, layer: 0 }); undoStack.length = 0; renderAll(); break;
      case 'open': openProject(); break;
      case 'save': saveProject(false); break;
      case 'saveAs': saveProject(true); break;
      case 'addSamples':
        try { const paths = await bridge('pickSamples'); if (paths && paths.length) importPaths(paths); } catch (e) { toast(e.message, true); }
        break;
      case 'export': doExport(false); break;
      case 'exportKit': doExport(true); break;
      case 'sendMPC': sendToMPC(); break;
      case 'muteByColor': muteGroupsByColor(); break;
    }
  },
};

/* ================================================================ window dragging
 * WKWebView ignores -webkit-app-region, so tell the native side where the header is and which
 * rects inside it are controls; everything else in the header strip drags the window. */
function reportDragRegion() {
  if (!hasBridge) return;
  const top = $('.top').getBoundingClientRect();
  const holes = $$('.top button, .top input, .top select').map(el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }).filter(r => r[2] > 0);
  bridge('setDragRegion', { height: Math.ceil(top.bottom + 6), holes }).catch(() => {});
}

/* ================================================================ boot */
window.addEventListener('resize', () => { paintWaves(); reportDragRegion(); });
requestAnimationFrame(reportDragRegion);
loadPrefs();
renderAll();
Exporter.loadTemplate().catch(e => toast('Template failed to load: ' + e.message, true));
document.addEventListener('mousedown', () => Audio.ensure(), { once: true, capture: true });

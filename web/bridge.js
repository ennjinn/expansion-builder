/* MPC Bridge: the header dropdown that pulls things back FROM the MPC over Wi-Fi.
 * Lists projects (.xpj + _[ProjectData]) and the newest audio files (mixdowns, stems, recordings) on every
 * mounted MPC drive, then copies the ticked ones into a folder on the Mac (mpcList / mpcGrab in main.swift).
 * Uses the same MPC address / password as Send to MPC (Export panel); the address is editable here too. */
const MpcBridge = (() => {
  const st = { open: false, tab: 'project', items: [], drives: [], sel: new Set(), loading: false, error: '', loadedFor: '' };
  const pref = (() => { try { return JSON.parse(localStorage.getItem('eb.bridge') || '{}'); } catch (e) { return {}; } })();
  const savePref = () => { try { localStorage.setItem('eb.bridge', JSON.stringify(pref)); } catch (e) {} };
  const pop = () => $('#bridgePop');
  const host = () => $('#mpcHost').value.trim();

  const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
  const fmtDate = ms => {
    const d = new Date(ms), now = new Date();
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'Today ' + t;
    if (d.toDateString() === new Date(now - 864e5).toDateString()) return 'Yesterday ' + t;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  };
  const driveOf = p => st.drives.find(d => p.startsWith(d + '/')) || '';
  const driveName = d => d === '/nvme' ? 'Internal' : d.split('/').pop();
  const display = it => it.path.split('/').pop().replace(/\.xpj$/i, '');
  const where = it => { const d = driveOf(it.path); const rel = it.path.slice(d.length + 1).split('/').slice(0, -1).join(' / '); return `${driveName(d)}${rel ? ' · ' + rel : ''}`; };
  const list = () => st.items.filter(i => i.kind === st.tab).sort((a, b) => b.mtime - a.mtime);

  function render() {
    const el = pop(); if (!el) return;
    const nP = st.items.filter(i => i.kind === 'project').length, nA = st.items.length - nP;
    $('#bpHost').value = host();
    el.querySelectorAll('[data-bptab]').forEach(b => {
      b.classList.toggle('on', b.dataset.bptab === st.tab);
      b.querySelector('i').textContent = st.loadedFor ? (b.dataset.bptab === 'project' ? nP : nA) : '';
    });
    const rows = list();
    let body;
    if (st.loading) body = '<div class="bp-empty">Looking on the MPC…</div>';
    else if (st.error) body = `<div class="bp-empty err">${esc(st.error)}<br><small>Check that the MPC is on, on the same Wi-Fi as this Mac, and has developer mode switched on.</small></div>`;
    else if (!host()) body = '<div class="bp-empty">Enter your MPC’s IP address above (on the MPC: Preferences → Wi-Fi).</div>';
    else if (!st.loadedFor) body = '<div class="bp-empty">Press ⟳ to look on the MPC.</div>';
    else if (!rows.length) body = `<div class="bp-empty">${st.tab === 'project' ? 'No saved projects found on the MPC.' : 'No audio files found. Export a mixdown or stems on the MPC first, then press ⟳.'}</div>`;
    else body = rows.map(it => `<label class="bp-row ${st.sel.has(it.path) ? 'on' : ''}" title="${esc(it.path)}">
        <input type="checkbox" data-bppath="${esc(it.path)}" ${st.sel.has(it.path) ? 'checked' : ''}>
        <span class="bp-nm"><b>${esc(display(it))}</b><small>${esc(where(it))}</small></span>
        <span class="bp-meta">${esc(fmtDate(it.mtime))}<small>${fmtSize(it.size)}</small></span></label>`).join('');
    $('#bpList').innerHTML = body;
    const all = rows.length && rows.every(r => st.sel.has(r.path));
    $('#bpAll').textContent = all ? 'Select none' : 'Select all'; $('#bpAll').hidden = !rows.length || st.loading;
    $('#bpDest').textContent = pref.dest || 'Choose a folder…'; $('#bpDest').classList.toggle('unset', !pref.dest);
    $('#bpDest').title = pref.dest || '';
    const chosen = st.items.filter(i => st.sel.has(i.path)), bytes = chosen.reduce((a, i) => a + i.size, 0);
    $('#bpGrab').disabled = !chosen.length;
    $('#bpGrab').textContent = chosen.length ? `⬇ Grab ${chosen.length} item${chosen.length > 1 ? 's' : ''} · ${fmtSize(bytes)}` : '⬇ Grab selected';
    $('#bpReveal').checked = pref.reveal !== false;
  }

  async function refresh() {
    if (!host()) { st.error = ''; render(); $('#bpHost').focus(); return; }
    if (!hasBridge) { st.error = 'MPC Bridge needs the Expansion Builder app'; render(); return; }
    st.loading = true; st.error = ''; render();
    try {
      const r = await bridge('mpcList', { host: host(), password: $('#mpcPw').value });
      st.items = r.items; st.drives = r.drives.sort((a, b) => (a === '/nvme' ? -1 : b === '/nvme' ? 1 : a.localeCompare(b)));
      st.loadedFor = host(); MpcConn.set('ok');
      const paths = new Set(st.items.map(i => i.path)); for (const p of [...st.sel]) if (!paths.has(p)) st.sel.delete(p);
    } catch (err) { st.error = err.message; st.items = []; st.loadedFor = ''; MpcConn.set('fail', err.message); }
    st.loading = false; render();
  }

  async function chooseDest() {
    const p = await bridge('pickFolder', { message: 'Choose where MPC Bridge saves things it grabs from the MPC', prompt: 'Save Here' }).catch(() => null);
    if (p) { pref.dest = p; savePref(); render(); }
    return p;
  }

  function bpLog(msg, cls = '') { const l = $('#bpLog'); l.hidden = false; l.innerHTML += `<div class="${cls}">${esc(msg)}</div>`; l.scrollTop = l.scrollHeight; }

  async function grab() {
    const chosen = st.items.filter(i => st.sel.has(i.path)).sort((a, b) => a.kind.localeCompare(b.kind) || b.mtime - a.mtime);
    if (!chosen.length) return;
    const dest = pref.dest || await chooseDest(); if (!dest) return;
    const existing = [];
    for (const it of chosen) if (await bridge('exists', { path: `${dest}/${it.path.split('/').pop()}` }).catch(() => null)) existing.push(display(it));
    if (existing.length && !confirm(`${existing.length === 1 ? `“${existing[0]}” is` : `${existing.length} of these are`} already in ${dest.split('/').pop()}. Replace with the copy from the MPC?`)) return;
    $('#bpLog').innerHTML = '';
    let ok = 0, last = null;
    for (const [n, it] of chosen.entries()) {
      busy(`Grabbing ${display(it)} (${fmtSize(it.size)})${chosen.length > 1 ? ` · ${n + 1} of ${chosen.length}` : ''}…`);
      try { last = await bridge('mpcGrab', { host: host(), password: $('#mpcPw').value, path: it.path, kind: it.kind, dest }); ok++; bpLog(`✓ ${display(it)}`, 'ok'); }
      catch (err) { bpLog(`✗ ${display(it)}: ${err.message}`, 'err'); }
    }
    busy(false);
    if (ok) {
      bpLog(`Saved to ${dest}`);
      toast(ok === chosen.length ? `Grabbed ${ok} item${ok > 1 ? 's' : ''} from the MPC` : `Grabbed ${ok} of ${chosen.length} — see the list for errors`, ok !== chosen.length);
      if (pref.reveal !== false) bridge('reveal', { path: ok === 1 && last ? last : dest }).catch(() => {});
    } else toast('Nothing was grabbed — see the list for the error', true);
  }

  function open(on = !st.open) {
    st.open = on; pop().hidden = !on; $('#bridgeBtn').classList.toggle('on', on);
    if (on) { render(); if (host() && st.loadedFor !== host() && !st.loading) refresh(); }
  }

  function init() {
    $('#bridgeBtn').addEventListener('click', e => { e.stopPropagation(); open(); });
    document.addEventListener('mousedown', e => { if (st.open && !e.target.closest('#bridgePop, #bridgeBtn, #busy') && !document.querySelector('dialog[open]')) open(false); });
    window.addEventListener('keydown', e => { if (st.open && e.key === 'Escape') open(false); });
    const el = pop();
    el.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-bptab]')) { st.tab = t.closest('[data-bptab]').dataset.bptab; render(); }
      else if (t.closest('#bpRefresh')) refresh();
      else if (t.closest('#bpClose')) open(false);
      else if (t.closest('#bpChoose') || t.closest('#bpDest')) chooseDest();
      else if (t.closest('#bpGrab')) grab();
      else if (t.closest('#bpAll')) { const rows = list(), all = rows.every(r => st.sel.has(r.path)); rows.forEach(r => all ? st.sel.delete(r.path) : st.sel.add(r.path)); render(); }
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.bppath) { t.checked ? st.sel.add(t.dataset.bppath) : st.sel.delete(t.dataset.bppath); render(); }
      else if (t.id === 'bpReveal') { pref.reveal = t.checked; savePref(); }
      else if (t.id === 'bpHost') { $('#mpcHost').value = t.value.trim(); $('#mpcHost').dispatchEvent(new Event('input')); st.loadedFor = ''; st.items = []; refresh(); }
    });
    $('#bpHost').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
  }

  init();
  return { open, refresh, _st: st };
})();

/* Header connection light: green "Connected to MPC" when an ssh login to the MPC address succeeds, otherwise
 * "No Wi-Fi MPC connection" with a Connect button. Re-checked every 30 s, when the window comes back to the front,
 * and whenever the address changes. Connect with no address opens MPC Bridge so it can be typed in. */
const MpcConn = (() => {
  let state = 'none', model = '', timer = 0, seq = 0, busyNow = false;
  const host = () => $('#mpcHost').value.trim();
  function set(s, detail = '') {
    state = s; const el = $('#mpcConn'); el.className = 'mpc-conn ' + s;
    const name = model ? model.replace(/^Akai\s+(Professional\s+)?/i, '') : 'MPC';
    $('#mpcConnText').textContent =
      s === 'ok' ? `Connected to ${name}` :
      s === 'checking' ? 'Connecting to MPC…' : 'No Wi-Fi MPC connection';
    el.title = s === 'ok' ? `Connected over Wi-Fi to ${host()}` : s === 'fail' ? `Could not reach the MPC at ${host()}${detail ? '\n' + detail : ''}` :
      s === 'none' ? 'Enter your MPC’s IP address to connect' : '';
  }
  async function check(manual = false) {
    if (!host() || !hasBridge) { set('none'); return false; }
    if (busyNow) return state === 'ok';
    busyNow = true; const my = ++seq;
    if (manual || state !== 'ok') set('checking');
    try {
      const r = await bridge('mpcPing', { host: host(), password: $('#mpcPw').value });
      if (my === seq) { model = r.model || ''; set('ok'); }
    } catch (err) { if (my === seq) set('fail', err.message); }
    busyNow = false;
    return state === 'ok';
  }
  function init() {
    $('#mpcConnBtn').addEventListener('click', async e => {
      e.stopPropagation();
      if (!host()) { MpcBridge.open(true); $('#bpHost').focus(); return; }
      if (!(await check(true))) { toast('Could not reach the MPC. Check it’s on the same Wi-Fi with developer mode on.', true); MpcBridge.open(true); }
    });
    let deb = 0;
    $('#mpcHost').addEventListener('input', () => { clearTimeout(deb); seq++; busyNow = false; model = ''; deb = setTimeout(() => check(true), 700); });
    window.addEventListener('focus', () => check());
    timer = setInterval(() => check(), 30000);
    check(true);
  }
  init();
  return { set, check, get state() { return state; } };
})();

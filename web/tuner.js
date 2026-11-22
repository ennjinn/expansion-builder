// Percussion tuner: the fundamental of a drum sample, e.g. "D1 -13 ct".
// Offline port of Looney Tuner's PercussionAnalyzer (Plugins/LooneyTuner/src/PercussionAnalyzer.h):
// drums glide (an 808 falls from ~150 Hz to its resting pitch in ~200 ms), so we report the
// energy-weighted pitch of the BODY after the glide settles, with an octave check, plus a confidence
// (hats and cymbals score low and are shown dimmed).
'use strict';

const Tuner = (() => {
  const N = 16384, LOG2N = 14;

  // ---- FFT (radix-2, in place) ----
  let tw = null, rev = null;
  function fft(re, im) {
    if (!tw) {
      tw = { re: new Float64Array(N / 2), im: new Float64Array(N / 2) };
      for (let k = 0; k < N / 2; k++) { tw.re[k] = Math.cos(-2 * Math.PI * k / N); tw.im[k] = Math.sin(-2 * Math.PI * k / N); }
      rev = new Uint32Array(N);
      for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < LOG2N; b++) r |= ((i >> b) & 1) << (LOG2N - 1 - b); rev[i] = r; }
    }
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let s = 1; s <= LOG2N; s++) {
      const m = 1 << s, half = m >> 1, step = N / m;
      for (let g = 0; g < N; g += m) for (let j = 0; j < half; j++) {
        const a = g + j, b = a + half, wr = tw.re[j * step], wi = tw.im[j * step];
        const tr = wr * re[b] - wi * im[b], ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }

  function lowpass(sr, hz, q) {
    const w = 2 * Math.PI * hz / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: -2 * c / a0, a2: (1 - al) / a0, z1: 0, z2: 0 };
  }
  const run = (f, x) => { const y = f.b0 * x + f.z1; f.z1 = f.b1 * x - f.a1 * y + f.z2; f.z2 = f.b2 * x - f.a2 * y; return y; };

  /** Where the pitch glide settles (cycle-by-cycle zero-crossing pitch, median-smoothed). */
  function bodyStart(x, len, fs) {
    const zc = [];
    for (let i = 1; i < len && zc.length < 256; i++) if (x[i - 1] < 0 && x[i] >= 0) zc.push((i - 1) + x[i - 1] / (x[i - 1] - x[i]));
    const nz = zc.length;
    if (nz < 6) return 0;
    const semis = new Float64Array(nz);
    for (let k = 1; k < nz; k++) semis[k] = 12 * Math.log2(fs / Math.max(1e-3, zc[k] - zc[k - 1]));
    const med3 = k => { const a = semis[k - 1], b = semis[k], c = semis[k + 1]; return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)); };
    const cap = Math.floor(0.4 * len), win = 0.1 * fs;
    for (let k = 2; k + 2 < nz; k++) {
      if (zc[k] > cap) return cap;
      let j = k + 1;
      while (j + 2 < nz && zc[j] - zc[k] < win) j++;
      if (zc[j] - zc[k] < win * 0.5) break;
      if (Math.abs(med3(j) - med3(k)) < 0.25) return Math.floor(zc[k]);
    }
    return Math.min(cap, Math.floor(zc[Math.floor(nz / 3)]));
  }

  /** Analyse a mono Float32Array at sample rate sr. Returns { hz, confidence } or null. */
  function analyzeMono(x, sr) {
    const n = x.length; if (n < sr * 0.02) return null;
    // Onset = first sample within 20 dB of the peak (samples normally start on the hit).
    let pk = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
    if (pk < 1e-4) return null;
    let on = 0; while (on < n && Math.abs(x[on]) < pk * 0.1) on++;
    on = Math.max(0, on - Math.round(0.002 * sr));
    // Capture end: 36 dB below the peak envelope (after 80 ms), max 2.4 s.
    const rel = Math.exp(-1 / (0.025 * sr));
    let env = 0, peak = 0, end = Math.min(n, on + Math.round(2.4 * sr));
    for (let i = on; i < end; i++) {
      const a = Math.abs(x[i]); env = a > env ? a : env * rel; if (env > peak) peak = env;
      if (i - on > 0.08 * sr && env < peak * 0.0158) { end = i; break; }
    }
    // LOW stream: anti-aliased and decimated to ~5.5 kHz (kicks, 808s, toms). HIGH: full rate (snares, perc, hats).
    const dec = Math.max(1, Math.round(sr / 5512.5)), fsL = sr / dec;
    const f1 = lowpass(sr, 1000, 0.5412), f2 = lowpass(sr, 1000, 1.3066);
    const low = new Float32Array(Math.ceil((end - on) / dec) + 1); let lowLen = 0;
    for (let i = on, p = 0; i < end; i++) { const y = run(f2, run(f1, x[i])); if (++p >= dec) { p = 0; low[lowLen++] = y; } }
    const highLen = Math.min(end - on, N), high = x.subarray(on, on + highLen);
    let eLow = 0, eAll = 0;
    for (let i = 0; i < lowLen; i++) eLow += low[i] * low[i] * dec;
    const cmp = Math.min(highLen, lowLen * dec);
    for (let i = 0; i < cmp; i++) eAll += high[i] * high[i];
    const useLow = (eAll > 0 ? eLow / eAll : 1) > 0.35;
    const src = useLow ? low : high, len = useLow ? lowLen : highLen, fs = useLow ? fsL : sr;
    let start = useLow ? bodyStart(src, len, fs) : Math.floor(0.005 * fs);
    start = Math.min(start, Math.max(0, len - Math.floor(0.03 * fs)));
    // Window: 10 ms fade-in at the body, the drum's own decay weights the rest, short fade-out.
    const fillN = Math.min(len - start, N), fadeIn = Math.max(1, Math.min(Math.floor(0.01 * fs), Math.floor(fillN / 4))), fadeOut = Math.max(1, Math.floor(fillN / 10));
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < fillN; i++) {
      let v = src[start + i];
      if (i < fadeIn) v *= 0.5 - 0.5 * Math.cos(Math.PI * i / fadeIn);
      if (i >= fillN - fadeOut) v *= 0.5 - 0.5 * Math.cos(Math.PI * (fillN - 1 - i) / fadeOut);
      re[i] = v;
    }
    fft(re, im);
    const mag = new Float64Array(N / 2); let total = 0;
    for (let b = 1; b < N / 2; b++) { mag[b] = Math.hypot(re[b], im[b]); total += mag[b] * mag[b]; }
    const binHz = fs / N, lo = useLow ? 25 : 120, hi = useLow ? 600 : Math.min(12000, fs / 2 - 100);
    const b0 = Math.max(2, Math.floor(lo / binHz)), b1 = Math.min(N / 2 - 2, Math.floor(hi / binHz));
    let best = b0;
    for (let b = b0; b <= b1; b++) if (mag[b] > mag[best]) best = b;
    if (mag[best] <= 1e-9) return null;
    for (let pass = 0; pass < 3; pass++) { // octave check: a clear peak near f/2 means we locked to a harmonic
      const c = best >> 1; if (c < b0) break;
      let sub = c; for (let b = Math.max(b0, c - 3); b <= c + 3; b++) if (mag[b] > mag[sub]) sub = b;
      if (mag[sub] >= mag[sub - 1] && mag[sub] >= mag[sub + 1] && mag[sub] > 0.35 * mag[best]) best = sub; else break;
    }
    const l = Math.log(mag[best - 1] + 1e-20), c = Math.log(mag[best] + 1e-20), r = Math.log(mag[best + 1] + 1e-20);
    const den = l - 2 * c + r, delta = Math.abs(den) > 1e-12 ? Math.max(-0.5, Math.min(0.5, 0.5 * (l - r) / den)) : 0;
    let near = 0; for (let b = best - 3; b <= best + 3; b++) near += mag[b] * mag[b];
    return { hz: (best + delta) * binHz, confidence: total > 0 ? Math.min(1, near / total * 1.6) : 0 };
  }

  const cache = new WeakMap(); // AudioBuffer -> result
  function analyze(buffer) {
    if (cache.has(buffer)) return cache.get(buffer);
    let x = buffer.getChannelData(0);
    if (buffer.numberOfChannels > 1) { const y = buffer.getChannelData(1), m = new Float32Array(x.length); for (let i = 0; i < x.length; i++) m[i] = 0.5 * (x[i] + y[i]); x = m; }
    let res = null; try { res = analyzeMono(x, buffer.sampleRate); } catch (e) { console.warn('tuner', e); }
    cache.set(buffer, res);
    return res;
  }

  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  function toNote(hz) {
    const m = 69 + 12 * Math.log2(hz / 440), midi = Math.round(m);
    return { midi, name: NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents: Math.round((m - midi) * 100) };
  }

  /** Show the fundamental of a played sample in the header, e.g. "D1 −13 ct". tune (semitones) / fine (cents) shift it. */
  function show(buffer, opts = {}) {
    const box = document.getElementById('tuner'); if (!box || !buffer) return;
    const res = analyze(buffer);
    if (!res) { box.textContent = '—'; box.classList.add('dim'); box.title = opts.name || ''; return; }
    const hz = res.hz * Math.pow(2, ((opts.tune || 0) * 100 + (opts.fine || 0)) / 1200), n = toNote(hz);
    box.textContent = `${n.name}${n.octave}  ${n.cents > 0 ? '+' : n.cents < 0 ? '−' : '±'}${Math.abs(n.cents)} ct`;
    box.classList.toggle('dim', res.confidence < 0.18); // hats, cymbals, noise: no clear pitch
    box.title = `${opts.name || ''}  ·  ${hz.toFixed(2)} Hz${res.confidence < 0.18 ? '  ·  no clear pitch' : ''}`;
  }

  return { analyze, analyzeMono, toNote, show };
})();
if (typeof module !== 'undefined') module.exports = Tuner;

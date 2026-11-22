// Audio engine: sample decoding, WAV parsing/encoding, pad playback with
// velocity layers, MPCe quadrant/morph playback and articulation simulation
// (driven by the MPC's own .articulation hit tables in articulations.js).
'use strict';

const Audio = (() => {
  let ctx = null;
  const master = () => { ensure(); return ctx._master; };
  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
      const g = ctx.createGain(); g.gain.value = 0.85;
      g.connect(comp); comp.connect(ctx.destination);
      ctx._master = g;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---------- WAV helpers ----------
  function wavInfo(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength < 12 || dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null;
    let p = 12, fmt = null, dataLen = 0;
    while (p + 8 <= buf.byteLength) {
      const id = dv.getUint32(p, false), len = dv.getUint32(p + 4, true);
      if (id === 0x666d7420) { // 'fmt '
        fmt = { format: dv.getUint16(p + 8, true), channels: dv.getUint16(p + 10, true), rate: dv.getUint32(p + 12, true),
                blockAlign: dv.getUint16(p + 20, true), bits: dv.getUint16(p + 22, true) };
      } else if (id === 0x64617461) { dataLen = len; if (fmt) break; }
      p += 8 + len + (len & 1);
    }
    if (!fmt || !fmt.blockAlign) return null;
    const known = [1, 3, 0xfffe].includes(fmt.format);
    return { ...fmt, frames: Math.floor(Math.min(dataLen, buf.byteLength) / fmt.blockAlign), mpcSafe: known };
  }

  function encodeWav(audioBuffer, bits = 24) {
    const ch = Math.min(2, audioBuffer.numberOfChannels), n = audioBuffer.length, rate = audioBuffer.sampleRate;
    const bps = bits / 8, block = ch * bps, dataLen = n * block;
    const out = new ArrayBuffer(44 + dataLen), dv = new DataView(out);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * block, true); dv.setUint16(32, block, true); dv.setUint16(34, bits, true);
    w(36, 'data'); dv.setUint32(40, dataLen, true);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(audioBuffer.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      if (bits === 16) { dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
      else { const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff); dv.setUint8(o, v & 255); dv.setUint8(o + 1, (v >> 8) & 255); dv.setUint8(o + 2, (v >> 16) & 255); o += 3; }
    }
    return out;
  }

  function peaks(buffer, n = 160) {
    const d0 = buffer.getChannelData(0), d1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : d0;
    const out = new Float32Array(n), step = Math.max(1, Math.floor(buffer.length / n));
    let max = 0;
    for (let i = 0; i < n; i++) {
      let m = 0; const s = i * step, e = Math.min(buffer.length, s + step);
      for (let j = s; j < e; j += 4) { const v = Math.max(Math.abs(d0[j]), Math.abs(d1[j])); if (v > m) m = v; }
      out[i] = m; if (m > max) max = m;
    }
    if (max > 0) for (let i = 0; i < n; i++) out[i] /= max;
    return out;
  }

  async function decode(bytes) {
    ensure();
    return await ctx.decodeAudioData(bytes.slice(0));
  }
  async function decodeAt(bytes, rate) {
    const oc = new OfflineAudioContext(2, 1, rate);
    return await oc.decodeAudioData(bytes.slice(0));
  }

  const reversedCache = new WeakMap();
  function reversed(buf) {
    let r = reversedCache.get(buf);
    if (!r) {
      r = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
      for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = r.getChannelData(c); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; }
      reversedCache.set(buf, r);
    }
    return r;
  }

  // ---------- voices ----------
  const voicesByPad = new Map();  // padKey -> Set(voice)
  const patternsByPad = new Map(); // padKey -> Set(articulation handle) still scheduling hits
  /** Cut every voice of a pad at time t (also future-scheduled ones) and stop its articulation patterns. */
  function killPad(key, t, except = null) {
    if (!ctx) return;
    t = Math.max(ctx.currentTime, t ?? ctx.currentTime);
    const set = voicesByPad.get(key);
    if (set) for (const v of [...set]) { if (except && except.owns(v)) continue; stopVoice(v, t, 0.012); set.delete(v); }
    const ps = patternsByPad.get(key);
    if (ps) for (const h of [...ps]) if (h !== except) h.cut(t);
  }
  function stopVoice(v, t = ctx.currentTime, fade = 0.03) {
    try { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + fade); v.src.stop(t + fade + 0.01); } catch (e) {}
  }

  // Every running articulation scheduler, so a preview can cut all of them at once.
  const activeTimers = new Set();
  /** Cut everything that is sounding or scheduled (used before every audition). */
  function stopAll() {
    if (!ctx) return;
    for (const t of activeTimers) clearInterval(t);
    activeTimers.clear();
    const now = ctx.currentTime;
    for (const set of voicesByPad.values()) { for (const v of set) stopVoice(v, now, 0.008); set.clear(); }
    patternsByPad.clear();
  }

  const dbToGain = db => Math.pow(10, db / 20);

  /** Start one sample voice. layer = {buffer, tune, fine, start(ms), level(dB), pan(-50..50), reverse} */
  function voice(layer, { when = 0, velocity = 100, gain = 1, detune = 0, panOffset = 0, padKey = null, out = null, octx = null } = {}) {
    const c = octx || ensure();
    if (!layer || !layer.buffer) return null;
    const buf = layer.reverse ? reversed(layer.buffer) : layer.buffer;
    const src = c.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = Math.pow(2, ((layer.tune || 0) * 100 + (layer.fine || 0) + detune) / 1200);
    const g = c.createGain();
    const vel = Math.max(1, Math.min(127, velocity)) / 127;
    g.gain.value = dbToGain(layer.level || 0) * gain * (0.15 + 0.85 * vel * vel);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(g);
    if (p) { p.pan.value = Math.max(-1, Math.min(1, ((layer.pan || 0) + panOffset) / 50)); g.connect(p); p.connect(out || (octx ? octx.destination : master())); }
    else g.connect(out || master());
    const t = Math.max(c.currentTime, when || c.currentTime);
    const offs = Math.min(buf.duration - 0.001, Math.max(0, (layer.start || 0) / 1000));
    src.start(t, offs);
    const v = { src, g, padKey };
    if (padKey != null && !octx) {
      let set = voicesByPad.get(padKey); if (!set) voicesByPad.set(padKey, set = new Set());
      set.add(v); src.onended = () => set.delete(v);
    }
    return v;
  }

  // ---------- articulations ----------
  const ART = () => window.ARTICULATIONS || [];
  function artById(id) { return id > 0 ? ART()[id - 1] : null; }

  /**
   * Plays a "hit" (a list of {layer, gain} to sound together) either plainly or through an articulation.
   * Returns a handle with release() for held/looped patterns.
   */
  function trigger(parts, opts) {
    const { art, velocity = 100, bpm = 120, mono = false, padKey = 'x', oneShot = true, when = null } = opts;
    ensure();
    const now = Math.max(ctx.currentTime + 0.005, when || 0);
    const def = art && art.type ? artById(art.type) : null;
    const own = new Set(); // this hit's voices, so a release only ends what this hit started
    let cutAt = null, timer = null;
    const handle = {
      owns: v => own.has(v),
      cut(t) { cutAt = cutAt == null ? t : Math.min(cutAt, t); for (const v of own) stopVoice(v, Math.max(ctx.currentTime, t), 0.012); own.clear(); finish(); },
      release() {},
    };
    const finish = () => { if (timer) { clearInterval(timer); activeTimers.delete(timer); timer = null; } const ps = patternsByPad.get(padKey); if (ps) ps.delete(handle); };
    const fire = (t, vel, detune, panOff, gainScale) => {
      if (mono) killPad(padKey, t, handle);
      for (const part of parts) {
        const v = voice(part.layer, { when: t, velocity: vel, gain: part.gain * gainScale, detune, panOffset: panOff, padKey });
        if (v) { own.add(v); const prev = v.src.onended; v.src.onended = () => { if (prev) prev(); own.delete(v); }; }
      }
    };
    if (!def) {
      fire(now, velocity, 0, 0, 1);
      // Note On: releasing ends this hit's voices (at time `at` if given, for sequenced notes).
      handle.release = at => { if (oneShot) return; const t = Math.max(ctx.currentTime, at ?? ctx.currentTime); for (const v of own) stopVoice(v, t, 0.03); };
      return handle;
    }
    // Speed: x1/2, x1, x2 switch and a fine Speed knob (0.5 = as authored).
    const scaleMul = [0.5, 1, 2][art.scale ?? 1];
    const knobMul = Math.pow(2, ((art.speed ?? 0.5) - 0.5) * 2);
    const tempoMul = def.synced ? (bpm / (def.baseTempo || 120)) : 1;
    const rate = scaleMul * knobMul * tempoMul;            // >1 = faster
    const dyn = (art.dynamics ?? 0.5) * 2;                 // 1 = as authored
    const stereo = art.stereo ?? 1;
    const hits = def.hits;
    let t = now, i = 0, held = true, releasedAt = null, count = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const fadeMs = def.fadeoutMs || 1000;
    const schedule = () => {
      const horizon = ctx.currentTime + 0.12;
      while (t < horizon) {
        if (i >= hits.length) {
          if (!def.looped) { finish(); return; }
          i = Math.min(def.loopIndex || 0, hits.length - 1);
          if (i === 0) i = 1 % hits.length; // first hit carries no delay; avoid double strike
        }
        const h = hits[i];
        if (count > 0 || i > 0) t += rnd(h[0], h[1]) / 1000 / rate;
        if (cutAt != null && t >= cutAt) { finish(); return; }
        let fadeGain = 1;
        if (releasedAt != null) {
          const since = (t - releasedAt) * 1000;
          if (since >= fadeMs * 0.5) { finish(); return; }
          fadeGain = Math.max(0, 1 - since / (fadeMs * 0.5));
        }
        const lvl = Math.max(0, 1 + ((h[4] * h[6]) - 1) * dyn);
        const vel = Math.max(1, Math.min(127, velocity * (1 + (h[6] - 1) * dyn)));
        fire(t, vel, rnd(h[2], h[3]), h[5] * stereo, Math.min(2, lvl) * fadeGain);
        i++; count++;
        if (count > 600 || (t - now) > 12) { finish(); return; }
      }
    };
    let ps = patternsByPad.get(padKey); if (!ps) patternsByPad.set(padKey, ps = new Set());
    ps.add(handle);
    timer = setInterval(schedule, 25);
    activeTimers.add(timer);
    schedule();
    handle.release = at => {
      if (!held) return; held = false;
      if (def.looped) releasedAt = Math.max(ctx.currentTime, at ?? ctx.currentTime, now + 0.01);
    };
    return handle;
  }

  // ---------- offline render (kit preview .wav) ----------
  async function renderPreview(events, seconds) {
    const rate = 44100;
    const oc = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    const bus = oc.createGain(); bus.gain.value = 0.8; bus.connect(oc.destination);
    for (const ev of events) for (const part of ev.parts) voice(part.layer, { when: ev.t, velocity: ev.velocity, gain: part.gain, octx: oc, out: bus });
    const buf = await oc.startRendering();
    // normalise gently to -1 dBFS
    let m = 0; for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; } }
    if (m > 0) { const k = 0.89 / m; for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
    return encodeWav(buf, 16);
  }

  return { ensure, stopAll, wavInfo, encodeWav, peaks, decode, decodeAt, trigger, voice, killPad, renderPreview, artById, get ctx() { return ensure(); } };
})();

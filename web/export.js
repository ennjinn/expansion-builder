// Builds MPC 3.x drum tracks (.xtd) and expansion folders.
//
// Format notes (reverse-engineered 2026-11-18 from the factory "MPCe Expressive Kits"
// expansion on an MPC Live III running 3.10.1):
//  * .xtd = gzip( "ACVS\n3.6.0.134\nSerialisableTrackData\njson\nLinux\n" + JSON ).
//  * template.json.gz is Akai's own "64 Pad Layout" MPCe template; we clone it and fill pads in.
//  * Pad i (A01 = 0) -> program.drum.instruments[i]; samples live in "<Kit>_[TrackData]/".
//  * MPCe quadrants: Layer Play = Crossfade (zonePlayTime 3), layers 1-4 = Bottom Left,
//    Bottom Right, Top Left, Top Right; mod links Pad X(29) -> Layer Crossfade X(153) and
//    Pad Y(30) -> Layer Crossfade Y(154). Snap uses Akai's quantise shaper (10, min 1/max 0),
//    Morph uses a linear link (shaper 0, min 0/max 1), exactly as in the factory templates.
//  * Per-quadrant articulations: articulations.value0..3 (same quadrant order), with
//    articulationUseXY = true. articulationType = number of the MPC .articulation file (0 = off).
//  * Velocity layer play = zonePlayTime 1. One Shot = triggerMode 0 + ampEnvelope.OneShot,
//    Note On = triggerMode 2. Layer volume law 1 = linear gain.
'use strict';

const Exporter = (() => {
  const HEADER = 'ACVS\n3.6.0.134\nSerialisableTrackData\njson\nLinux\n';
  let template = null;

  async function loadTemplate() {
    if (template) return template;
    const res = await fetch('template.json.gz');
    const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    template = JSON.parse(text);
    return template;
  }

  async function gzip(str) {
    const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }

  const safeName = (s, fallback = 'Untitled') => {
    const t = String(s || '').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    return (t || fallback).slice(0, 80);
  };
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'user';
  const xml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hexToInt = h => parseInt(String(h || '#ff3b30').replace('#', ''), 16) || 0;

  function identifier(exp) {
    return exp.identifier && exp.identifier.trim() ? exp.identifier.trim() : `com.${slug(exp.author)}.${slug(exp.name)}`;
  }

  function expansionXml(exp, imgFile) {
    const id = identifier(exp);
    return `<?xml version="1.0" encoding="UTF-8"?>

<expansion version="1.0">
    <identifier>${xml(id)}</identifier>
    <title>${xml(exp.name)}</title>
    <manufacturer>${xml(exp.author || 'Unknown')}</manufacturer>
    <version>${xml(normVersion(exp.version))}</version>
    <type>drum</type>
    <description>${xml(exp.description || '')}</description>
    <img>${xml(imgFile)}</img>
    <directory>${xml(id)}</directory>
    <separator>-</separator>
</expansion>
`;
  }
  function normVersion(v) {
    const p = String(v || '1.0.0').split('.').map(x => parseInt(x, 10) || 0);
    while (p.length < 4) p.push(0);
    return p.slice(0, 4).join('.');
  }

  // JSON writer that keeps the MPC's number types: fields that are floats in Akai's files
  // (floatkeys.js, collected from the factory kits) are written as 1.0 rather than 1, and the
  // int64 clip length placeholder is restored verbatim.
  const FLOATS = new Set((typeof window !== 'undefined' ? window : globalThis).FLOAT_KEYS || []);
  const isVal = k => /^value\d+$/.test(k || '');
  function serialise(root) {
    const out = [];
    const num = (v, parent, key) => {
      if (!Number.isFinite(v)) return '0';
      const sig = isVal(key) ? parent + '/' + key : key;
      return FLOATS.has(sig) && Number.isInteger(v) ? v.toFixed(1) : String(v);
    };
    const w = (v, parent, key, ind) => {
      if (v === null || v === undefined) return 'null';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'number') return num(v, parent, key);
      if (typeof v === 'string') return v === '__INT64MAX__' ? '9223372036854775807' : JSON.stringify(v);
      const pad = '    '.repeat(ind + 1), end = '    '.repeat(ind);
      if (Array.isArray(v)) {
        if (!v.length) return '[]';
        return '[\n' + v.map(x => pad + w(x, parent, key, ind + 1)).join(',\n') + '\n' + end + ']';
      }
      const ks = Object.keys(v); if (!ks.length) return '{}';
      return '{\n' + ks.map(k => pad + JSON.stringify(k) + ': ' + w(v[k], key || '', k, ind + 1)).join(',\n') + '\n' + end + '}';
    };
    out.push(w(root, '', '', 0));
    return out.join('');
  }

  /** Pad -> list of {layerIndex(0-7), layer} for export. */
  function padLayers(pad) {
    const out = [];
    if (pad.mpce) {
      pad.quads.forEach((q, qi) => {
        q.layers.slice(0, 2).forEach((L, li) => { if (L.sample) out.push({ idx: qi + li * 4, layer: L }); });
      });
    } else {
      pad.layers.slice(0, 8).forEach((L, li) => { if (L.sample) out.push({ idx: li, layer: L }); });
    }
    return out;
  }
  function padUsed(pad) { return !!pad && padLayers(pad).length > 0; }

  function blankLink(tpl) {
    const l = JSON.parse(JSON.stringify(tpl));
    Object.assign(l, { 'link.source': 0, 'link.target': 0, 'link.min': 0, 'link.max': 1, 'link.amount': 1, 'link.viaSource': 0,
      'link.viaAmount': 1, 'link.shaper': 0, 'link.shaperAmount': 1, 'link.bipolar': false });
    return l;
  }

  function setArt(slot, a) {
    slot.articulationType = a && a.type ? a.type | 0 : 0;
    slot.articulationSpeed = a ? +(a.speed ?? 0.5) : 0.5;
    slot.articulationDynamics = a ? +(a.dynamics ?? 0.5) : 0.5;
    slot.articulationStereo = a ? +(a.stereo ?? 1) : 1;
    slot.articulationSpeedScaling = a ? (a.scale ?? 1) | 0 : 1;
  }

  /**
   * Build the .xtd for one kit.
   * files: Map(sampleId -> {file, name, frames}) for this kit's TrackData folder.
   */
  async function buildTrack(kit, files, opts = {}) {
    const T = await loadTemplate();
    const doc = structuredClone(T);
    const d = doc.data, prog = d.program, drum = prog.drum;
    const kitName = safeName(kit.name, 'Kit');
    const oldNames = new Set([d.name, prog.name, 'Trap-Kit-MPCe Default Fm']);
    const renameDeep = o => {
      if (Array.isArray(o)) o.forEach((v, i) => { if (typeof v === 'string' && oldNames.has(v)) o[i] = kitName; else if (v && typeof v === 'object') renameDeep(v); });
      else if (o && typeof o === 'object') for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string' && oldNames.has(v) && (k === 'name' || k === 'track')) o[k] = kitName; else if (v && typeof v === 'object') renameDeep(v); }
    };
    renameDeep(d);
    d.name = kitName; prog.name = kitName;
    d.colour = hexToInt(kit.color || '#ff3b30');

    // samples table
    const seen = new Set();
    d.samples = [];
    for (const [, f] of files) {
      if (seen.has(f.file)) continue; seen.add(f.file);
      d.samples.push({ version: 1, name: f.name, path: f.file, loadImpl: 0, metadata: { tempo: 120.0, rootNote: 60, tune: 0.0, key: 'C Major' } });
    }

    const linkTpl = T.data.program.drum.instruments[20].modLinks[0];

    for (let i = 0; i < 128; i++) {
      const pad = kit.pads[i];
      const ins = drum.instruments[i];
      prog.programPads.pads['value' + i] = pad && padUsed(pad) ? hexToInt(pad.color || (pad.mpce ? '#a259ff' : '#ff3b30')) : 0;
      // reset layers + mod links
      const emptyLayer = T.data.program.drum.instruments[i].layersv[0];
      ins.layersv = Array.from({ length: 8 }, () => JSON.parse(JSON.stringify(emptyLayer)));
      ins.modLinks = ins.modLinks.map(() => blankLink(linkTpl));
      for (let q = 0; q < 4; q++) setArt(ins.articulations['value' + q], null);
      ins.articulationUseXY = false;
      ins.zonePlayTime = 1;
      if (!pad || !padUsed(pad)) continue;

      for (const { idx, layer } of padLayers(pad)) {
        const f = files.get(layer.sample); if (!f) continue;
        const L = ins.layersv[idx];
        const tune = layer.tune | 0, fine = Math.max(-99, Math.min(99, layer.fine | 0));
        const g = Math.min(1, Math.pow(10, (layer.level || 0) / 20));
        const startFr = Math.max(0, Math.min(f.frames - 2, Math.round((layer.start || 0) / 1000 * f.rate)));
        Object.assign(L, {
          sampleName: f.name, sampleFile: f.file, active: true, mute: false,
          velocityStart: layer.vlo | 0, velocityEnd: layer.vhi | 0,
          coarseTune: tune, fineTune: fine, pitch: tune + fine / 100,
          pan: Math.max(0, Math.min(1, 0.5 + (layer.pan || 0) / 100)),
          volume: { gainCoefficient: g, controlValue: g, law: 1 },
          direction: layer.reverse ? 1 : 0,
          sampleStart: startFr, sampleEnd: startFr ? f.frames - 1 : 0,
        });
        L.sliceInfo = Object.assign({}, L.sliceInfo, { Start: startFr, End: Math.max(0, f.frames - 1) });
      }

      // trigger / voice
      ins.triggerMode = pad.oneShot ? 0 : 2;
      ins.synthSection.ampEnvelope.OneShot.value0 = !!pad.oneShot;
      ins.monophonic = !!pad.mono;
      ins.polyphony = pad.mono ? 1 : 0;
      ins.whichMuteGroup = pad.muteGroup | 0;

      const links = [];
      if (pad.mpce) {
        ins.zonePlayTime = 3; ins.layerCrossfade = 0;
        if (pad.xy === 'morph') {
          links.push({ s: 29, t: 153, min: 0, max: 1, amt: 1, shaper: 0 }, { s: 30, t: 154, min: 0, max: 1, amt: 1, shaper: 0 });
        } else {
          links.push({ s: 29, t: 153, min: 1, max: 0, amt: 1, shaper: 10 }, { s: 30, t: 154, min: 1, max: 0, amt: 1, shaper: 10 });
        }
        const anyArt = pad.quads.some(q => q.art && q.art.type);
        ins.articulationUseXY = anyArt;
        pad.quads.forEach((q, qi) => setArt(ins.articulations['value' + qi], q.art));
      } else {
        setArt(ins.articulations.value0, pad.art);
      }
      // Pad expression (from Akai's "X cutoff Y reso LP filter" template)
      const ex = pad.expr || {};
      if (ex.xCutoff > 0) {
        links.push({ s: 29, t: 1, min: 1, max: 0, amt: -Math.min(1, ex.xCutoff), shaper: 0 });
        ins.synthSection.filterData.value0.filterType = 3;
      }
      if (ex.yReso > 0) {
        links.push({ s: 30, t: 3, min: 0, max: 1, amt: Math.min(1, ex.yReso), shaper: 0 });
        if (!(ex.xCutoff > 0)) ins.synthSection.filterData.value0.filterType = 3;
      }
      links.slice(0, ins.modLinks.length).forEach((k, n) => Object.assign(ins.modLinks[n], {
        'link.source': k.s, 'link.target': k.t, 'link.min': k.min, 'link.max': k.max, 'link.amount': k.amt, 'link.shaper': k.shaper, 'link.bipolar': false,
      }));
    }

    return await gzip(HEADER + serialise(doc));
  }

  return { loadTemplate, buildTrack, expansionXml, identifier, safeName, padLayers, padUsed, slug, normVersion };
})();

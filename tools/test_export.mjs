// Headless check of the .xtd exporter: builds a kit with one MPCe pad and one
// standard velocity-layered pad, writes it to argv[2].
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../web');
globalThis.fetch = async (u) => new Response(fs.readFileSync(path.join(web, u)));
globalThis.window = globalThis;
const ctx = vm.createContext(globalThis);
vm.runInContext(fs.readFileSync(path.join(web, "floatkeys.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(web, "export.js"), 'utf8') + ';globalThis.Exporter=Exporter;', ctx);
const L = (sample, o = {}) => ({ sample, vlo: 0, vhi: 127, tune: 0, fine: 0, start: 0, level: 0, pan: 0, reverse: false, ...o });
const art = (type = 0, o = {}) => ({ type, scale: 1, speed: 0.5, dynamics: 0.5, stereo: 1, ...o });
const pads = Array(128).fill(null);
pads[0] = { name: '', mpce: true, oneShot: true, mono: true, muteGroup: 0, xy: 'snap', layers: [L(null)], art: art(),
  quads: [{ layers: [L('k')], art: art() }, { layers: [L('s', { tune: -2, fine: 30, level: -6, pan: -20 })], art: art(2) },
          { layers: [L('h', { reverse: true, start: 10 })], art: art(137, { scale: 2 }) }, { layers: [L('k')], art: art(22) }],
  expr: { xCutoff: 0.65, yReso: 0.45 } };
pads[1] = { name: 'Snare', mpce: false, oneShot: false, mono: false, muteGroup: 2, xy: 'snap',
  layers: [L('s', { vlo: 0, vhi: 63 }), L('h', { vlo: 64, vhi: 127 })], art: art(55), quads: [], expr: {} };
const files = new Map([['k', { file: 'Kick.wav', name: 'Kick', frames: 44100, rate: 44100 }], ['s', { file: 'Snare.wav', name: 'Snare', frames: 22050, rate: 44100 }], ['h', { file: 'Hat.wav', name: 'Hat', frames: 8000, rate: 44100 }]]);
const out = await Exporter.buildTrack({ name: 'Test Kit', color: '#ff3b30', pads }, files);
fs.writeFileSync(process.argv[2], Buffer.from(out));
console.log('wrote', out.byteLength, 'bytes');
console.log(Exporter.expansionXml({ name: 'Trap Drums Vol. 1', author: 'Hakai', description: 'Test & stuff', version: '1.2' }, 'x.jpg'));

// Sample browser categoriser: guesses a category from a sample's file name and folders.
// The file name wins; folders are checked nearest first. "Specific" rules (kick, open hat…)
// beat "generic" ones (cymbals, drums, kit…) anywhere in the path, so
// "Cymbals/Open HH/Cymbals OH 004.wav" is an open hat, not a cymbal.
'use strict';

const Categorize = (() => {
  const GROUPS = [
    ['Drums', ['Kicks', '808s & Sub', 'Snares', 'Claps', 'Rims & Sticks', 'Hi-Hats Closed', 'Hi-Hats Open', 'Hi-Hats', 'Cymbals', 'Toms', 'Shakers & Tambourines', 'Percussion', 'Snaps', 'Other Drums']],
    ['Loops', ['Drum Loops', 'Top Loops', 'Percussion Loops', 'Breaks', 'Fills', 'Bass Loops', 'Melodic Loops', 'Vocal Loops', 'FX Loops']],
    ['Instruments', ['Bass', 'Synths & Leads', 'Pads & Drones', 'Stabs & Chords', 'Keys & Piano', 'Mallets & Bells', 'Guitar & Plucked', 'Strings & Orchestral', 'Brass & Wind']],
    ['Other', ['Vocals', 'FX', 'Foley & Textures', 'Uncategorized']],
  ];
  const r = s => new RegExp('(?:^| )(?:' + s + ')(?= |$)');

  // Order matters inside one name: first match wins.
  const SPECIFIC = [
    ['Claps', r('claps?|clp|hand ?claps?|clapz')],
    ['Rims & Sticks', r('rim ?shots?|rims?|side ?sticks?|cross ?sticks?|stick ?hits?|sidestick|rimshot|snare ?rim')],
    ['Kicks', r('kicks?|kik|kck|kix|bd|bdrum|bass ?drums?|bassdrums?|kickdrums?')],
    ['Snares', r('snares?|snr|sd|piccolo')],
    ['Toms', r('toms?|tomtoms?|floor ?toms?|ht|mt|lt|hi ?tom|lo ?tom')],
    ['Cymbals', r('crash(es)?|rides?|splash(es)?|chinas?|sizzles?|cymbal ?swells?|gongs?|crash ?cymbals?|ride ?cymbals?')],
    ['Hi-Hats Open', r('open ?(hi ?)?hats?|open ?hh|opn ?hh|oh|ohh|ophh|hh ?open|hat ?open|hi ?hat ?open|hihat ?open')],
    ['Hi-Hats Closed', r('closed? ?(hi ?)?hats?|closed? ?hh|ch|chh|clhh|cl ?hh|hh ?closed?|hat ?closed?|hi ?hat ?closed?|hihat ?closed?')],
    ['Hi-Hats', r('hi ?hats?|hihats?|hh|hats?|pedal ?hh|phh')],
    ['Snaps', r('finger ?snaps?|snaps?')],
    ['Shakers & Tambourines', r('shakers?|shk|shaker ?tamb|tambs?|tambo|tambourines?|tamborines?|cabasas?|maracas?|egg ?shakers?')],
    ['Percussion', r('percs?|percussions?|congas?|bongos?|cow ?bells?|cwbel|cwbl|cbell|mallet ?drums?|claves?|blocks?|wood ?blocks?|triangles?|timbales?|guiros?|agogos?|tablas?|djembes?|darbukas?|doumbek|dhol|dholak|cajon|taiko|udu|surdo|timpani|timp|cuica|bata|frame ?drum|riq|daf|duff|bendir|hand ?drums?|metallic|metal ?hits?|anvil|chimes?|spoons|kanjira|mridangam|ghatam|zil|tom ?tom|tribal')],
    ['808s & Sub', r('808 ?(bass|sub|boom|s)|808s|sub ?bass|subs?|sub ?drops?|boom')],
    ['Vocals', r('vox|vocals?|voices?|chants?|shouts?|adlibs?|acapellas?|phrases?|words?|choirs?|beatbox|spoken|raps?|vocal ?chops?|hums?|breaths?')],
    ['Bass', r('\\w*bass(es|line|lines)?|reese|wobbles?|sublow|303|acid')],
    ['FX', r('fx|sfx|effects?|risers?|uplifters?|up ?lifters?|downlifters?|down ?lifters?|sweeps?|impacts?|whoosh(es)?|swoosh(es)?|transitions?|zaps?|lasers?|glitch(es)?|reversed?|rev|sirens?|build ?ups?|buildups?|explosions?|magic|noise ?sweeps?|scratch(es)?|tape ?stops?|stutters?|downers?|sci ?fi|scifi|alarms?')],
    ['Foley & Textures', r('vinyl|crackles?|foley|ambiences?|ambient|atmos|atmospheres?|textures?|field|room ?tone|rain|hiss|nature|birds?|water|wind ?noise|noise')],
    ['Keys & Piano', r('pianos?|keys|rhodes|wurli(tzer)?|organs?|ep|fep|e ?piano|harpsichords?|clav|clavinet|celeste|celesta|mellotron')],
    ['Mallets & Bells', r('mallets?|marimbas?|vibes|vibraphones?|xylophones?|glock(enspiel)?s?|bells?|kalimbas?|music ?box|steel ?drums?|steel ?pans?|handpan|clongs?')],
    ['Guitar & Plucked', r('guitars?|gtr|gtrs|strums?|banjos?|sitars?|ouds?|bouzouki|ukuleles?|uke|harps?|kotos?|lutes?|mandolins?|saz')],
    ['Strings & Orchestral', r('strings?|violins?|violas?|cellos?|contrabass|pizz(icato)?|stacc(ato)?|orchestra|ensembles?|sus ?at|spiccato|tremolo')],
    ['Brass & Wind', r('brass|horns?|trumpets?|trombones?|tubas?|sax(ophone)?s?|altosax|flutes?|clarinets?|oboes?|whistles?|wind|pan ?flutes?|bansuri|neys?|duduks?|bagpipes?|recorders?|harmonicas?')],
    ['Stabs & Chords', r('stabs?|chords?|chord ?stabs?|hits? ?orch|orch ?hits?')],
    ['Pads & Drones', r('pads?|drones?|swells?|soundscapes?')],
    ['Synths & Leads', r('synths?|leads?|plucks?|arps?|arpeggios?|saws?|square|sine|waveforms?|sequences?|seqs?|melod(y|ies)|hooks?|riffs?|synth ?cutz|moog|juno|sid|bleeps?|blips?|tonal|notes?|cutz')],
  ];
  const GENERIC = [
    ['Cymbals', r('cymbals?|cym|cymb|cyms')],
    ['808s & Sub', r('808')],
    ['Percussion', r('perc\\w*|world|ethnic')],
    ['Other Drums', r('drums?|kits?|hits?|one ?shots?|oneshots?|combo|drum ?kits?|kit ?pieces?|strikes?|tape ?drums?')],
  ];

  // Loops: an explicit loop word anywhere, or a tempo marker without any one-shot hint.
  const LOOP_WORD = /(?:^| )(?:\w*loops?|lps?|lp|breaks?|breakbeats?|fills?|grooves?|drum ?loops?|top ?loops?|beats? ?loops?|multitrack|stems?)(?= |$)/;
  const BPM = /(?:^| )(?:\d{2,3} ?bpm|bpm ?\d{2,3})(?= |$)|\[\d{2,3}\]/;
  const ONE_SHOT = /(?:^| )(?:one ?shots?|oneshots?|single ?samples?|singles?|hits?|unlooped|kit ?pieces?|samples)(?= |$)/;
  const HIT_IN_NAME = /(?:^| )(?:kicks?|bd|snares?|sd|claps?|hats?|hh|hi ?hats?|oh|ch|toms?|crash|ride|rims?|shakers?|percs?|cymbals?|bass ?drums?|bassdrums?)(?= |$)/;
  const LOOP_KIND = [
    ['Fills', r('fills?|drum ?fills?|rolls?')],
    ['Breaks', r('breaks?|breakbeats?|break ?beats?|\\w*breaks')],
    ['Vocal Loops', r('vox|vocals?|voices?|chants?|acapellas?|choirs?')],
    ['Drum Loops', r('bass ?drums?|bassdrums?|bd|kicks?')],
    ['Bass Loops', r('\\w*bass(es|line|lines)?|sub|808 ?bass')],
    ['FX Loops', r('fx|sfx|effects?|risers?|sweeps?|noise|ambience|atmos|textures?')],
    ['Melodic Loops', r('synths?|melod(y|ies)|leads?|chords?|keys|pianos?|guitars?|gtr|arps?|pads?|strings?|plucks?|stabs?|organs?|rhodes|brass|horns?|flutes?|sax|bells?|music|instruments?|harmony|sitars?|ouds?|melody ?loops?')],
    ['Top Loops', r('tops?|top ?loops?|hats?|hi ?hats?|hihats?|hh|shakers?|rides?|cymbals?|tambs?|tambourines?')],
    ['Percussion Loops', r('percs?|percussions?|congas?|bongos?|tablas?|djembes?|darbukas?|dhol|cajon|taiko|ethnic|tribal|timbales?|frame|riq|daf|duff|hand ?drums?')],
    ['Drum Loops', r('drums?|kicks?|snares?|beats?|grooves?|drum ?loops?|claps?')],
  ];

  /** "VEC1 OpenHH_04" -> "vec 1 open hh 04" */
  function norm(s) {
    return ' ' + String(s)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2')
      .toLowerCase().replace(/[^a-z0-9#\[\]]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  }
  const first = (rules, s) => { for (const [cat, re] of rules) if (re.test(s)) return cat; return null; };

  // Per-folder memo: everything that depends only on the folder chain.
  const dirMemo = new Map();
  function dirInfo(dir) {
    let d = dirMemo.get(dir); if (d) return d;
    const parts = dir ? dir.split('/') : [];
    const segs = parts.map(norm).reverse();           // nearest folder first
    const parent = dir.includes('/') ? dirInfo(dir.slice(0, dir.lastIndexOf('/'))) : null;
    const own = segs[0] || '';
    // nearest-first scan = this folder, then the parent's (already nearest-first) result
    const pick = (rules, key) => (own && first(rules, own)) || (parent ? parent[key] : null);
    d = {
      spec: pick(SPECIFIC, 'spec'),
      gen: pick(GENERIC, 'gen'),
      loopKind: pick(LOOP_KIND, 'loopKind'),
      loopWord: LOOP_WORD.test(own) || !!(parent && parent.loopWord),
      bpm: BPM.test(own) || !!(parent && parent.bpm),
      oneShot: ONE_SHOT.test(own) || !!(parent && parent.oneShot),
    };
    dirMemo.set(dir, d);
    return d;
  }

  /** rel = path relative to the library root ("Pack/Kicks/Kick 01.wav") */
  function categorize(rel) {
    const k = rel.lastIndexOf('/');
    const dir = k >= 0 ? rel.slice(0, k) : '', file = norm(k >= 0 ? rel.slice(k + 1) : rel);
    const d = dirInfo(dir);
    const fileLoopWord = LOOP_WORD.test(file), fileBpm = BPM.test(file);
    const hit = HIT_IN_NAME.test(file);
    const isLoop = fileLoopWord || (!hit && !ONE_SHOT.test(file) && (d.loopWord || ((fileBpm || d.bpm) && !d.oneShot)));
    if (isLoop) return first(LOOP_KIND, file) || d.loopKind || 'Drum Loops';
    return first(SPECIFIC, file) || d.spec || first(GENERIC, file) || d.gen || 'Uncategorized';
  }

  return { GROUPS, categorize, norm, reset: () => dirMemo.clear() };
})();
if (typeof module !== 'undefined') module.exports = Categorize;

// ATC MUSIC — the soundtrack, and the clock the journey runs on.
//
// Two playlists, one per mode, each a folder that is read at runtime — drop
// audio files in (or delete them) and the playlist follows on the next load:
//
//   asset/audio/music/      the main journey
//   asset/audio/music-j2l/  J2L III mode
//
// There is no manifest to keep in sync. A folder is listed from whichever
// source the host offers —
//   1. The server's directory listing. VS Code Live Server and
//      `python -m http.server` both serve one, so local edits show up on refresh.
//   2. The GitHub contents API, on *.github.io, where Pages serves no listing.
//      The API reflects the repo as soon as it is pushed; the Pages deploy can
//      lag by a minute, so a track that 404s in that window is dropped rather
//      than stalling the playlist.
//
// Only the playlist of the mode on screen plays; the other one pauses. Tracks
// play in a fixed (alphabetical) order, end to end, looping. The J2L III
// playlist is just that — a soundtrack. The main one also drives the journey
// (BEAT, below): each main track is decoded once in the background and
// analysed for its tempo and
// its rhythmic activity — how dense and strong the note onsets (drum hits,
// attacks) are, moment to moment. The result is cached in localStorage keyed
// by URL + size, so it is only recomputed when a file changes.
//
// BEAT mode (the default step of the speed button, main journey only) makes
// the music the master clock:
//   * Speed — the journey travels at 1x in sparse, slow passages and up to
//     100x in the busiest, following the rhythmic activity (not loudness:
//     a quiet but driving section should still be fast).
//   * Timeline lock — from those speeds a table of when every leg starts in
//     the song is precomputed. Each leg is then timed to land on its slot, so
//     journey and music stay locked; scrubbing, clicking the progress bar or
//     replaying seeks the music to the matching point.
// The journey is fitted to the playlist so the music plays through once and
// the last leg lands 2 s before it ends (END_LEAD_S). If
// that would mean racing (a short playlist), CHORUS REPEATS (the ↻ button,
// on by default) extend each track by replaying its chorus — as set in the
// folder's choruses.json ({ "file.mp3": ["0:28", "1:40"] }), or else its most
// rhythmically active 16 bars — looped on an exact beat length so the beat
// never stutters — until the journey runs about 490 s (CHORUS_TARGET_S, the
// pace it had before fitting). A playlist already that long gets no repeats.
// Both re-fit automatically when tracks change.
// Pick 1x/10x/20x/100x on the speed button for manual speed; the music then
// just plays alongside (scrubbing still seeks it to the timeline position).
// J2L III has no BEAT step: its speed button is manual only.
//
// LYRICS: a text file next to the track with the same name ending in .txt —
// section headings with "@ m:ss" (e.g. "Chorus @ 0:28") and "• Mongolian:",
// "• Cyrillic:", "• English:" lines (Romanized is read, not shown); a heading
// with no lines repeats that section; a "• Time: m:ss" field times a line
// exactly (Shift+L opens a tap-to-time tool that writes those) — or a folder
// lyrics.json
// ({ "file.mp3": [{ t, mn, cyr, en }, …] }), is shown top-left of the radar
// while that track plays — traditional
// Mongolian set vertically, then Mongolian Cyrillic and English. Lines follow
// the position in the song file, so chorus repeats replay their lines.
//
// Browsers refuse to start audio before the visitor has interacted with the
// page, and the journey autostarts. Until then the journey runs at 1x on its
// own; the first click/key/tap starts the music at the journey's current
// point. The MUSIC button mutes both playlists.
(function () {
  'use strict';

  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
  const KEY = 'atc-music';
  const AN_KEY = 'atc-music-an-v5:';     // bump when the analysis changes
  const CHORUS_KEY = 'atc-music-chorus';
  const VOLUME = 0.55;
  const FADE_MS = 600;
  const RESCAN_MIN_MS = 60 * 1000;       // GitHub's unauthenticated API allows 60 req/h

  // Analysis resolution: 11 kHz is plenty for onsets and keeps a
  // decoded track around 25 MB while it is being analysed.
  const SR = 11025, HOP = 256, HOP_S = HOP / SR;   // ~23 ms frames
  const ENV_HZ = 20;                     // stored envelope rate
  const SPEED_MAX = 100;

  const an = new Map();     // url -> { key, d, bpm, env } (shared by both playlists)

  // One playlist and its clock. `label` keys its timeline.
  // synced: the playlist is the journey's clock (BEAT, timeline lock). Only
  // the main journey's is; J2L III's music just plays.
  function makeSet(dir, label, synced) {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0;
    return {
      dir, label, audio, synced,
      tracks: [],          // [{ name, url, size }] in play order
      keys: new Set(),     // analysis cache keys in use
      analysedOnce: false,
      anGen: 0,
      ready: false,        // every track is analysed
      starts: [],          // playlist offset (s) of each track
      total: 0,            // playlist length (s)
      cur: -1,             // index of the track loaded into `audio`
      loop: 0,             // completed passes through the playlist
      pendingSeek: null,   // local seconds to apply once metadata is in
      timeline: null,      // { key, T, D, end } — leg k starts at T[k], lasts D[k]
      manual: {},          // choruses.json: file name -> [start, end] seconds
      lyrics: {},          // lyrics.json: file name -> [{ t, mn, cyr, en }] by time
      manualSig: '',
      plans: [],           // per track: { segs: [{ from, to, v }], dur } — play order incl. chorus repeats
      seg: 0,              // segment of plans[cur] being played
      jumpTimer: 0,
      baseTotal: 0,        // playlist length without repeats
      needRelock: true,    // align the music to the journey on next play
      fadeTimer: null,
      fadingOut: false
    };
  }
  const MAIN = makeSet('asset/audio/music/', 'main', true);
  const J2L = makeSet('asset/audio/music-j2l/', 'j2l', false);
  const SETS = [MAIN, J2L];

  let lastScan = 0;
  let enabled = true;
  let blocked = false;      // autoplay refused; waiting for a user gesture
  let wasActive = false;
  let lastMode = null;
  let chorusOn = true;
  try { chorusOn = localStorage.getItem(CHORUS_KEY) !== 'off'; } catch (e) { /* private mode */ }

  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* private mode */ }

  // J2L III is the scope's FBL mode (widget/final-boss.js).
  function j2lMode() {
    const sc = window._atcScope;
    return !!(sc && sc.fblActive);
  }
  // The playlist that belongs to what is on screen.
  function activeSet() { return j2lMode() ? J2L : MAIN; }

  /* ================= discovery ================= */

  function trackName(file) {
    let n = file;
    try { n = decodeURIComponent(file); } catch (e) { /* already decoded */ }
    return n.replace(AUDIO_EXT, '');
  }

  // Server-generated directory index (Live Server, http.server, nginx autoindex…)
  async function listFromIndex(dir) {
    const dirUrl = new URL(dir, location.href);
    const res = await fetch(dirUrl.href, { cache: 'no-store' });
    if (!res.ok) throw new Error('no directory index');
    const type = res.headers.get('content-type') || '';
    if (!/html/i.test(type)) throw new Error('index is not html');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const out = [];
    doc.querySelectorAll('a[href]').forEach(a => {
      let u;
      try { u = new URL(a.getAttribute('href'), dirUrl); } catch (e) { return; }
      if (u.origin !== dirUrl.origin) return;
      if (!u.pathname.startsWith(dirUrl.pathname)) return;
      const file = u.pathname.slice(dirUrl.pathname.length);
      if (!file || file.includes('/') || !AUDIO_EXT.test(file)) return;
      out.push({ name: trackName(file), url: u.href, size: null });
    });
    return out;
  }

  // GitHub Pages: ask the repo what is in the folder.
  async function listFromGitHub(dir) {
    const host = location.hostname;
    if (!/\.github\.io$/i.test(host)) throw new Error('not GitHub Pages');
    const owner = host.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    // Project sites live at /<repo>/; a user site is the <owner>.github.io repo.
    const repo = seg && !/\.html?$/i.test(seg) ? seg : host;
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${dir.replace(/\/$/, '')}`;
    const res = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 404) return [];       // folder not in the repo (yet)
    if (!res.ok) throw new Error('GitHub API ' + res.status);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('unexpected API response');
    return items
      .filter(it => it && it.type === 'file' && AUDIO_EXT.test(it.name))
      .map(it => ({
        name: trackName(it.name),
        // Serve from Pages itself (same origin, cached) rather than raw.githubusercontent
        url: new URL(dir + encodeURIComponent(it.name), location.href).href,
        size: it.size != null ? it.size : null
      }));
  }

  async function scan(dir) {
    for (const source of [listFromIndex, listFromGitHub]) {
      try {
        const found = await source(dir);
        const seen = new Set();
        return found
          .filter(t => !seen.has(t.url) && seen.add(t.url))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch (e) { /* try the next source */ }
    }
    return null; // couldn't read the folder at all — keep whatever we had
  }

  // "m:ss", "h:mm:ss" or plain seconds → seconds.
  function parseTime(v) {
    if (typeof v === 'number') return v;
    const parts = String(v).trim().split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) return NaN;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  // Optional choruses.json next to the tracks.
  async function loadManual(dir) {
    try {
      const res = await fetch(new URL(dir + 'choruses.json', location.href).href, { cache: 'no-store' });
      if (!res.ok) return {};
      const raw = await res.json();
      const out = {};
      Object.keys(raw || {}).forEach(name => {
        const v = raw[name];
        if (name.startsWith('_') || !Array.isArray(v) || v.length < 2) return;
        const a = parseTime(v[0]), b = parseTime(v[1]);
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) out[name] = [a, b];
      });
      return out;
    } catch (e) { return {}; }
  }

  async function loadLyrics(dir) {
    try {
      const res = await fetch(new URL(dir + 'lyrics.json', location.href).href, { cache: 'no-store' });
      if (!res.ok) return {};
      const raw = await res.json();
      const out = {};
      Object.keys(raw || {}).forEach(name => {
        const lines = raw[name];
        if (name.startsWith('_') || !Array.isArray(lines)) return;
        out[name] = lines
          .map(l => ({ t: parseTime(l && l.t), mn: String((l && l.mn) || ''), cyr: String((l && l.cyr) || ''), en: String((l && l.en) || '') }))
          .filter(l => Number.isFinite(l.t))
          .sort((a, b) => a.t - b.t);
      });
      return out;
    } catch (e) { return {}; }
  }

  // Plain-text lyrics, in the layout people paste from lyric sites:
  //   Verse 1 @ 0:05
  //   • Traditional Script: …   • Cyrillic: …   • Romanized: …   • English: …
  //   ("Mongolian:" / "Mongolian Script:" also work for the traditional script)
  //   Chorus @ 0:28
  //   …
  //   Chorus @ 1:58        ← no lines: repeats the last "Chorus"
  // A sung line starts at its first field after the previous line's English
  // (or at a repeated field). Lines are spaced evenly from their heading's time
  // to the next heading's. Lines starting with # are comments.
  const LYR_FIELD = /^\s*[•·*\-]?\s*(time|mongolian(?:\s+script)?|traditional(?:\s+script)?|script|cyrillic|romani[sz]ed|latin|english)\s*:\s*(.*)$/i;
  function parseLyricsText(text) {
    const sections = [];
    let sec = null, line = null;
    const startLine = () => { line = { mn: '', cyr: '', en: '', ts: [] }; sec.lines.push(line); };
    for (const rawLine of String(text).split(/\r?\n/)) {
      const l = rawLine.trim();
      if (!l || l.startsWith('#')) continue;
      const m = l.match(LYR_FIELD);
      if (m) {
        if (!sec) { sec = { name: '', t: null, lines: [] }; sections.push(sec); }
        const kind = m[1].toLowerCase();
        if (kind === 'time') {                 // starts a line and pins its time(s)
          if (!line || line.mn || line.cyr || line.en || line.ts.length) startLine();
          // "1:22.48" or a list for a line sung more than once: "1:22.48, 1:54.78"
          line.ts = m[2].split(/[,;]+/).map(parseTime).filter(Number.isFinite);
          continue;
        }
        const key = /^(mongolian|traditional|script)/.test(kind) ? 'mn' : kind === 'cyrillic' ? 'cyr' : kind === 'english' ? 'en' : null;
        if (!line || (key && line[key]) || (line.en && key !== 'en')) startLine();
        if (key) line[key] = m[2].trim();
        continue;
      }
      // anything else is a section heading, optionally with "@ m:ss"
      const h = l.match(/^(.*?)\s*@\s*([\d:.]+)\s*$/);
      sec = { name: (h ? h[1] : l).trim().toLowerCase(), t: h ? parseTime(h[2]) : null, lines: [] };
      sections.push(sec);
      line = null;
    }
    // headings without lines repeat the last section of the same name
    sections.forEach((sc, i) => {
      if (sc.lines.length) return;
      for (let j = i - 1; j >= 0; j--) if (sections[j].name === sc.name && sections[j].lines.length) { sc.lines = sections[j].lines; break; }
    });
    const out = [];
    // Lines with their own Time win; otherwise lines are spread across their
    // section, from its heading time to the next timed heading.
    sections.forEach(sc => sc.lines.forEach(ln => {
      ln.ts.forEach(t => out.push({ t, mn: ln.mn, cyr: ln.cyr, en: ln.en }));
    }));
    const timed = sections.filter(sc => Number.isFinite(sc.t) && sc.lines.some(ln => !ln.ts.length)).sort((a, b) => a.t - b.t);
    timed.forEach((sc, i) => {
      const lines = sc.lines.filter(ln => !ln.ts.length);
      const next = timed[i + 1];
      const span = next ? next.t - sc.t : lines.length * 4;
      const step = span / lines.length;
      lines.forEach((ln, k) => out.push({ t: sc.t + k * step, mn: ln.mn, cyr: ln.cyr, en: ln.en }));
      // clear the display between sections if the last line would run long
      if (next && step > 12) out.push({ t: sc.t + lines.length * step - 0.01, mn: '', cyr: '', en: '' });
    });
    out.sort((a, b) => a.t - b.t);
    // Don't hold a line through an instrumental gap: clear it after 7 s when
    // nothing follows within 8 s.
    const withGaps = [];
    out.forEach((l, i) => {
      withGaps.push(l);
      const nx = out[i + 1];
      if ((l.mn || l.cyr || l.en) && (!nx || nx.t - l.t > 8)) withGaps.push({ t: l.t + 7, mn: '', cyr: '', en: '' });
    });
    return withGaps;
  }

  const lyricsRaw = {};                     // file name -> { text, url } of its .txt

  async function loadLyricsTexts(list) {
    const out = {};
    await Promise.all((list || []).map(async t => {
      const url = t.url.replace(AUDIO_EXT, '.txt');
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const text = await res.text();
        lyricsRaw[fileNameOf(t)] = { text, url: t.url };
        const lines = parseLyricsText(text);
        if (lines.length) out[fileNameOf(t)] = lines;
      } catch (e) { /* no lyrics for this track */ }
    }));
    return out;
  }

  function fileNameOf(t) {
    let n = t.url.split('/').pop();
    try { n = decodeURIComponent(n); } catch (e) { /* keep */ }
    return n;
  }

  async function rescan() {
    lastScan = Date.now();
    await Promise.all(SETS.map(async S => {
      const [list, manual, lyrics] = await Promise.all([scan(S.dir), S.synced ? loadManual(S.dir) : {}, loadLyrics(S.dir)]);
      // per-track .txt files take precedence over lyrics.json
      S.lyrics = Object.assign({}, lyrics, await loadLyricsTexts(list || S.tracks));
      lyricKey = '';                           // re-render with the new text
      if (!list) return;
      const manualSig = JSON.stringify(manual);
      const sig = l => l.map(t => t.url + '|' + t.size).join('\n');
      if (sig(list) !== sig(S.tracks) || manualSig !== S.manualSig) {
        S.manual = manual;
        S.manualSig = manualSig;
        setTracks(S, list);
      }
    }));
    syncButton();
  }

  // Swap a playlist, keeping whatever is playing if it survived.
  function setTracks(S, list) {
    const playingUrl = S.cur >= 0 && S.tracks[S.cur] ? S.tracks[S.cur].url : null;
    S.tracks = list;
    S.cur = playingUrl ? S.tracks.findIndex(t => t.url === playingUrl) : -1;
    if (S.cur < 0 && playingUrl) { S.audio.pause(); S.audio.removeAttribute('src'); }
    S.ready = false;
    S.timeline = null;
    S.needRelock = true;
    analyzeAll(S);
  }

  /* ================= analysis ================= */

  async function fileKey(t) {
    if (t.size != null) return t.url + '|' + t.size;
    try {
      const r = await fetch(t.url, { method: 'HEAD', cache: 'no-store' });
      return t.url + '|' + (r.headers.get('content-length') || '') + '|' + (r.headers.get('last-modified') || '');
    } catch (e) { return t.url; }
  }

  function loadCached(k) {
    try {
      const s = localStorage.getItem(AN_KEY + k);
      if (!s) return null;
      const o = JSON.parse(s);
      return { d: o.d, bpm: o.bpm, chorus: o.c || null, env: Float32Array.from(o.env, v => v / 1000) };
    } catch (e) { return null; }
  }

  function saveCached(k, a) {
    try {
      localStorage.setItem(AN_KEY + k, JSON.stringify({
        d: a.d, bpm: a.bpm, c: a.chorus,
        env: Array.from(a.env, v => Math.round(v * 1000))
      }));
    } catch (e) { /* storage full or blocked — analysis just reruns next load */ }
  }

  // Forget analyses of files no longer in either folder — only once both
  // folders have been read, or one playlist would prune the other's cache.
  function prune() {
    if (!SETS.every(S => S.analysedOnce)) return;
    const keep = new Set();
    SETS.forEach(S => S.keys.forEach(k => keep.add(k)));
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(AN_KEY) && !keep.has(k.slice(AN_KEY.length))) localStorage.removeItem(k);
      }
    } catch (e) { /* ignore */ }
  }

  async function decode(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) throw new Error('no Web Audio');
    const ctx = new OAC(1, SR, SR);           // decodes (and resamples) to SR
    return await new Promise((res, rej) => {
      const p = ctx.decodeAudioData(buf, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }

  const pct = (arr, q) => {
    const s = Float32Array.from(arr).sort();
    return s[Math.max(0, Math.min(s.length - 1, Math.floor(s.length * q)))];
  };

  // Tempo + rhythmic-activity envelope from a decoded buffer.
  function analyse(ab, manual) {
    const n = ab.length;
    const c0 = ab.getChannelData(0);
    const c1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : null;
    const F = Math.max(1, Math.floor(n / HOP));
    const flux = new Float32Array(F);       // rise in high-passed energy (onsets)
    let prev = 0, prevL = 0;
    for (let f = 0; f < F; f++) {
      let h = 0;
      const o = f * HOP;
      for (let i = 0; i < HOP; i++) {
        const x = c1 ? (c0[o + i] + c1[o + i]) * 0.5 : c0[o + i];
        const y = x - 0.97 * prev;            // pre-emphasis: transients stand out
        prev = x;
        h += y * y;
      }
      const L = Math.log(h + 1e-9);
      flux[f] = f ? Math.max(0, L - prevL) : 0;
      prevL = L;
    }

    // Onset strength: flux above its local mean.
    const on = new Float32Array(F);
    const W = 8;
    let acc = 0;
    for (let f = 0; f < Math.min(F, W); f++) acc += flux[f];
    for (let f = 0; f < F; f++) {
      if (f + W < F) acc += flux[f + W];
      if (f - W - 1 >= 0) acc -= flux[f - W - 1];
      const cnt = Math.min(F - 1, f + W) - Math.max(0, f - W) + 1;
      on[f] = Math.max(0, flux[f] - acc / cnt);
    }

    // Tempo (shown in the MUSIC tooltip): autocorrelation of onsets,
    // 70–180 BPM, biased gently to ~120.
    const lagOf = bpm => 60 / bpm / HOP_S;
    const minLag = Math.floor(lagOf(180)), maxLag = Math.ceil(lagOf(70));
    let bestLag = Math.round(lagOf(120)), best = -1;
    for (let L = minLag; L <= maxLag; L++) {
      let s = 0;
      for (let f = L; f < F; f++) s += on[f] * on[f - L];
      const bpm = 60 / (L * HOP_S);
      s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.7, 2));
      if (s > best) { best = s; bestLag = L; }
    }
    // Fractional beat period (parabolic peak) — loops need better than the
    // ~23 ms frame resolution, or the beat drifts over 64 beats.
    const acAt = L => { let s2 = 0; for (let f = L; f < F; f++) s2 += on[f] * on[f - L]; return s2; };
    const a0 = acAt(bestLag - 1), a1 = acAt(bestLag), a2 = acAt(bestLag + 1);
    const curv = a0 - 2 * a1 + a2;
    const beatFr = bestLag + (curv < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a0 - a2) / curv)) : 0);
    const chorus = findChorus(on, F, beatFr, manual);

    // Rhythmic activity: mean onset strength over a ~4 s window — dense,
    // hard-hitting passages score high, sustained or sparse ones low, however
    // loud they are. Long enough that speed follows sections (verse, chorus,
    // breakdown) rather than individual hits. Normalised per track so every
    // song spans the whole 1x→100x range.
    const S = Math.round(2.0 / HOP_S);
    const sm = new Float32Array(F);
    let sum = 0;
    for (let f = 0; f < Math.min(F, S); f++) sum += on[f];
    for (let f = 0; f < F; f++) {
      if (f + S < F) sum += on[f + S];
      if (f - S - 1 >= 0) sum -= on[f - S - 1];
      const cnt = Math.min(F - 1, f + S) - Math.max(0, f - S) + 1;
      sm[f] = sum / cnt;
    }
    const p10 = pct(sm, 0.10), p97 = pct(sm, 0.97);
    const span = Math.max(1e-3, p97 - p10);
    const d = n / SR;
    const envLen = Math.max(1, Math.ceil(d * ENV_HZ));
    const env = new Float32Array(envLen);
    for (let j = 0; j < envLen; j++) {
      const f = Math.min(F - 1, Math.round(j / ENV_HZ / HOP_S));
      env[j] = Math.max(0, Math.min(1, (sm[f] - p10) / span));
    }
    return { d, bpm: Math.round(60 / (beatFr * HOP_S)), chorus, env };
  }

  // The chorus: the most rhythmically active 16 bars (8 on a short track).
  // Its length is tuned to the song's own periodicity near that lag, so a
  // jump from its end back to its start lands exactly whole bars back and
  // the beat carries straight through. The jump sits just before a strong
  // onset, so the hit comes from the replayed bar rather than being cut.
  function findChorus(on, F, beatFr, manual) {
    if (manual) return tuneChorus(on, F, beatFr, manual[0], manual[1]);
    let beats = 64;
    if (beats * beatFr > F * 0.4) beats = 32;
    if (beats * beatFr > F * 0.4 || beatFr < 4) return null;
    const L0 = beats * beatFr;
    let L = Math.round(L0), bestS = -1;
    for (let l = Math.floor(L0 * 0.985); l <= Math.ceil(L0 * 1.015); l++) {
      let sc = 0;
      for (let f = l; f < F; f++) sc += on[f] * on[f - l];
      if (sc > bestS) { bestS = sc; L = l; }
    }
    const pre = new Float64Array(F + 1);
    for (let f = 0; f < F; f++) pre[f + 1] = pre[f] + on[f];
    let start = -1, bestM = -1;
    for (let f = Math.floor(F * 0.05); f + L < F; f++) {
      const m = pre[f + L] - pre[f];
      if (m > bestM) { bestM = m; start = f; }
    }
    if (start < 0) return null;
    const end0 = start + L, r = Math.round(beatFr / 2);
    let endF = end0, peak = -1;
    for (let f = Math.max(L + 2, end0 - r); f <= Math.min(F - 3, end0 + r); f++) {
      if (on[f] > peak) { peak = on[f]; endF = f; }
    }
    endF -= 2;                                  // just before the hit
    return [+((endF - L) * HOP_S).toFixed(4), +(endF * HOP_S).toFixed(4)];
  }

  // A chorus given by hand (choruses.json): keep its length to a whole
  // number of beats — the lag, within half a beat of the given length, where
  // the track's onsets line up best — and end it just before the strongest
  // hit near the given end. Start = end − that length, so a replay is
  // exactly that many beats back.
  function tuneChorus(on, F, beatFr, s, e) {
    const s0 = Math.max(0, Math.round(s / HOP_S)), e0 = Math.min(F - 3, Math.round(e / HOP_S));
    if (e0 - s0 < 4 * beatFr) return null;
    const beatsN = Math.max(4, Math.round((e0 - s0) / beatFr));
    let L = Math.round(beatsN * beatFr), bestS = -1;
    for (let l = Math.floor((beatsN - 0.5) * beatFr); l <= Math.ceil((beatsN + 0.5) * beatFr); l++) {
      let sc = 0;
      for (let f = l; f < F; f++) sc += on[f] * on[f - l];
      if (sc > bestS) { bestS = sc; L = l; }
    }
    const r = Math.round(beatFr / 2);
    let endF = e0, peak = -1;
    for (let f = Math.max(L + 2, e0 - r); f <= Math.min(F - 3, e0 + r); f++) {
      if (on[f] > peak) { peak = on[f]; endF = f; }
    }
    endF -= 2;                                  // just before the hit
    return [+((endF - L) * HOP_S).toFixed(4), +(endF * HOP_S).toFixed(4)];
  }

  async function analyzeAll(S) {
    const gen = ++S.anGen;
    if (!S.synced) {                           // plain soundtrack: nothing to analyse
      S.ready = S.tracks.length > 0;
      S.keys = new Set();
      S.analysedOnce = true;
      prune();
      syncButton();
      return;
    }
    syncButton();
    const keys = new Set();
    for (const t of S.tracks.slice()) {
      if (gen !== S.anGen) return;
      const manual = S.manual[fileNameOf(t)] || null;
      const k = (await fileKey(t)) + (manual ? '|chorus ' + manual.join('-') : '');
      keys.add(k);
      if (an.has(t.url) && an.get(t.url).key === k) continue;
      let a = loadCached(k);
      if (!a) {
        try { a = analyse(await decode(t.url), manual); saveCached(k, a); }
        catch (e) { console.warn('[atc-music] could not analyse', t.name, e); a = null; }
      }
      if (gen !== S.anGen) return;
      if (a) { a.key = k; an.set(t.url, a); }
    }
    if (gen !== S.anGen) return;
    // A track that cannot be decoded cannot be placed on the timeline.
    const playable = S.tracks.filter(t => an.has(t.url));
    if (playable.length !== S.tracks.length) {
      const playingUrl = S.cur >= 0 && S.tracks[S.cur] ? S.tracks[S.cur].url : null;
      S.tracks = playable;
      S.cur = playingUrl ? S.tracks.findIndex(t => t.url === playingUrl) : -1;
    }
    layoutPlaylist(S, null);
    S.timeline = null;
    S.ready = S.tracks.length > 0 && S.total > 0;
    S.needRelock = true;
    S.keys = keys;
    S.analysedOnce = true;
    prune();
    syncButton();
  }

  /* ================= playlist clock ================= */

  // Play plan of each track: intro → chorus × (1 + reps) → rest. Virtual time
  // (the music clock) runs through the plan; real time is the file position.
  function planFor(a, reps) {
    const c = a.chorus;
    if (!reps || !c || !(c[1] > c[0])) return { segs: [{ from: 0, to: a.d, v: 0 }], dur: a.d };
    const segs = [];
    let v = 0;
    const add = (from, to) => { segs.push({ from, to, v }); v += to - from; };
    add(0, c[1]);
    for (let k = 0; k < reps; k++) add(c[0], c[1]);
    add(c[1], a.d);
    return { segs, dur: v };
  }

  function layoutPlaylist(S, reps) {
    S.plans = []; S.starts = []; S.total = 0; S.baseTotal = 0;
    S.tracks.forEach((t, i) => {
      const a = an.get(t.url);
      if (!a) return;
      const p = planFor(a, reps ? reps[i] : 0);
      S.plans[i] = p;
      S.starts.push(S.total);
      S.total += p.dur;
      S.baseTotal += a.d;
    });
  }

  // Virtual time within a track → { seg, real }.
  function toReal(plan, tv) {
    if (!plan) return { seg: 0, real: tv };
    const segs = plan.segs;
    for (let j = 0; j < segs.length; j++) {
      const sg = segs[j];
      if (tv < sg.v + (sg.to - sg.from) || j === segs.length - 1) {
        return { seg: j, real: sg.from + Math.max(0, Math.min(sg.to - sg.from, tv - sg.v)) };
      }
    }
    return { seg: 0, real: tv };
  }

  // Where virtual time V (seconds since the start of pass 0) falls.
  function locate(S, V) {
    if (!S.total) return null;
    const lp = Math.floor(V / S.total);
    const pos = V - lp * S.total;
    let i = 0;
    while (i + 1 < S.starts.length && S.starts[i + 1] <= pos) i++;
    return { loop: lp, i, t: pos - S.starts[i] };
  }

  function currentV(S) {
    if (S.cur < 0 || !S.total) return 0;
    const t = (S.pendingSeek != null ? S.pendingSeek : S.audio.currentTime) || 0;
    const plan = S.plans[S.cur];
    const sg = plan && plan.segs[Math.min(S.seg, plan.segs.length - 1)];
    const tv = sg ? sg.v + Math.max(0, Math.min(sg.to - sg.from, t - sg.from)) : t;
    return S.loop * S.total + S.starts[S.cur] + tv;
  }

  function envAt(S, V) {
    const L = locate(S, V);
    if (!L) return 0;
    const a = an.get(S.tracks[L.i].url);
    const x = toReal(S.plans[L.i], L.t).real * ENV_HZ;
    const j = Math.max(0, Math.min(a.env.length - 1, Math.floor(x)));
    const k = Math.min(a.env.length - 1, j + 1);
    return a.env[j] + (a.env[k] - a.env[j]) * (x - Math.floor(x));
  }

  // The music's speed shape: sparse → 1x, busiest → 100x, on an exponential
  // curve so the middle of a song sits around 5–25x rather than racing.
  function rawSpeedAt(S, V) {
    return Math.pow(SPEED_MAX, Math.pow(envAt(S, V), 1.5));
  }
  // …scaled by the playlist's fit factor (see buildTimeline) so the whole
  // journey plays through the playlist exactly once.
  // The journey eases in and out: over the first RAMP_S seconds the speed
  // rises smoothly from 1x to the music's speed, and over the last
  // RAMP_OUT_S before the landing (END_LEAD_S before the music ends) it
  // settles back to 1x. The fit includes both ramps, so it still lands on time.
  const SPEED_FLOOR = 0.2, SPEED_CEIL = 2000;
  const RAMP_S = 20, RAMP_OUT_S = 5;
  const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };   // smoothstep
  function speedAt(S, V, k) {
    const f = k != null ? k : (S.speedK || 1);
    let m = Math.max(SPEED_FLOOR, Math.min(SPEED_CEIL, rawSpeedAt(S, V) * f));
    // Ramps blend on a log scale (1x → 2x → 6x → 20x → 40x feels even;
    // a linear blend reaches half the top speed halfway in and feels abrupt).
    if (V < RAMP_S) m = Math.pow(m, ease(V / RAMP_S));
    const land = S.total - END_LEAD_S;
    if (V > land - RAMP_OUT_S && V <= S.total) m = Math.pow(m, ease((land - V) / RAMP_OUT_S));
    return m;
  }

  // Leg timing at speed m — a continuous version of the engine's 1/10/20/100x
  // ladder (divisor m^0.6 lands on 4 at 10x and 16 at 100x).
  const legMs = (base, m) => Math.max(120 * Math.min(1, Math.log10(Math.max(1, m))), base / Math.pow(m, 0.6));
  const pauseMs = m => Math.max(50, 500 / m);

  function legBase(a, b) {
    if (typeof AnimatedFlightMap !== 'undefined' && AnimatedFlightMap.legBaseMs) return AnimatedFlightMap.legBaseMs(a, b);
    const d = Math.sqrt(Math.pow(b.lat - a.lat, 2) + Math.pow(b.lng - a.lng, 2));
    return Math.max(1000, Math.min(4000, d * 200));
  }

  // When each leg starts in the song: walk the journey that is on screen,
  // taking each leg's speed from the music at the moment it begins.
  //
  // Fit to the playlist: the speed curve is scaled by one factor, found by
  // bisection, so the last leg lands END_LEAD_S (2 s) before the music ends —
  // the music plays through once, never looping. The timeline is rebuilt
  // whenever the playlist changes (its length is part of the key), so adding
  // or removing tracks re-fits automatically: more music → slower travel.
  // If the journey can't be squeezed that far (legs have a minimum on-screen
  // time), it runs as fast as it can and the playlist loops as before.
  const END_LEAD_S = 2;             // the arrow lands this long before the music ends
  const CHORUS_TARGET_S = 490;      // journey length chorus repeats aim for
  // Returns when the last leg lands (there is no pause after it).
  function walk(S, cities, k, T, D) {
    let V = 0;
    for (let i = 1; i < cities.length; i++) {
      if (T) T[i] = V;
      const d = legMs(legBase(cities[i - 1], cities[i]), speedAt(S, V, k)) / 1000;
      if (D) D[i] = d;
      V += d;
      if (i < cities.length - 1) V += pauseMs(speedAt(S, V, k)) / 1000;
    }
    return V;
  }

  function buildTimeline(S) {
    const fm = window.flightMap;
    if (!S.ready || !fm || !fm.cities || fm.cities.length < 2) return null;
    const key = S.label + '|' + fm.cities.length + '|' + S.baseTotal.toFixed(3) + '|' + (chorusOn ? 'chorus' : 'fit');
    if (S.timeline && S.timeline.key === key) return S.timeline;
    const cities = fm.cities, N = cities.length;
    const rebuilt = !!S.timeline;
    // Chorus repeats: lengthen the playlist so the journey lasts about
    // CHORUS_TARGET_S, spreading repeats across tracks in proportion to
    // their length.
    layoutPlaylist(S, null);
    if (chorusOn) {
      const extra = CHORUS_TARGET_S + END_LEAD_S - S.total;
      if (extra > 0) {
        const reps = S.tracks.map((t, i) => {
          const a = an.get(t.url), c = a && a.chorus;
          const len = c ? c[1] - c[0] : 0;
          return len > 1 ? Math.max(0, Math.round(extra * (a.d / S.baseTotal) / len)) : 0;
        });
        if (reps.some(r => r > 0)) layoutPlaylist(S, reps);
      }
    }
    if (rebuilt) S.needRelock = true;          // positions moved under the music
    const target = Math.max(1, S.total - END_LEAD_S);
    // Journey length falls as the factor rises; bracket it, then bisect.
    let lo = 1, hi = 1;
    if (walk(S, cities, 1) > target) {
      while (hi < 1e4 && walk(S, cities, hi) > target) { lo = hi; hi *= 2; }
    } else {
      while (lo > 1e-3 && walk(S, cities, lo) <= target) { hi = lo; lo /= 2; }
    }
    for (let it = 0; it < 32; it++) {
      const mid = Math.sqrt(lo * hi);
      if (walk(S, cities, mid) > target) lo = mid; else hi = mid;
    }
    // Journey length isn't smooth in the factor: a leg starting just
    // before or after a chorus loop point or track change takes a different
    // speed, so it can jump by seconds. Scan finely around the bisection's
    // answer for the factor that lands closest…
    let bestK = hi, bestErr = Math.abs(walk(S, cities, hi) - target);
    for (let j = -60; j <= 60 && bestErr > 0.05; j++) {
      const kk = hi * (1 + j * 0.0005), err = Math.abs(walk(S, cities, kk) - target);
      if (err < bestErr) { bestErr = err; bestK = kk; }
    }
    S.speedK = bestK;
    const T = new Float64Array(N + 1), D = new Float64Array(N + 1);
    let end = walk(S, cities, S.speedK, T, D);
    T[N] = end;
    // …then absorb what is left into the final legs (the slow ease-out), so
    // the arrow lands exactly END_LEAD_S before the music ends.
    const resid = target - end;
    if (Math.abs(resid) > 0.01 && N > 2) {
      let first = N - 1;
      while (first > 1 && T[first - 1] >= target - RAMP_OUT_S - 3) first--;
      const span = end - T[first];
      const sc = span > 0 ? Math.max(0.4, Math.min(2.5, (span + resid) / span)) : 1;
      const gaps = [];                           // pause after each leg (0 after the last)
      for (let i = first; i < N; i++) gaps.push(T[i + 1] - T[i] - D[i]);
      for (let i = first; i < N; i++) {
        D[i] *= sc;
        T[i + 1] = T[i] + D[i] + gaps[i - first] * sc;
      }
      end = T[N];
    }
    S.timeline = { key, T, D, end };
    return S.timeline;
  }

  // The song position that matches where the journey is right now.
  function journeyV(S) {
    const tl = buildTimeline(S);
    const fm = window.flightMap;
    if (!tl || !fm) return 0;
    const k = fm.currentCityIndex || 0;
    if (k <= 0) return 0;
    if (k >= fm.cities.length) return tl.end;
    const t = Number.isFinite(fm._legProgress) ? Math.max(0, Math.min(1, fm._legProgress)) : 0;
    return tl.T[k] + t * tl.D[k];
  }

  function load(S, i, realT, seg) {
    S.cur = i;
    S.seg = seg || 0;
    S.pendingSeek = realT || 0;
    S.audio.src = S.tracks[i].url;
    S.audio.load();
  }

  function seekV(S, V) {
    const L = locate(S, Math.max(0, V));
    if (!L) return;
    S.loop = L.loop;
    const m = toReal(S.plans[L.i], L.t);
    if (S.cur !== L.i || !S.audio.currentSrc) { load(S, L.i, m.real, m.seg); return; }
    S.seg = m.seg;
    // Still loading (a scrub that changed track a moment ago): the browser
    // drops a position set before the metadata arrives, so keep it pending
    // for the loadedmetadata handler.
    if (S.audio.readyState < 1) { S.pendingSeek = m.real; return; }
    try { S.audio.currentTime = m.real; S.pendingSeek = null; } catch (e) { S.pendingSeek = m.real; }
    scheduleJump(S);
  }

  // Follow the plan while playing: at the end of each segment move to the
  // next; where the next one starts elsewhere in the file (a chorus repeat),
  // jump there. Timed in two stages so the jump lands within a few ms.
  function scheduleJump(S) {
    clearTimeout(S.jumpTimer);
    S.jumpTimer = 0;
    if (S.cur < 0 || S.audio.paused || S.pendingSeek != null) return;
    const plan = S.plans[S.cur];
    if (!plan) return;
    const sg = plan.segs[S.seg], nx = plan.segs[S.seg + 1];
    if (!sg || !nx) return;
    const remain = sg.to - S.audio.currentTime;
    const go = () => {
      S.jumpTimer = 0;
      if (S.audio.paused || S.plans[S.cur] !== plan) return;
      const over = Math.max(0, S.audio.currentTime - sg.to);
      S.seg++;
      if (Math.abs(nx.from - sg.to) > 0.01) {
        try { S.audio.currentTime = nx.from + over; } catch (e) { /* ignore */ }
      }
      scheduleJump(S);
    };
    if (remain <= 0.004) go();
    else if (remain > 0.25) S.jumpTimer = setTimeout(() => scheduleJump(S), (remain - 0.15) * 1000);
    else S.jumpTimer = setTimeout(go, remain * 1000);
  }

  SETS.forEach(S => {
    S.audio.addEventListener('loadedmetadata', () => {
      if (S.pendingSeek == null) return;
      try { S.audio.currentTime = S.pendingSeek; } catch (e) { /* ignore */ }
      S.pendingSeek = null;
      scheduleJump(S);
    });
    S.audio.addEventListener('playing', () => scheduleJump(S));
    S.audio.addEventListener('seeked', () => scheduleJump(S));
    S.audio.addEventListener('pause', () => { clearTimeout(S.jumpTimer); S.jumpTimer = 0; });
    S.audio.addEventListener('ended', () => {
      if (!S.tracks.length) return;
      // The journey is over and the song has played out to its own ending:
      // stop here rather than starting the playlist again.
      if (S.outro) { S.outro = false; S.needRelock = true; return; }
      let i = S.cur + 1;
      if (i >= S.tracks.length) { i = 0; S.loop++; }
      load(S, i, 0, 0);
      if (shouldPlay(S)) play(S);
    });
    S.audio.addEventListener('error', () => {
      // File removed or not yet deployed — drop it and rebuild the timeline.
      if (S.cur < 0 || !S.tracks[S.cur]) return;
      const bad = S.tracks[S.cur].url;
      an.delete(bad);
      S.cur = -1;
      setTracks(S, S.tracks.filter(t => t.url !== bad));
    });
  });

  /* ================= the director (journey ⇄ music) ================= */

  // Installed on flightMap as legDirector. Always speaks for the playlist of
  // the mode on screen.
  const director = {
    // Music can drive the journey (analysed, switched on).
    available() { const S = activeSet(); return S.synced && S.ready && enabled && S.tracks.length > 0; },
    // …and is driving it right now: BEAT mode, actually playing, aligned.
    active() {
      const fm = window.flightMap, S = activeSet();
      return this.available() && !!fm && fm.beatMode !== false && !blocked &&
             !S.audio.paused && !S.needRelock && !!buildTimeline(S);
    },
    // Duration for leg k: end it where the timeline says, measured on the
    // music clock — this is both the beat-driven speed and the drift fix.
    legDuration(k) {
      tick();                                  // start the music first if it is due
      if (!this.active()) return 0;
      const S = activeSet(), tl = buildTimeline(S);
      if (k < 1 || k >= tl.T.length - 1) return 0;
      const V = currentV(S);
      if (Math.abs(V - tl.T[k]) > 4) { seekV(S, tl.T[k]); return tl.D[k] * 1000; }
      return Math.max(40, Math.min(tl.D[k] * 3000 + 300, (tl.T[k] + tl.D[k] - V) * 1000));
    },
    // Pause before leg k: until its slot in the song.
    pauseBeforeLeg(k) {
      const S = activeSet(), tl = buildTimeline(S);
      if (!tl || k < 1 || k >= tl.T.length - 1) return -1;
      return Math.max(16, Math.min(3000, (tl.T[k] - currentV(S)) * 1000));
    },
    // Journey jumped to city j (scrub, progress-bar click, replay).
    onJump(j) {
      const S = activeSet();
      if (!S.synced) return;                   // J2L III's music isn't tied to its timeline
      const tl = buildTimeline(S);
      if (!tl) { S.needRelock = true; return; }
      seekV(S, j <= 0 ? 0 : tl.T[j] + tl.D[j]);
      S.needRelock = false;
    },
    relock() { activeSet().needRelock = true; }
  };

  /* ================= playback ================= */

  function fadeTo(S, target, done, ms) {
    clearInterval(S.fadeTimer);
    const a = S.audio, from = a.volume, t0 = performance.now(), dur = ms || FADE_MS;
    S.fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      a.volume = from + (target - from) * k;
      if (k >= 1) {
        clearInterval(S.fadeTimer);
        S.fadeTimer = null;
        if (done) done();
      }
    }, 30);
  }

  // A playlist plays only while its own mode is on screen and its journey runs.
  function shouldPlay(S) {
    const fm = window.flightMap;
    return S === activeSet() && enabled && S.tracks.length > 0 &&
           !!(fm && fm.isAnimating && !fm._hoverPaused) && !document.hidden;
  }

  function play(S) {
    S.fadingOut = false;
    const p = S.audio.play();                  // sets paused=false synchronously
    if (p && p.then) {
      p.then(() => {
        blocked = false;
        fadeTo(S, VOLUME);
        syncButton();
      }).catch(err => {
        if (err && err.name === 'NotAllowedError') {
          blocked = true;
          S.needRelock = true;                 // the journey carries on without us
          syncButton();
        }
        // AbortError (src swapped mid-start) is harmless; the next tick retries.
      });
    } else {
      fadeTo(S, VOLUME);
    }
  }

  function stop(S, ms) {
    if (S.fadingOut) return;
    S.fadingOut = true;
    fadeTo(S, 0, () => {
      S.fadingOut = false;
      // Re-check: play may have been pressed again during the fade.
      if (!shouldPlay(S)) S.audio.pause();
    }, ms);
  }

  // The journey has run to its end (not paused) on the playlist's own mode.
  function journeyFinished(S) {
    const fm = window.flightMap;
    return S === activeSet() && enabled && !document.hidden && !!fm && !fm.isAnimating &&
           !!fm.cities && fm.cities.length > 1 && fm.currentCityIndex >= fm.cities.length;
  }

  // Seconds of music left before this pass of the playlist ends.
  function musicLeft(S) {
    if (S.cur < 0 || !S.total) return Infinity;
    return (S.loop + 1) * S.total - currentV(S);
  }

  // When the journey ends, let the music end the way the song does: if
  // what's left is a short ending (the fit leaves ~2% — the outro), play it
  // out and stop at the song's own end; otherwise fade gently over 3 s.
  const OUTRO_MAX_S = 45, LONG_FADE_MS = 3000;

  function tick() {
    const fm = window.flightMap;
    if (fm && !fm.legDirector) fm.legDirector = director;

    // Switching mode swaps the journey on screen: both playlists re-align to
    // their own journey when they next play.
    const mode = j2lMode() ? 'j2l' : 'main';
    if (mode !== lastMode) {
      if (lastMode !== null) SETS.forEach(S => { S.needRelock = true; });
      lastMode = mode;
      syncButton();
    }

    for (const S of SETS) {
      if (shouldPlay(S)) {
        S.outro = false;                       // journey running again (replay)
        if (blocked) continue;
        const tl = S.synced && S.ready ? buildTimeline(S) : null;
        if (tl && (S.needRelock || S.cur < 0)) {
          // Join the journey where it is.
          seekV(S, journeyV(S));
          S.needRelock = false;
        } else if (S.cur < 0) {
          S.loop = 0;
          load(S, 0, 0, 0);                    // plain playlist, or not analysed yet
        }
        if (S.audio.paused || S.fadingOut) play(S);
      } else if (!S.audio.paused) {
        if (S.outro) continue;                 // playing out the song's ending
        if (journeyFinished(S) && !S.fadingOut) {
          if (musicLeft(S) <= OUTRO_MAX_S) { S.outro = true; continue; }
          stop(S, LONG_FADE_MS);
        } else {
          stop(S);
        }
      }
    }

    // Speed readout follows the music while it drives.
    const act = director.active();
    if (fm) {
      if (act) fm.speedMultiplier = Math.max(1, Math.round(speedAt(activeSet(), currentV(activeSet()))));
      else if (wasActive && fm.beatMode !== false) fm.speedMultiplier = 1;
    }
    if (act !== wasActive) { wasActive = act; syncButton(); }
    renderLyrics();
  }

  // First interaction unlocks audio. Runs inside the gesture so Safari accepts it.
  function onGesture() {
    if (!blocked) return;
    blocked = false;
    const S = activeSet();
    if (shouldPlay(S)) { tick(); return; }
    if (S.cur < 0) return;
    // Not meant to be playing right now (e.g. this click is the one that
    // presses PLAY, and the animation hasn't flipped yet). Start-and-stop
    // silently so the element counts as user-started for later ticks.
    S.audio.muted = true;
    const p = S.audio.play();
    const unmute = () => {
      if (shouldPlay(S)) fadeTo(S, VOLUME); else S.audio.pause();
      S.audio.muted = false;
    };
    if (p && p.then) p.then(unmute, unmute); else unmute();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(ev =>
    document.addEventListener(ev, onGesture, { capture: true, passive: true }));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) SETS.forEach(S => { S.needRelock = true; });   // the journey may run on without us
    tick();
    // Returning to the tab is a natural moment to pick up folder changes.
    if (!document.hidden && Date.now() - lastScan > RESCAN_MIN_MS) rescan();
  });

  /* ================= lyrics overlay ================= */

  let lyricEl = null, lyricKey = '';

  function lyricsElement() {
    if (lyricEl && lyricEl.isConnected) return lyricEl;
    const tag = document.querySelector('.atc-scope-tag');
    if (!tag || !tag.parentElement) return null;
    lyricEl = document.createElement('div');
    lyricEl.className = 'atc-lyrics on';
    lyricEl.setAttribute('aria-live', 'polite');
    // Each field holds two stacked layers so one line can morph into the next.
    const two = '<span class="lyr-layer in"></span><span class="lyr-layer"></span>';
    lyricEl.innerHTML = '<div class="atc-lyr-mn" lang="mn-Mong">' + two + '</div>' +
      '<div class="atc-lyr-text"><div class="atc-lyr-cyr" lang="mn-Cyrl">' + two + '</div><div class="atc-lyr-en" lang="en">' + two + '</div></div>';
    tag.parentElement.appendChild(lyricEl);
    return lyricEl;
  }

  // Letter scramble (Cyrillic and English): each character flickers through
  // random letters of its own alphabet and settles into the new text, roughly
  // left to right; morphing to '' scrambles the letters away. Spaces hold
  // still so word shapes stay readable; the mono font keeps the width steady.
  const SCRAMBLE_MS = 700;
  const GLYPHS = {
    cyr: 'АБВГДЕЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЭЮЯабвгдежзийклмноөпрстуүфхцчшэюя',
    en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  };
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function scrambleTo(field, text, glyphs) {
    const layer = field.querySelector('.lyr-layer');
    cancelAnimationFrame(field._scr);
    const from = field._text != null ? field._text : layer.textContent;
    field._text = text;
    if (from === text) { layer.textContent = text; return; }
    if (reduceMotion) { layer.textContent = text; return; }
    const n = Math.max(from.length, text.length);
    // when each character settles, as a fraction of the run
    const settle = Array.from({ length: n }, (_, i) => 0.25 + 0.55 * (i / Math.max(1, n - 1)) + Math.random() * 0.2);
    const start = settle.map(s => s * 0.3 * Math.random());           // when it starts flickering
    const rnd = () => glyphs[(Math.random() * glyphs.length) | 0];
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / SCRAMBLE_MS);
      let s = '';
      for (let i = 0; i < n; i++) {
        const a = from[i] || '', b = text[i] || '';
        if (p >= settle[i]) s += b;                                    // settled (or gone)
        else if (p < start[i]) s += a;                                 // not started yet
        else if (a === ' ' && b === ' ') s += ' ';                     // word gaps hold
        else if (!a && !b) s += '';
        else s += rnd();                                               // flicker
      }
      layer.textContent = s.replace(/\s+$/, '');
      if (p < 1) field._scr = requestAnimationFrame(step);
      else layer.textContent = text;
    };
    field._scr = requestAnimationFrame(step);
  }

  // Blur morph (traditional Mongolian — its letters join into continuous
  // vertical strokes, so swapping single letters would break the joins): the
  // outgoing text blurs, spreads and fades while the incoming one sharpens and
  // draws together in the same place. Morphing to '' is the "out" animation.
  function morphTo(field, text) {
    const layers = field.querySelectorAll('.lyr-layer');
    const cur = field.querySelector('.lyr-layer.in') || layers[0];
    if (cur.textContent === text) return;
    const nxt = cur === layers[0] ? layers[1] : layers[0];
    nxt.textContent = text;
    nxt.className = 'lyr-layer pre';            // start blurred and spread, no transition
    void nxt.offsetWidth;                        // commit that state before animating
    nxt.className = 'lyr-layer in';
    cur.className = 'lyr-layer out';
  }

  // The line for the playing track at its current file position.
  function currentLyric() {
    const S = activeSet();
    if (!enabled || S.cur < 0 || !S.tracks[S.cur] || S.audio.paused) return null;
    const lines = S.lyrics[fileNameOf(S.tracks[S.cur])];
    if (!lines || !lines.length) return null;
    const t = S.audio.currentTime;
    let line = null;
    for (const l of lines) { if (l.t <= t + 0.05) line = l; else break; }
    return line && (line.mn || line.cyr || line.en) ? line : null;
  }

  function renderLyrics() {
    const line = currentLyric();
    const key = line ? line.t + '|' + line.mn + '|' + line.cyr + '|' + line.en : '';
    if (key === lyricKey) return;
    lyricKey = key;
    const el = lyricsElement();
    if (!el) { lyricKey = ''; return; }
    // Each field changes to the new line — or to nothing, when the line ends:
    // letters scramble for Cyrillic and English, the joined Mongolian blurs.
    morphTo(el.querySelector('.atc-lyr-mn'), line ? line.mn : '');
    scrambleTo(el.querySelector('.atc-lyr-cyr'), line ? line.cyr : '', GLYPHS.cyr);
    scrambleTo(el.querySelector('.atc-lyr-en'), line ? line.en : '', GLYPHS.en);
  }

  /* ================= lyric timing tool (Shift+L) ================= */

  // Plays the track from the start on its own (the journey pauses); Space
  // stamps the moment each line starts, Backspace undoes, Esc finishes. The
  // result is the same .txt with a "• Time: m:ss.ss" line before each lyric
  // line — downloaded and copied to the clipboard, to replace the original.
  let timing = null;

  // Sung lines of a raw .txt, with the index of the raw line each starts on.
  function lineStarts(text) {
    const rows = String(text).split(/\r?\n/);
    const starts = [];
    let cur = null;
    rows.forEach((rowText, i) => {
      const l = rowText.trim();
      if (!l || l.startsWith('#')) return;
      const m = l.match(LYR_FIELD);
      if (!m) { cur = null; return; }          // heading
      const kind = m[1].toLowerCase();
      if (kind === 'time') return;             // re-timing replaces these
      const key = /^(mongolian|traditional|script)/.test(kind) ? 'mn' : kind === 'cyrillic' ? 'cyr' : kind === 'english' ? 'en' : null;
      if (!cur || (key && cur[key]) || (cur.en && key !== 'en')) {
        cur = { row: i, mn: '', cyr: '', en: '' };
        starts.push(cur);
      }
      if (key) cur[key] = m[2].trim();
    });
    return { rows, starts };
  }

  function fmtTime(t) {
    const m = Math.floor(t / 60), sec = t - m * 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2);
  }

  function timingPanel() {
    let p = document.getElementById('atcLyricTiming');
    if (p) return p;
    const tag = document.querySelector('.atc-scope-tag');
    if (!tag || !tag.parentElement) return null;
    p = document.createElement('div');
    p.id = 'atcLyricTiming';
    p.className = 'atc-lyr-timing';
    tag.parentElement.appendChild(p);
    return p;
  }

  function drawTiming(msg) {
    const p = timingPanel();
    if (!p || !timing) return;
    const i = timing.stamps.length, n = timing.starts.length;
    const next = timing.starts[i];
    const esc = v => String(v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    p.innerHTML =
      '<div class="t-head">LYRIC TIMING · ' + esc(fmtTime(timing.audio.currentTime || 0)) + ' · line ' + Math.min(i + 1, n) + '/' + n + '</div>' +
      (next ? '<div class="t-next">' + esc(next.cyr || next.en || next.mn) + '</div><div class="t-sub">' + esc(next.en && next.cyr ? next.en : '') + '</div>'
            : '<div class="t-next">All lines stamped — press Esc to save</div>') +
      '<div class="t-keys">' + esc(msg || 'Space: line starts now · Backspace: undo · Esc: finish') + '</div>';
  }

  function startTiming() {
    const S = MAIN;
    const t = S.tracks[S.cur >= 0 ? S.cur : 0];
    const p = timingPanel();
    if (!t || !p) return;
    const raw = lyricsRaw[fileNameOf(t)];
    if (!raw) {
      p.innerHTML = '<div class="t-head">LYRIC TIMING</div><div class="t-next">No lyrics file found</div><div class="t-keys">Add a .txt next to the track with the same name, then reload</div>';
      p.classList.add('on');
      setTimeout(() => p.classList.remove('on'), 5000);
      return;
    }
    const { rows, starts } = lineStarts(raw.text);
    const fm = window.flightMap;
    if (fm && fm.isAnimating && fm.pauseAnimation) fm.pauseAnimation();
    const audio = new Audio(t.url);
    audio.volume = VOLUME;
    timing = { file: fileNameOf(t), rows, starts, stamps: [], audio, raf: 0 };
    audio.play().catch(() => {});
    p.classList.add('on');
    const loop = () => { if (!timing) return; drawTiming(); timing.raf = requestAnimationFrame(loop); };
    loop();
  }

  function finishTiming() {
    if (!timing) return;
    const tm = timing;
    timing = null;
    cancelAnimationFrame(tm.raf);
    tm.audio.pause();
    const p = timingPanel();
    if (!tm.stamps.length) { if (p) p.classList.remove('on'); return; }
    // Rebuild the text: drop old Time lines, add one before each stamped line.
    const rows = tm.rows.slice();
    const insertAt = new Map();
    tm.starts.forEach((st, i) => { if (i < tm.stamps.length) insertAt.set(st.row, tm.stamps[i]); });
    const out = [];
    rows.forEach((row, i) => {
      const m = row.trim().match(LYR_FIELD);
      if (m && m[1].toLowerCase() === 'time') return;
      if (insertAt.has(i)) out.push('• Time: ' + fmtTime(insertAt.get(i)));
      out.push(row);
    });
    const text = out.join('\n');
    const name = tm.file.replace(AUDIO_EXT, '.txt');
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    } catch (e) { /* download blocked */ }
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) { /* clipboard blocked */ }
    if (p) {
      p.innerHTML = '<div class="t-head">LYRIC TIMING · saved ' + tm.stamps.length + '/' + tm.starts.length + ' lines</div>' +
        '<div class="t-next">Downloaded “' + name.replace(/[&<>]/g, '') + '” (also on the clipboard)</div>' +
        '<div class="t-keys">Replace the .txt in the music folder with it, then reload</div>';
      setTimeout(() => p.classList.remove('on'), 9000);
    }
  }

  document.addEventListener('keydown', e => {
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (typing) return;
    if (e.shiftKey && (e.key === 'L' || e.key === 'l')) { e.preventDefault(); if (timing) finishTiming(); else startTiming(); return; }
    if (!timing) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (timing.stamps.length < timing.starts.length) timing.stamps.push(timing.audio.currentTime);
    } else if (e.code === 'Backspace') {
      e.preventDefault();
      timing.stamps.pop();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      finishTiming();
    }
  }, true);

  /* ================= playbar button ================= */

  const NOTE = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
             + '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
  const NOTE_OFF = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
             + '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

  function syncButton() {
    const btn = document.getElementById('atcMusicBtn');
    if (!btn) return;
    const S = activeSet();
    btn.style.display = (MAIN.tracks.length || J2L.tracks.length) ? '' : 'none';
    btn.innerHTML = enabled ? NOTE : NOTE_OFF;   // icon only; name lives in aria-label/title
    btn.setAttribute('aria-label', 'Music');
    btn.classList.toggle('atc-pb-on', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
    const a = S.cur >= 0 && S.tracks[S.cur] ? an.get(S.tracks[S.cur].url) : null;
    const prefix = S === J2L ? 'J2L III — ' : '';
    let title;
    if (!enabled) title = 'Music off — click to turn on';
    else if (!S.tracks.length) title = prefix + 'no music: add tracks to ' + S.dir + '. Click to mute';
    else if (blocked) title = 'Click anywhere to start the music';
    else if (S.cur >= 0 && S.tracks[S.cur]) {
      title = prefix + 'Now playing: ' + S.tracks[S.cur].name + (a ? ' · ' + a.bpm + ' BPM' : '') +
              (wasActive && S.synced ? ' — speed follows the rhythm' : '') + '. Click to mute';
    }
    else if (!S.ready && S.synced) title = prefix + 'Music on — analysing the rhythm… Click to mute';
    else title = prefix + 'Music on — plays with the journey. Click to mute';
    btn.title = title;
    syncChorusButton();
  }

  const LOOP_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
             + '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>';

  function syncChorusButton() {
    const btn = document.getElementById('atcChorusBtn');
    if (!btn) return;
    // Only meaningful for the beat-synced main soundtrack.
    btn.style.display = (MAIN.tracks.length && !j2lMode()) ? '' : 'none';
    btn.classList.toggle('atc-pb-on', chorusOn);
    btn.setAttribute('aria-pressed', String(chorusOn));
    const tl = MAIN.timeline;
    const len = tl ? ' (journey ≈ ' + Math.round(tl.end) + ' s)' : '';
    btn.title = chorusOn
      ? 'Chorus repeats on: the music is extended by replaying each chorus, so the journey runs at a relaxed pace' + len + '. Click to fit the journey to the music as-is'
      : 'Chorus repeats off: the journey is sped up to fit the music as-is' + len + '. Click to extend the music by repeating its chorus';
  }

  function buildChorusButton() {
    if (document.getElementById('atcChorusBtn')) return true;
    const bar = document.querySelector('.atc-playbar');
    const music = document.getElementById('atcMusicBtn');
    if (!bar || !music) return false;
    const btn = document.createElement('button');
    btn.id = 'atcChorusBtn';
    btn.className = 'atc-pb-btn atc-pb-icon atc-pb-chorus';
    btn.type = 'button';
    btn.innerHTML = LOOP_ICON;
    btn.setAttribute('aria-label', 'Chorus repeats');
    btn.addEventListener('click', () => {
      chorusOn = !chorusOn;
      try { localStorage.setItem(CHORUS_KEY, chorusOn ? 'on' : 'off'); } catch (e) { /* private mode */ }
      MAIN.timeline = null;                    // re-plan and re-fit…
      MAIN.needRelock = true;                  // …and re-align to the journey
      tick();
      syncChorusButton();
    });
    bar.insertBefore(btn, music.nextSibling);
    syncChorusButton();
    return true;
  }

  function buildButton() {
    if (document.getElementById('atcMusicBtn')) return true;
    const bar = document.querySelector('.atc-playbar');
    if (!bar) return false;
    const btn = document.createElement('button');
    btn.id = 'atcMusicBtn';
    btn.className = 'atc-pb-btn atc-pb-music';
    btn.type = 'button';
    btn.addEventListener('click', () => {
      enabled = !enabled;
      if (enabled) SETS.forEach(S => { S.needRelock = true; });   // the journey ran on while muted
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* private mode */ }
      syncButton();
      tick();
    });
    // Sit with the playback controls: before the theme button if it is
    // already there (♫ then ☾), otherwise ahead of the LEG readout.
    const anchor = bar.querySelector('#atcThemeBtn') || bar.querySelector('#atcPlaybarStatus');
    bar.insertBefore(btn, anchor || null);
    syncButton();
    return true;
  }

  /* ================= init ================= */

  function init() {
    // The playbar is built by atc-skin.js after flightMap initialises.
    if (!(buildButton() && buildChorusButton())) {
      let tries = 0;
      const t = setInterval(() => {
        if ((buildButton() && buildChorusButton()) || ++tries > 40) clearInterval(t);
      }, 250);
    }
    rescan();
    setInterval(tick, 100);

    const info = S => ({
      tracks: S.tracks.map(t => t.name),
      nowPlaying: S.cur >= 0 && S.tracks[S.cur] ? S.tracks[S.cur].name : null,
      ready: S.ready,
      analysis: S.tracks.map(t => { const a = an.get(t.url); return a ? { name: t.name, seconds: +a.d.toFixed(1), bpm: a.bpm, chorus: a.chorus, plannedSeconds: S.plans[S.tracks.indexOf(t)] ? +S.plans[S.tracks.indexOf(t)].dur.toFixed(1) : null } : { name: t.name }; })
    });
    window._atcMusic = {
      get mode() { return j2lMode() ? 'j2l' : 'main'; },
      get main() { return info(MAIN); },
      get j2l() { return info(J2L); },
      // The playlist of the mode on screen:
      get tracks() { return info(activeSet()).tracks; },
      get nowPlaying() { return info(activeSet()).nowPlaying; },
      get ready() { return activeSet().ready; },
      get analysis() { return info(activeSet()).analysis; },
      get chorusRepeats() { return chorusOn; },
      // debugging: the active playlist's player and plan position
      debug: { audio: () => activeSet().audio, seg: () => activeSet().seg, plan: () => activeSet().plans[activeSet().cur], walk: k => walk(activeSet(), window.flightMap.cities, k), speedK: () => activeSet().speedK },
      get timelineSeconds() { const tl = buildTimeline(activeSet()); return tl ? +tl.end.toFixed(1) : null; },
      get playlistSeconds() { const S = activeSet(); buildTimeline(S); return +S.total.toFixed(1); },
      get position() { return +currentV(activeSet()).toFixed(2); },
      tail(n) { const tl = buildTimeline(activeSet()); if (!tl) return null; const N = tl.T.length - 1; const o = []; for (let k = Math.max(1, N - n); k <= N; k++) o.push(k + ':' + tl.T[k].toFixed(2) + '+' + tl.D[k].toFixed(2)); return o.join(' '); },
      slot(k) { const tl = buildTimeline(activeSet()); return tl && k > 0 && k < tl.T.length ? { start: +tl.T[k].toFixed(3), dur: +tl.D[k].toFixed(3) } : null; },
      // Rhythmic activity 0..1 at song time V (debugging / tuning).
      activityAt: V => +envAt(activeSet(), V).toFixed(3),
      director,
      rescan
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

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
// Pick 1x/10x/20x/100x on the speed button for manual speed; the music then
// just plays alongside (scrubbing still seeks it to the timeline position).
// J2L III has no BEAT step: its speed button is manual only.
//
// Browsers refuse to start audio before the visitor has interacted with the
// page, and the journey autostarts. Until then the journey runs at 1x on its
// own; the first click/key/tap starts the music at the journey's current
// point. The MUSIC button mutes both playlists.
(function () {
  'use strict';

  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
  const KEY = 'atc-music';
  const AN_KEY = 'atc-music-an-v3:';     // bump when the analysis changes
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

  async function rescan() {
    lastScan = Date.now();
    await Promise.all(SETS.map(async S => {
      const list = await scan(S.dir);
      if (!list) return;
      const sig = l => l.map(t => t.url + '|' + t.size).join('\n');
      if (sig(list) !== sig(S.tracks)) setTracks(S, list);
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
      return { d: o.d, bpm: o.bpm, env: Float32Array.from(o.env, v => v / 1000) };
    } catch (e) { return null; }
  }

  function saveCached(k, a) {
    try {
      localStorage.setItem(AN_KEY + k, JSON.stringify({
        d: a.d, bpm: a.bpm,
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
  function analyse(ab) {
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
    return { d, bpm: Math.round(60 / (bestLag * HOP_S)), env };
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
      const k = await fileKey(t);
      keys.add(k);
      if (an.has(t.url) && an.get(t.url).key === k) continue;
      let a = loadCached(k);
      if (!a) {
        try { a = analyse(await decode(t.url)); saveCached(k, a); }
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
    S.starts = []; S.total = 0;
    for (const t of S.tracks) { S.starts.push(S.total); S.total += an.get(t.url).d; }
    S.timeline = null;
    S.ready = S.tracks.length > 0 && S.total > 0;
    S.needRelock = true;
    S.keys = keys;
    S.analysedOnce = true;
    prune();
    syncButton();
  }

  /* ================= playlist clock ================= */

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
    const t = S.pendingSeek != null ? S.pendingSeek : S.audio.currentTime;
    return S.loop * S.total + S.starts[S.cur] + (t || 0);
  }

  function envAt(S, V) {
    const L = locate(S, V);
    if (!L) return 0;
    const a = an.get(S.tracks[L.i].url);
    const x = L.t * ENV_HZ;
    const j = Math.max(0, Math.min(a.env.length - 1, Math.floor(x)));
    const k = Math.min(a.env.length - 1, j + 1);
    return a.env[j] + (a.env[k] - a.env[j]) * (x - Math.floor(x));
  }

  // Sparse → 1x, busiest → 100x, on an exponential curve so the middle of a
  // song sits around 5–25x rather than racing.
  function speedAt(S, V) {
    return Math.pow(SPEED_MAX, Math.pow(envAt(S, V), 1.5));
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
  function buildTimeline(S) {
    const fm = window.flightMap;
    if (!S.ready || !fm || !fm.cities || fm.cities.length < 2) return null;
    const key = S.label + '|' + fm.cities.length + '|' + S.total.toFixed(3);
    if (S.timeline && S.timeline.key === key) return S.timeline;
    const N = fm.cities.length;
    const T = new Float64Array(N + 1), D = new Float64Array(N + 1);
    let V = 0;
    for (let k = 1; k < N; k++) {
      T[k] = V;
      D[k] = legMs(legBase(fm.cities[k - 1], fm.cities[k]), speedAt(S, V)) / 1000;
      V += D[k] + pauseMs(speedAt(S, V + D[k])) / 1000;
    }
    T[N] = V;
    S.timeline = { key, T, D, end: V };
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

  function load(S, i, localT) {
    S.cur = i;
    S.pendingSeek = localT || 0;
    S.audio.src = S.tracks[i].url;
    S.audio.load();
  }

  function seekV(S, V) {
    const L = locate(S, Math.max(0, V));
    if (!L) return;
    S.loop = L.loop;
    if (S.cur !== L.i || !S.audio.currentSrc) { load(S, L.i, L.t); return; }
    try { S.audio.currentTime = L.t; S.pendingSeek = null; } catch (e) { S.pendingSeek = L.t; }
  }

  SETS.forEach(S => {
    S.audio.addEventListener('loadedmetadata', () => {
      if (S.pendingSeek == null) return;
      try { S.audio.currentTime = S.pendingSeek; } catch (e) { /* ignore */ }
      S.pendingSeek = null;
    });
    S.audio.addEventListener('ended', () => {
      if (!S.tracks.length) return;
      let i = S.cur + 1;
      if (i >= S.tracks.length) { i = 0; S.loop++; }
      load(S, i, 0);
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

  function fadeTo(S, target, done) {
    clearInterval(S.fadeTimer);
    const a = S.audio, from = a.volume, t0 = performance.now();
    S.fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
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

  function stop(S) {
    if (S.fadingOut) return;
    S.fadingOut = true;
    fadeTo(S, 0, () => {
      S.fadingOut = false;
      // Re-check: play may have been pressed again during the fade.
      if (!shouldPlay(S)) S.audio.pause();
    });
  }

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
        if (blocked) continue;
        const tl = S.synced && S.ready ? buildTimeline(S) : null;
        if (tl && (S.needRelock || S.cur < 0)) {
          // Join the journey where it is.
          seekV(S, journeyV(S));
          S.needRelock = false;
        } else if (S.cur < 0) {
          S.loop = 0;
          load(S, 0, 0);                       // plain playlist, or not analysed yet
        }
        if (S.audio.paused || S.fadingOut) play(S);
      } else if (!S.audio.paused) {
        stop(S);
      }
    }

    // Speed readout follows the music while it drives.
    const act = director.active();
    if (fm) {
      if (act) fm.speedMultiplier = Math.max(1, Math.round(speedAt(activeSet(), currentV(activeSet()))));
      else if (wasActive && fm.beatMode !== false) fm.speedMultiplier = 1;
    }
    if (act !== wasActive) { wasActive = act; syncButton(); }
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
    if (!buildButton()) {
      let tries = 0;
      const t = setInterval(() => {
        if (buildButton() || ++tries > 40) clearInterval(t);
      }, 250);
    }
    rescan();
    setInterval(tick, 100);

    const info = S => ({
      tracks: S.tracks.map(t => t.name),
      nowPlaying: S.cur >= 0 && S.tracks[S.cur] ? S.tracks[S.cur].name : null,
      ready: S.ready,
      analysis: S.tracks.map(t => { const a = an.get(t.url); return a ? { name: t.name, seconds: +a.d.toFixed(1), bpm: a.bpm } : { name: t.name }; })
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
      get timelineSeconds() { const tl = buildTimeline(activeSet()); return tl ? +tl.end.toFixed(1) : null; },
      get position() { return +currentV(activeSet()).toFixed(2); },
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

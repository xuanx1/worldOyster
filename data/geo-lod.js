// World-map level of detail.
//
// The same Natural Earth admin-0 outline is drawn by two very different
// renderers — the orthographic globe on a 2D canvas (atc-scope.js) and the
// Leaflet vector layers (cost-choropleth.js, unvisited-neighbors.js) — and
// both want more coastline as they zoom in. Rather than ship one file sized
// for the deepest zoom, we ship three tiers and step along them.
//
// Tiers live in asset/geo/ and are built by tools/build-geo-lod.py, which
// strips Natural Earth's 168 properties down to the three anything reads
// (NAME, SOVEREIGNT, ADMIN) and quantises coordinates to 3dp:
//
//     110m    0.20 MB     177 features     10,593 vertices
//      50m    1.68 MB     242 features     99,595 vertices
//      10m    9.12 MB     258 features    547,175 vertices
//
// Only 110m is loaded up front. The finer tiers are fetched the first time a
// zoom actually calls for them, so a visitor who never zooms never pays for
// them, and `force-cache` keeps a revisit free.
(function (window) {
    'use strict';

    // Coarse -> fine. Mirrors TIERS in tools/build-geo-lod.py.
    var ORDER = ['110m', '50m', '10m'];
    var BASE = 'asset/geo/world-';

    // Zoom thresholds, tested coarsest-last so the first match wins.
    //
    // Set from measured vertex spacing rather than taste. Median segment
    // length per tier is 62.8 km (110m), 7.96 km (50m) and 1.69 km (10m); a
    // tier has nothing left to give once its median segment is drawn shorter
    // than about two pixels. On the scope, screen scale is
    // 0.46 * min(w,h) * zoom / 6371 px per km, so for a 900 px viewport:
    //
    //     110m  saturates near zoom 0.5     50m  near zoom 3.9
    //      10m  saturates near zoom 18, past the scope's maxZoom of 12
    //
    // 110m therefore only holds the default view (and first paint); anything
    // that counts as zooming in has earned 50m, and 4x has earned 10m.
    var SCOPE_STEPS = [[4.0, '10m'], [1.2, '50m']];

    // Leaflet scale is 256 * 2^z / 40075 px per km, which puts 110m's limit at
    // about z2.5 and 50m's at about z5.5. Both maps here top out at z5-6, so
    // 50m is genuinely the last tier that buys anything — 10m would not pay
    // for itself before their maxZoom.
    //
    // It is also the last tier that *fits*: the choropleth and neighbours maps
    // each render the world three times over (at -360/0/+360, so shapes
    // survive a pan across the antimeridian), and 547k vertices tripled into
    // SVG paths is far past where that renderer stays interactive.
    var LEAFLET_STEPS = [[3.0, '50m']];

    var loaded = {};    // tier -> parsed GeoJSON
    var inflight = {};  // tier -> Promise

    function url(tier) { return BASE + tier + '.geojson'; }

    // Resolve a tier, at most once. Repeat callers share the in-flight promise.
    function load(tier) {
        if (ORDER.indexOf(tier) === -1) return Promise.reject(new Error('unknown geo tier: ' + tier));
        if (loaded[tier]) return Promise.resolve(loaded[tier]);
        if (inflight[tier]) return inflight[tier];

        var p = fetch(url(tier), { cache: 'force-cache' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url(tier));
                return r.json();
            })
            .then(function (geo) {
                loaded[tier] = geo;
                delete inflight[tier];
                return geo;
            })
            .catch(function (err) {
                delete inflight[tier];
                throw err;
            });

        inflight[tier] = p;
        return p;
    }

    // Already-resolved tier, or null. Lets a caller redraw synchronously
    // instead of waiting on a fetch it may not need.
    function peek(tier) { return loaded[tier] || null; }

    // Best tier at or below `tier` that is already in memory. Used to keep
    // drawing something sensible while a finer tier is still downloading.
    function bestLoaded(tier) {
        for (var i = ORDER.indexOf(tier); i >= 0; i--) {
            if (loaded[ORDER[i]]) return ORDER[i];
        }
        return null;
    }

    function pick(steps, zoom) {
        for (var i = 0; i < steps.length; i++) {
            if (zoom >= steps[i][0]) return steps[i][1];
        }
        return ORDER[0];
    }

    function isFinerThan(a, b) { return ORDER.indexOf(a) > ORDER.indexOf(b); }

    window.GeoLOD = {
        ORDER: ORDER,
        url: url,
        load: load,
        peek: peek,
        bestLoaded: bestLoaded,
        isFinerThan: isFinerThan,
        // Tier the orthographic globe wants at this radius multiplier.
        scopeTier: function (zoom) { return pick(SCOPE_STEPS, zoom); },
        // Tier a Leaflet map wants at this zoom level.
        leafletTier: function (zoom) { return pick(LEAFLET_STEPS, zoom); }
    };
})(window);

#!/usr/bin/env python3
"""Build real-world geometry for every land leg in data/land-journey.csv.

The map draws all journeys as great-circle arcs (createGreatCirclePath in
animated-flight-map.js). That is right for flights and wrong for everything on
the ground: a train from Moscow to St Petersburg does not fly, it follows the
October Railway. This script fetches the actual line each leg travels and
caches it in data/land-routes.json so the renderer can use it offline.

Routing is BRouter (https://brouter.de), which is keyless, global, and — unlike
OSRM or the OpenRouteService free tier — ships a rail profile. Profiles used:

    car, taxi, bus   car-fast      roads
    train, metro     rail          railway=rail / subway
    ferry            river         navigable water
    walk             hiking-beta   footpaths

Endpoint snapping is the wrinkle. BRouter routes between the nearest routable
ways to the coordinates it is given, and a city centre is often nowhere near
track or water: Osaka -> Nara on the rail profile returns "no track found"
straight from CITY_COORDINATES. So rail and ferry legs resolve each city to a
real station or terminal via Overpass first, and those lookups are cached in
data/land-routes.snap.json to keep re-runs cheap.

Both caches are keyed and resumable — an interrupted run picks up where it
stopped, and legs already present are skipped. Failures are recorded rather
than retried forever; the renderer falls back to the great-circle arc for any
leg missing from the cache.

Usage:  python tools/build-land-routes.py [--limit N] [--modes train,ferry]
                                          [--refetch] [--epsilon 0.0005]
"""

import argparse
import csv
import itertools
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Optional: sea routing for crossings OSM has no ferry way for (cruises, long
# open-water hops). pip install searoute — the script degrades to a straight
# line without it.
try:
    import searoute as _searoute
except ImportError:
    _searoute = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, 'data', 'land-journey.csv')
CITIES_JS = os.path.join(ROOT, 'data', 'cities.js')
OUT_PATH = os.path.join(ROOT, 'data', 'land-routes.json')
SNAP_PATH = os.path.join(ROOT, 'data', 'land-routes.snap.json')

# Point at a locally-run BRouter (see tools/README-land-routes.md) with
# BROUTER_URL=http://127.0.0.1:17777/brouter — the public server throttles
# hard by IP and cannot carry a full rebuild.
BROUTER = os.environ.get('BROUTER_URL', 'https://brouter.de/brouter')
LOCAL = '127.0.0.1' in BROUTER or 'localhost' in BROUTER
OVERPASS = 'https://overpass-api.de/api/interpreter'
UA = 'worldOyster-land-routes/1.0 (personal travel map; contact via repo)'

# Mode -> BRouter profile. Modes absent here keep their great-circle arc.
PROFILE = {
    'car': 'car-fast',
    'taxi': 'car-fast',
    'bus': 'car-fast',
    'train': 'rail',
    'metro': 'rail',
    'ferry': 'river',
    'walk': 'trekking' if LOCAL else 'hiking-beta',
}

# Modes whose endpoints must be snapped to infrastructure before routing, and
# the Overpass selectors that find it. Roads and footpaths reach almost every
# city centre, so they are left alone.
# Subway stations are excluded deliberately: they sit on railway=subway ways,
# which the rail profile will not route over, so snapping Kyoto to its metro
# put the leg on an island of track and returned "no track found".
SNAP_QUERY = {
    'rail': ['node[railway=station][station!=subway][subway!=yes]',
             'node[railway=halt]',
             'way[railway=station][station!=subway][subway!=yes]'],
    'river': ['node[amenity=ferry_terminal]', 'way[amenity=ferry_terminal]',
              'node[harbour=yes]'],
}

# Extra routing sources, tried before BRouter for the profiles they cover.
# Only BRouter does rail, so trains and ferries have no alternative here.
OSRM_SOURCES = {
    'car-fast': ['http://router.project-osrm.org/route/v1/driving',
                 'http://routing.openstreetmap.de/routed-car/route/v1/driving'],
    'hiking-beta': ['http://routing.openstreetmap.de/routed-foot/route/v1/driving'],
    'trekking': ['http://routing.openstreetmap.de/routed-foot/route/v1/driving'],
}

# Legs no router will do end to end, because the real journey changes trains
# at a border. Singapore -> Kuala Lumpur is the KTM Shuttle Tebrau from
# Woodlands Train Checkpoint to JB Sentral, then a second train to KL Sentral;
# routed as one hop it returns "no track found" for every station pair, since
# the causeway link is not continuous track in OSM. 'from'/'to' override the
# snapped endpoints, 'via' are intermediate waypoints. All (lat, lng).
VIA = {
    ('Singapore', 'Kuala Lumpur', 'rail'): {
        'from': (1.4436, 103.7688),      # Woodlands Train Checkpoint
        'via': [(1.4633, 103.7649)],     # JB Sentral — the shuttle terminates here
        'to': (3.1344, 101.6864),        # KL Sentral
    },
    ('Como', 'Chiasso', 'rail'): {
        'from': (45.8095, 9.0733),       # Como San Giovanni
        'to': (45.8317, 9.0355),         # Chiasso
    },
    ('Chiasso', 'Como', 'rail'): {
        'from': (45.8317, 9.0355),
        'to': (45.8095, 9.0733),
    },
    ('Kuala Lumpur', 'Singapore', 'rail'): {
        'from': (3.1344, 101.6864),
        'via': [(1.4633, 103.7649)],
        'to': (1.4436, 103.7688),
    },
}

OSRM_DELAY = 0.4         # OSRM is far more tolerant than BRouter
BROUTER_DELAY = 0.0 if LOCAL else 3.0   # a local server needs no politeness delay
OVERPASS_DELAY = 1.2     # Overpass asks for a slower hand
MAX_RETRIES = 3
SNAP_BATCH = 25          # cities per batched Overpass query
SAVE_EVERY = 20          # legs between cache writes
MAX_DETOUR = 6.0         # reject a route this many times the direct distance
FERRY_SNAP = 65.0        # km a ferry way's end may sit from the city it serves

# BRouter answers these itself — the request worked, the route does not exist.
# Retrying the identical query only burns time, so fail out immediately.
DEFINITIVE = ('no track found', 'not found', 'target island',
              'memory limit', 'position not mapped')

# ...and this one means the leg is hopeless whichever endpoints we hand it, so
# there is no point walking further down the station candidate list either.
HOPELESS = ('memory limit',)

# Not our route's fault: the public server is shedding load. These legs are
# left uncached so a later run picks them up, and we slow down when we see one.
TRANSIENT = ('operation killed', 'retry later', 'too many', 'timeout')


# ── geometry ────────────────────────────────────────────────────────────────

def haversine(a, b):
    """Great-circle distance in km between (lat, lng) pairs."""
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def simplify(points, epsilon):
    """Iterative Douglas-Peucker. Routes run to thousands of points and the map
    cannot show that detail, so drop everything under epsilon degrees."""
    if len(points) < 3:
        return points[:]

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]

    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        ax, ay = points[first][1], points[first][0]
        bx, by = points[last][1], points[last][0]
        dx, dy = bx - ax, by - ay
        denom = math.hypot(dx, dy)

        worst, worst_i = -1.0, -1
        for i in range(first + 1, last):
            px, py = points[i][1], points[i][0]
            if denom == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / denom
            if d > worst:
                worst, worst_i = d, i

        if worst > epsilon and worst_i > 0:
            keep[worst_i] = True
            stack.append((first, worst_i))
            stack.append((worst_i, last))

    return [p for p, k in zip(points, keep) if k]


# ── inputs ──────────────────────────────────────────────────────────────────

def load_cities():
    """Pull CITY_COORDINATES out of cities.js without running a JS engine."""
    src = open(CITIES_JS, encoding='utf-8').read()
    out = {}
    # Match each quote style separately. A single character class cannot do it:
    # "Xi'an" is double-quoted precisely because it contains an apostrophe, and
    # ['"]([^'"]+)['"] stops dead at that apostrophe and yields "Xi", silently
    # dropping every city with a quote in its name.
    pattern = r"""(?:'([^']+)'|"([^"]+)")\s*:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]"""
    for m in re.finditer(pattern, src):
        name = m.group(1) if m.group(1) is not None else m.group(2)
        out[name] = (float(m.group(3)), float(m.group(4)))
    return out


def load_legs():
    """Unique (origin, destination, mode) triples, in first-seen order."""
    seen, legs = set(), []
    with open(CSV_PATH, encoding='utf-8', newline='') as fh:
        for row in csv.DictReader(fh):
            o = (row.get('origin') or '').strip()
            d = (row.get('destination') or '').strip()
            m = (row.get('mode') or '').strip().lower()
            if not o or not d or not m:
                continue
            key = f'{o}|{d}|{m}'
            if key in seen:
                continue
            seen.add(key)
            legs.append((key, o, d, m))
    return legs


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    return default


def save_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)

    # Windows refuses to replace a file another process holds open, and this
    # one is read by whatever is serving the map while the build runs. Retry
    # rather than lose an hour of fetching to a transient sharing violation.
    for attempt in range(6):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.5 * (attempt + 1))

    # Rename is blocked while another process holds the file open — an editor
    # with it in a tab is enough. Overwrite in place instead: Windows permits
    # that where it refuses the rename. Leaving the result in the .tmp was
    # worse than useless, since the page loads the real file and silently kept
    # serving stale routes.
    try:
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        os.remove(tmp)
    except OSError as exc:
        print(f'    ! could not update {os.path.basename(path)}: {exc}; '
              f'new copy left at {os.path.basename(tmp)}', flush=True)


# ── network ─────────────────────────────────────────────────────────────────

def http_get(url, timeout=120, data=None):
    """Fetch via curl rather than urllib.

    Python verifies TLS against certifi's bundle, which rejects this machine's
    proxy certificate ("certificate has expired"). curl uses the Windows
    certificate store and negotiates fine, so we keep verification on and shell
    out instead of falling back to an unverified context.
    """
    cmd = ['curl', '-sS', '--fail-with-body', '-m', str(timeout),
           '-H', f'User-Agent: {UA}']
    if data is not None:
        cmd += ['--data-binary', data.decode('utf-8') if isinstance(data, bytes) else data]
    cmd.append(url)

    proc = subprocess.run(cmd, capture_output=True, text=True,
                          encoding='utf-8', errors='replace',
                          timeout=timeout + 30)
    if proc.returncode != 0 and not proc.stdout:
        raise IOError(f'curl {proc.returncode}: {proc.stderr.strip()[:120]}')
    return proc.stdout


def snap(city, coord, profile, cache):
    """Ranked station / terminal candidates for a city, read from the cache.

    Returns a list of ((lat, lng), label) with the city centre always last, so
    a caller can retry when the first pick turns out to be unroutable. The
    cache is filled by snap_all() before any routing starts.
    """
    fallback = [(coord, 'centre')]
    if profile not in SNAP_QUERY:
        return fallback

    hit = cache.get(f'{city}|{profile}')
    if not hit:
        return fallback
    return [(tuple(c['coord']), c['via']) for c in hit] + fallback


def snap_all(cities_needed, profile, coords, cache):
    """Fill the snap cache for many cities at once.

    One Overpass query costs about 33 seconds almost regardless of how much is
    asked of it — 15 cities in a single union came back in the same time as a
    single city on its own. Per-city queries therefore dominated the whole
    build (hours of it), so every city that still needs snapping goes up
    together in batches.

    Stations come back as one undifferentiated list, so each is assigned to
    whichever requested city it is closest to. Candidates whose name matches
    the city sort ahead of merely close ones: Kyoto's nearest station node is a
    minor Keihan stop on track the rail profile will not enter, while Kyoto
    Station a little further out routes fine.
    """
    label = 'station' if profile == 'rail' else 'terminal'
    pending = [c for c in cities_needed if f'{c}|{profile}' not in cache]
    if not pending:
        return

    print(f'  snapping {len(pending)} cities to nearest {label}...', flush=True)

    for radius in (15000, 45000):
        if not pending:
            break
        found_any = []

        for start in range(0, len(pending), SNAP_BATCH):
            chunk = [c for c in pending[start:start + SNAP_BATCH] if c in coords]
            if not chunk:
                continue
            parts = ''.join(
                f'{sel}(around:{radius},{coords[c][0]},{coords[c][1]});'
                for c in chunk for sel in SNAP_QUERY[profile]
            )
            query = f'[out:json][timeout:180];({parts});out center;'

            elements, ok = [], False
            # Overpass sheds load by closing the connection or returning an
            # empty body rather than a status code, so back off and try again.
            for attempt in range(MAX_RETRIES):
                try:
                    time.sleep(OVERPASS_DELAY * (1 + attempt * 2))
                    raw = http_get(OVERPASS, timeout=300,
                                   data=urllib.parse.urlencode({'data': query}).encode())
                    elements = json.loads(raw).get('elements', [])
                    ok = True
                    break
                except Exception as exc:               # noqa: BLE001 - log and retry
                    if attempt == MAX_RETRIES - 1:
                        print(f'    ! overpass batch: {exc}', flush=True)
            if not ok:
                continue   # leave these cities pending; a later run retries

            # Assign every returned station to its closest requested city.
            buckets = {c: [] for c in chunk}
            limit_km = radius / 1000.0
            for el in elements:
                c = el.get('center') or el
                if 'lat' not in c or 'lon' not in c:
                    continue
                cand = (float(c['lat']), float(c['lon']))
                near, near_d = None, limit_km
                for city in chunk:
                    d = haversine(coords[city], cand)
                    if d <= near_d:
                        near, near_d = city, d
                if not near:
                    continue
                tags = el.get('tags') or {}
                names = ' '.join(filter(None, (tags.get('name'), tags.get('name:en'))))
                buckets[near].append((names, near_d, cand))

            for city, hits in buckets.items():
                if not hits:
                    continue
                wanted = re.sub(r'[^a-z]', '', city.lower())
                scored = sorted(
                    ((0 if wanted and wanted in re.sub(r'[^a-z]', '', n.lower()) else 1, d, c)
                     for n, d, c in hits),
                    key=lambda s: (s[0], s[1]))
                cache[f'{city}|{profile}'] = [
                    {'coord': list(c), 'via': f'{label} {d:.1f}km'} for _, d, c in scored[:4]
                ]
                found_any.append(city)

            save_json(SNAP_PATH, cache)
            print(f'    batch {start // SNAP_BATCH + 1}: {len(elements)} nodes, '
                  f'{len(found_any)} cities placed (r={radius // 1000}km)', flush=True)

        pending = [c for c in pending if f'{c}|{profile}' not in cache]

    # Whatever is still unplaced has genuinely nothing nearby; record that so
    # later runs do not re-query, and let those legs route from the centre.
    for city in pending:
        cache[f'{city}|{profile}'] = None
    save_json(SNAP_PATH, cache)


def fetch_osrm(base, a, b):
    """OSRM geometry as [[lat, lng], ...] plus route distance in km.

    Served over plain http deliberately: this machine's TLS stack cannot
    complete a handshake with these hosts ("schannel: SEC_E_ILLEGAL_MESSAGE"),
    while http answers fine. Nothing secret is exchanged — a pair of public
    coordinates out, public road geometry back.
    """
    url = (f'{base}/{a[1]:.6f},{a[0]:.6f};{b[1]:.6f},{b[0]:.6f}'
           f'?overview=full&geometries=geojson')
    raw = http_get(url, timeout=90)
    doc = json.loads(raw)
    if doc.get('code') != 'Ok' or not doc.get('routes'):
        raise ValueError(doc.get('message') or doc.get('code') or 'no route')
    route = doc['routes'][0]
    pts = [[round(c[1], 5), round(c[0], 5)] for c in route['geometry']['coordinates']]
    return pts, float(route.get('distance', 0)) / 1000.0


def fetch_ferry(a, b):
    """Ferry geometry straight from OSM route=ferry ways.

    No routing engine will cross open sea — BRouter's river profile is for
    navigable waterways and answers "target island detected" for a Baltic or
    Malacca crossing. But OSM carries the sailings themselves as ways tagged
    route=ferry, with real geometry and names like "Helsinki (FIN) - Tallinn
    (EST)". Pick the way whose ends sit closest to the two cities.
    """
    south, north = min(a[0], b[0]) - 0.4, max(a[0], b[0]) + 0.4
    west, east = min(a[1], b[1]) - 0.4, max(a[1], b[1]) + 0.4
    query = (f'[out:json][timeout:120];'
             f'way[route=ferry]({south:.3f},{west:.3f},{north:.3f},{east:.3f});out geom;')

    elements = None
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(OVERPASS_DELAY * (1 + attempt * 2))
            raw = http_get(OVERPASS, timeout=240,
                           data=urllib.parse.urlencode({'data': query}).encode())
            elements = json.loads(raw).get('elements', [])
            break
        except Exception:                              # noqa: BLE001 - retry
            continue
    if not elements:
        return None, 'overpass returned nothing'

    best, best_score = None, None
    for el in elements:
        geom = el.get('geometry') or []
        if len(geom) < 2:
            continue
        pts = [[p['lat'], p['lon']] for p in geom]
        for cand in (pts, pts[::-1]):
            d0, d1 = haversine(cand[0], a), haversine(cand[-1], b)
            if d0 > FERRY_SNAP or d1 > FERRY_SNAP:
                continue
            if best_score is None or d0 + d1 < best_score:
                best, best_score = cand, d0 + d1

    if not best:
        return None, 'no ferry way links these ports'

    km = sum(haversine(best[i - 1], best[i]) for i in range(1, len(best)))
    return (best, km), None


def fetch_searoute(a, b):
    """Maritime path for an open-water crossing, via the searoute network.

    OSM only has ferry ways where a scheduled sailing is mapped. A cruise leg
    such as Phuket -> Singapore has none, but it still follows shipping lanes
    round the peninsula rather than cutting overland, which is what a straight
    line would imply.
    """
    if _searoute is None:
        return None, 'searoute not installed (pip install searoute)'
    try:
        route = _searoute.searoute((a[1], a[0]), (b[1], b[0]), units='km')
        coords = route['geometry']['coordinates']
        if len(coords) < 2:
            return None, 'searoute returned a degenerate path'
        pts = [[round(c[1], 5), round(c[0], 5)] for c in coords]
        return (pts, float(route['properties']['length'])), None
    except Exception as exc:                           # noqa: BLE001
        return None, f'searoute failed: {exc}'


def fetch_route(a, b, profile, via=None):
    """Route geometry from whichever source can serve this profile.

    BRouter is the only one of these with a rail profile, which is why it was
    chosen — but it throttles hard by IP, and leaning on it for all 430 legs is
    what stalled the build. Road and foot legs therefore go to OSRM first and
    only fall back to BRouter, which keeps BRouter's budget for the trains.
    """
    for base in (() if via else OSRM_SOURCES.get(profile, ())):
        try:
            time.sleep(OSRM_DELAY)
            return fetch_osrm(base, a, b), None
        except (IOError, OSError, ValueError, KeyError, IndexError):
            continue   # try the next source, then BRouter

    pts_ll = [a] + list(via or []) + [b]
    lonlats = '|'.join(f'{p[1]:.6f},{p[0]:.6f}' for p in pts_ll)
    url = (f'{BROUTER}?lonlats={urllib.parse.quote(lonlats, safe=",|")}'
           f'&profile={profile}&alternativeidx=0&format=geojson')

    last = ''
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(BROUTER_DELAY * (1 + attempt))
            raw = http_get(url)
            if not raw.lstrip().startswith('{'):
                last = raw.strip()[:120]
                low = last.lower()
                # A refusal ("no track found") is a real answer, not a blip.
                if any(d in low for d in DEFINITIVE):
                    return None, last
                # Throttling. Ease off hard before trying again — hammering is
                # what provoked it, and the leg stays uncached for a later run.
                if any(t in low for t in TRANSIENT):
                    time.sleep(BROUTER_DELAY * 10 * (attempt + 1))
                continue
            feat = json.loads(raw)['features'][0]
            pts = [[round(c[1], 5), round(c[0], 5)] for c in feat['geometry']['coordinates']]
            km = float(feat['properties'].get('track-length', 0)) / 1000.0
            return (pts, km), None
        except (IOError, OSError, ValueError, KeyError) as exc:
            last = str(exc)[:120]
    return None, last or 'unknown error'


# ── main ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='stop after N new legs')
    ap.add_argument('--modes', default='', help='comma-separated modes to build')
    ap.add_argument('--refetch', action='store_true', help='ignore cached routes')
    ap.add_argument('--epsilon', type=float, default=0.0005,
                    help='Douglas-Peucker tolerance in degrees (~55 m)')
    args = ap.parse_args()

    only = {m.strip().lower() for m in args.modes.split(',') if m.strip()}
    cities = load_cities()
    legs = load_legs()
    routes = {} if args.refetch else load_json(OUT_PATH, {})
    snaps = load_json(SNAP_PATH, {})

    todo = [l for l in legs if (not only or l[3] in only) and l[0] not in routes]
    print(f'{len(legs)} unique legs, {len(routes)} cached, {len(todo)} to fetch', flush=True)

    # Snap every endpoint that needs it up front, in batches. Doing it lazily
    # per leg meant one 33-second Overpass round trip per new city, which is
    # what made the first full run project out to hours.
    by_profile = {}
    for _, origin, dest, mode in todo:
        prof = PROFILE.get(mode)
        if prof in SNAP_QUERY:
            by_profile.setdefault(prof, set()).update((origin, dest))
    for prof, names in by_profile.items():
        snap_all(sorted(n for n in names if n in cities), prof, cities, snaps)

    done = failed = skipped = 0
    for key, origin, dest, mode in todo:
        if args.limit and done + failed >= args.limit:
            break

        profile = PROFILE.get(mode)
        if not profile:
            skipped += 1
            continue
        if origin not in cities or dest not in cities:
            missing = origin if origin not in cities else dest
            print(f'  - {key}: no coordinates for {missing}', flush=True)
            skipped += 1
            continue

        # Ferries come from OSM's own sailing ways, not from a router.
        if mode == 'ferry':
            ferry, ferr = fetch_ferry(cities[origin], cities[dest])
            if ferry:
                pts, km = ferry
                thin = simplify(pts, args.epsilon)
                routes[key] = {'pts': thin, 'km': round(km, 2),
                               'profile': 'osm-ferry', 'snap': ['port', 'port']}
                done += 1
                if done % SAVE_EVERY == 0:
                    save_json(OUT_PATH, routes)
                direct = haversine(cities[origin], cities[dest])
                print(f'  + {key} [osm-ferry] {km:7.1f}km '
                      f'{km / direct if direct else 0:.2f}x {len(pts)}->{len(thin)} pts',
                      flush=True)
                continue
            sea, serr = fetch_searoute(cities[origin], cities[dest])
            if sea:
                pts, km = sea
                thin = simplify(pts, args.epsilon)
                routes[key] = {'pts': thin, 'km': round(km, 2),
                               'profile': 'searoute', 'snap': ['sea', 'sea']}
                done += 1
                if done % SAVE_EVERY == 0:
                    save_json(OUT_PATH, routes)
                direct = haversine(cities[origin], cities[dest])
                print(f'  + {key} [searoute] {km:7.1f}km '
                      f'{km / direct if direct else 0:.2f}x {len(pts)}->{len(thin)} pts',
                      flush=True)
                continue
            print(f'    . {key}: {ferr}; {serr}; trying the river profile', flush=True)

        hop = VIA.get((origin, dest, profile))
        if hop:
            cands_a = [(hop.get('from', cities[origin]), 'via-route')]
            cands_b = [(hop.get('to', cities[dest]), 'via-route')]
        else:
            cands_a = snap(origin, cities[origin], profile, snaps)
            cands_b = snap(dest, cities[dest], profile, snaps)

        # Walk the candidate lists together: a station can look closest and
        # still sit on unroutable track, so fall through to the next pick (and
        # ultimately the bare city centre) before giving up on the leg.
        result = err = None
        a_via = b_via = 'centre'
        for i in range(min(3, max(len(cands_a), len(cands_b)))):
            a, a_via = cands_a[min(i, len(cands_a) - 1)]
            b, b_via = cands_b[min(i, len(cands_b) - 1)]
            result, err = fetch_route(a, b, profile, hop and hop.get('via'))
            if result or (err and any(h in err.lower() for h in HOPELESS)):
                break

        # Walking the candidate lists in step only tries the diagonal, and the
        # pair that works is often off it — Kobe->Osaka needs the 2nd Kobe
        # station with the 3rd Osaka one, Porto->Lisbon the 1st with the 4th.
        # Fall back to the full cross product, and keep the SHORTEST hit: some
        # pairs route via a wild detour (134 km for a 30 km hop) and the sane
        # answer should win rather than whichever happened to come first.
        if not result and not (err and any(h in err.lower() for h in HOPELESS)):
            best = None
            direct_km = haversine(cities[origin], cities[dest])
            for (ca, av), (cb, bv) in itertools.product(cands_a, cands_b):
                r, _e = fetch_route(ca, cb, profile, hop and hop.get('via'))
                # A "shortest" answer of one point and zero kilometres is the
                # router giving up, not a route; nothing real is shorter than
                # the straight line between the two cities either.
                if not r or len(r[0]) < 2 or r[1] < max(0.5, direct_km * 0.7):
                    continue
                if best is None or r[1] < best[0][1]:
                    best = (r, av, bv)
            if best:
                result, a_via, b_via = best[0], best[1], best[2]

        if not result:
            print(f'  x {key} [{profile}]: {err}', flush=True)
            failed += 1
            continue

        pts, km = result
        thin = simplify(pts, args.epsilon)
        direct = haversine(cities[origin], cities[dest])

        # A route far longer than the straight line is not a route, it is the
        # router refusing a border or a missing link and going the long way
        # round: Eilat -> Taba is a 10 km hop that came back as a detour of
        # nearly twenty times that. Better a straight line than a fiction.
        if len(thin) < 2 or km <= 0:
            print(f'  ! {key} [{profile}]: degenerate result '
                  f'({len(thin)} pts, {km:.1f}km) — rejected', flush=True)
            failed += 1
            continue

        if direct > 1 and km / direct > MAX_DETOUR:
            print(f'  ! {key} [{profile}]: {km:.0f}km for a {direct:.0f}km hop '
                  f'({km / direct:.1f}x) — rejected', flush=True)
            failed += 1
            continue

        routes[key] = {
            'pts': thin,
            'km': round(km, 2),
            'profile': profile,
            'snap': [a_via, b_via],
        }
        # Written in batches: rewriting the whole file after every leg is both
        # slow and a standing invitation for a Windows sharing violation when
        # anything else (an editor, the dev server) has it open.
        done += 1
        if done % SAVE_EVERY == 0:
            save_json(OUT_PATH, routes)
        ratio = f'{km / direct:.2f}x' if direct > 0.5 else '-'
        print(f'  + {key} [{profile}] {km:7.1f}km {ratio:>6} '
              f'{len(pts)}->{len(thin)} pts  ({a_via} / {b_via})', flush=True)

    save_json(OUT_PATH, routes)
    size = os.path.getsize(OUT_PATH) / 1e6 if os.path.exists(OUT_PATH) else 0
    print(f'\ndone: {done} fetched, {failed} failed, {skipped} skipped, '
          f'{len(routes)} cached total, {size:.2f} MB', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())

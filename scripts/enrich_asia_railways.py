"""Enrich data/asia-railways.geojson with real OSM track geometry.

Reads the consolidated FeatureCollection, iterates ROUTE features whose
`osm_enriched` flag is false, queries Overpass for railway=rail ways along
the corridor between the two endpoint stations, stitches them into an
ordered polyline, and rewrites the feature's geometry.

Resumable: writes incrementally. Rerunning skips already-enriched routes.

Usage:
  python scripts/enrich_asia_railways.py                # process all
  python scripts/enrich_asia_railways.py --limit 50     # first 50 unprocessed
  python scripts/enrich_asia_railways.py --country CN   # only routes wholly in CN
  python scripts/enrich_asia_railways.py --mirror kumi  # use overpass.kumi.systems
"""
import argparse, json, math, os, sys, time
from typing import List, Tuple

try:
    import requests
except ImportError:
    print("pip install requests"); sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON_PATH = os.path.join(ROOT, 'data', 'asia-railways.geojson')

OVERPASS_ENDPOINTS = {
    'main':    'https://overpass-api.de/api/interpreter',
    'kumi':    'https://overpass.kumi.systems/api/interpreter',
    'coffee':  'https://overpass.private.coffee/api/interpreter',
}

R_KM = 6371.0088


def hav(a, b):
    """Great-circle distance in km between (lon,lat) pairs."""
    lo1, la1 = a; lo2, la2 = b
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = math.radians(la2 - la1), math.radians(lo2 - lo1)
    x = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R_KM * math.asin(math.sqrt(x))


def corridor_bbox(a, b, pad_deg=0.15):
    """Return (S, W, N, E) padded corridor around the two endpoints."""
    lo1, la1 = a; lo2, la2 = b
    return (
        min(la1, la2) - pad_deg,
        min(lo1, lo2) - pad_deg,
        max(la1, la2) + pad_deg,
        max(lo1, lo2) + pad_deg,
    )


def overpass_query_rail(bbox, endpoint):
    S, W, N, E = bbox
    q = f'''
[out:json][timeout:180];
(
  way["railway"="rail"]["service"!~"^(yard|siding|spur|crossover)$"]({S},{W},{N},{E});
);
out body;
>;
out skel qt;
'''
    r = requests.post(endpoint, data={'data': q}, timeout=240,
                      headers={'User-Agent': 'asia-railways-enrich/1.0'})
    r.raise_for_status()
    return r.json()


def stitch_nearest_path(overpass_data, start_lonlat, end_lonlat):
    """Very simple: for each rail vertex, pick the one nearest to the ideal
    straight line between endpoints. Build an ordered path with greedy
    nearest-neighbour walking from start to end.

    This is a rough enrichment — it will follow the actual OSM rail geometry
    where the density is high, and just approximate elsewhere. Good enough
    to replace straight lines with something that hugs real corridors.
    Better stitching (routing across the OSM rail graph) is out of scope for
    this quick pass.
    """
    nodes = {el['id']: (el['lon'], el['lat']) for el in overpass_data['elements']
             if el['type'] == 'node'}
    all_pts = list(nodes.values())
    if len(all_pts) < 2:
        return None

    # Build ordered path: start → nearest → nearest → ... → end
    remaining = list(all_pts)
    cur = min(remaining, key=lambda p: hav(p, start_lonlat))
    path = [cur]
    remaining.remove(cur)
    # Terminate when the endpoint is closer than the current point
    end_dist = hav(cur, end_lonlat)
    for _ in range(min(1500, len(remaining))):  # cap walk length
        # bias toward end so we don't wander backwards
        cand = min(remaining, key=lambda p: hav(p, cur) + 0.3 * hav(p, end_lonlat))
        d_next_to_end = hav(cand, end_lonlat)
        if d_next_to_end > end_dist * 1.5:  # walked past the corridor
            break
        # skip huge jumps (disconnected clusters)
        if hav(cand, cur) > 50:
            break
        path.append(cand)
        cur = cand
        end_dist = d_next_to_end
        remaining.remove(cand)
        if hav(cur, end_lonlat) < 3:
            break
    # Snap final leg to real endpoint
    path.append(end_lonlat)
    return [[round(x, 5), round(y, 5)] for x, y in path] if len(path) >= 2 else None


def save(geojson, path):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, separators=(',', ':'), ensure_ascii=False)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--country', type=str, default='')
    ap.add_argument('--mirror', choices=list(OVERPASS_ENDPOINTS.keys()), default='coffee')
    ap.add_argument('--min-km', type=float, default=25.0,
                    help='skip routes shorter than this — too small to be worth OSM enrichment')
    ap.add_argument('--sleep', type=float, default=2.0,
                    help='seconds between Overpass calls to be polite')
    args = ap.parse_args()

    endpoint = OVERPASS_ENDPOINTS[args.mirror]
    print(f'Using Overpass: {endpoint}')

    geo = json.load(open(GEOJSON_PATH, encoding='utf-8'))
    routes = [f for f in geo['features'] if f['properties'].get('kind') == 'route']
    todo = []
    for f in routes:
        p = f['properties']
        if p.get('osm_enriched'):
            continue
        if args.country and (p['country_from'] != args.country or p['country_to'] != args.country):
            continue
        (a, b) = f['geometry']['coordinates']
        if hav(a, b) < args.min_km:
            continue
        todo.append(f)

    if args.limit:
        todo = todo[:args.limit]
    print(f'Routes to enrich: {len(todo)} (of {len(routes)} total)')

    processed = 0
    for i, f in enumerate(todo):
        p = f['properties']
        (a, b) = f['geometry']['coordinates']
        label = f'{p["from"]} -> {p["to"]}'
        try:
            bbox = corridor_bbox(a, b)
            data = overpass_query_rail(bbox, endpoint)
            path = stitch_nearest_path(data, tuple(a), tuple(b))
            if path and len(path) >= 3:
                f['geometry']['coordinates'] = path
                p['osm_enriched'] = True
                processed += 1
                print(f'  [{i+1}/{len(todo)}] {label}: {len(path)} pts')
            else:
                print(f'  [{i+1}/{len(todo)}] {label}: no path (kept straight)')
        except Exception as e:
            print(f'  [{i+1}/{len(todo)}] {label}: ERROR {e}')

        # Save every 25 routes and at the end so a crash doesn't lose progress.
        if (i + 1) % 25 == 0 or i + 1 == len(todo):
            save(geo, GEOJSON_PATH)
            print(f'  ...saved (total enriched now: {sum(1 for r in routes if r["properties"].get("osm_enriched"))})')
        time.sleep(args.sleep)

    print(f'Done. Enriched {processed} route geometries.')


if __name__ == '__main__':
    main()

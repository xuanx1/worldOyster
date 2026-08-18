#!/usr/bin/env python3
"""Build the world-map LOD tiers in asset/geo/ from Natural Earth admin-0.

The map is drawn twice over: once as an orthographic globe on a 2D canvas
(atc-scope.js) and once as Leaflet vector layers (cost-choropleth.js,
unvisited-neighbors.js). Both want more coastline detail as they zoom in than
the 110m tier can give, so we ship three tiers and let the renderers swap.

Natural Earth ships 168 properties per feature. Exactly three are ever read:

    SOVEREIGNT   atc-scope.js  — FBL per-country blackout grouping
    ADMIN        atc-scope.js  — fallback when SOVEREIGNT is absent
    NAME         atc-scope.js, cost-choropleth.js, unvisited-neighbors.js

Everything else is dropped, and coordinates are quantised to QUANT_DP. At the
scope's maxZoom of 12 the globe spans roughly 87 px per degree, so 1e-3 deg
lands at ~0.09 px — under a pixel, which is why 3dp costs no visible detail
even on the 10m tier.

Usage:  python3 tools/build-geo-lod.py [--cache DIR]

Downloads are cached, so re-running is cheap. Run from the repo root.
"""

import argparse
import gzip
import json
import os
import sys
import urllib.request

SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"

# Natural Earth v5.1.x admin-0 countries. Keep this list ordered coarse -> fine;
# data/geo-lod.js mirrors it and the renderers step along it as they zoom.
TIERS = [
    ("110m", "ne_110m_admin_0_countries.geojson"),
    ("50m", "ne_50m_admin_0_countries.geojson"),
    ("10m", "ne_10m_admin_0_countries.geojson"),
]

KEEP_PROPS = ("NAME", "SOVEREIGNT", "ADMIN")
QUANT_DP = 3
OUT_DIR = os.path.join("asset", "geo")


def fetch(name, cache_dir):
    """Download `name` from Natural Earth unless it is already cached."""
    path = os.path.join(cache_dir, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    url = "%s/%s" % (SRC, name)
    print("  fetching %s" % url)
    os.makedirs(cache_dir, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def quantise(ring, stats):
    """Round a ring to QUANT_DP and drop the duplicate points that creates.

    Returns None for rings that collapse below the four points a closed ring
    needs — at 3dp a handful of sub-100m islets in the 10m tier do.
    """
    stats["in"] += len(ring)
    out = []
    for p in ring:
        q = [round(p[0], QUANT_DP), round(p[1], QUANT_DP)]
        if not out or out[-1] != q:
            out.append(q)
    if len(out) < 4:
        stats["dropped_rings"] += 1
        return None
    if out[0] != out[-1]:
        out.append(list(out[0]))
    stats["out"] += len(out)
    return out


def build(src_path, stats):
    with open(src_path, encoding="utf-8") as f:
        geo = json.load(f)

    features = []
    for feat in geo.get("features", []):
        geom = feat.get("geometry")
        if not geom:
            continue
        src_props = feat.get("properties") or {}
        props = {k: src_props[k] for k in KEEP_PROPS if src_props.get(k) is not None}

        if geom["type"] == "Polygon":
            rings = [r for r in (quantise(r, stats) for r in geom["coordinates"]) if r]
            if not rings:
                continue
            out_geom = {"type": "Polygon", "coordinates": rings}
        elif geom["type"] == "MultiPolygon":
            polys = []
            for poly in geom["coordinates"]:
                rings = [r for r in (quantise(r, stats) for r in poly) if r]
                if rings:
                    polys.append(rings)
            if not polys:
                continue
            out_geom = {"type": "MultiPolygon", "coordinates": polys}
        else:
            continue

        features.append({"type": "Feature", "properties": props, "geometry": out_geom})

    return {"type": "FeatureCollection", "features": features}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join("tools", ".ne-cache"),
                    help="where to keep downloaded Natural Earth sources")
    args = ap.parse_args()

    if not os.path.isdir("asset"):
        sys.exit("run this from the repo root (no ./asset directory here)")

    os.makedirs(OUT_DIR, exist_ok=True)
    for tier, src_name in TIERS:
        print("%s:" % tier)
        src = fetch(src_name, args.cache)
        stats = {"in": 0, "out": 0, "dropped_rings": 0}
        geo = build(src, stats)
        blob = json.dumps(geo, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        dest = os.path.join(OUT_DIR, "world-%s.geojson" % tier)
        with open(dest, "wb") as f:
            f.write(blob)
        print("  %s  %.2f MB raw / %.2f MB gzip  %d features  %d -> %d vertices%s"
              % (dest, len(blob) / 1e6, len(gzip.compress(blob, 9)) / 1e6,
                 len(geo["features"]), stats["in"], stats["out"],
                 "  (%d degenerate rings dropped)" % stats["dropped_rings"]
                 if stats["dropped_rings"] else ""))


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
# Keep passing over the remaining land legs until nothing new lands.
# BRouter throttles by IP load, so a slow drip across several passes gets
# further than one hard run: legs it refuses are left uncached and retried.
cd "$(dirname "$0")/.."
for pass in $(seq 1 40); do
  before=$(python -c "import json;print(len(json.load(open('data/land-routes.json',encoding='utf-8'))))" 2>/dev/null || echo 0)
  echo "=== pass $pass (have $before) ==="
  python tools/build-land-routes.py 2>&1 | tail -4
  after=$(python -c "import json;print(len(json.load(open('data/land-routes.json',encoding='utf-8'))))" 2>/dev/null || echo 0)
  echo "=== pass $pass done: $before -> $after ==="
  [ "$after" -ge 430 ] && { echo "ALL ROUTES FETCHED"; break; }
  [ "$after" = "$before" ] && sleep 300 || sleep 60
done

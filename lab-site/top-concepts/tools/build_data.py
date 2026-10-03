"""トップ表現の試作で使うグラフデータを作る。

入力(先に取得しておく):
  railways.json, stations.json  … Mini Tokyo 3D (https://github.com/nagix/mini-tokyo-3d, MIT)
  land.geojson, places.geojson  … Natural Earth 1:110m (パブリックドメイン)

使い方:
  python3 build_data.py <入力ディレクトリ> <出力ディレクトリ>
"""
import json
import math
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])

# ---------- 東京の鉄道網 ----------
BBOX = (139.56, 35.55, 139.92, 35.82)  # 西, 南, 東, 北
railways = json.loads((src / 'railways.json').read_text())
stations = {s['id']: s for s in json.loads((src / 'stations.json').read_text())}


def km(a, b):
    dx = (a[0] - b[0]) * 111.32 * math.cos(math.radians((a[1] + b[1]) / 2))
    dy = (a[1] - b[1]) * 110.57
    return math.hypot(dx, dy)


def inside(c):
    return BBOX[0] <= c[0] <= BBOX[2] and BBOX[1] <= c[1] <= BBOX[3]


# 同じ駅名で近い(500m以内)駅、または 120m 以内の駅は1つの頂点にまとめる(乗換駅)
nodes, names, index = [], [], {}


def node_of(sid):
    if sid in index:
        return index[sid]
    s = stations[sid]
    c, name = s['coord'][:2], s['title']['ja']
    for i, (p, nm) in enumerate(zip(nodes, names)):
        d = km(p, c)
        if (nm == name and d < 0.5) or d < 0.12:
            index[sid] = i
            return i
    nodes.append(c)
    names.append(name)
    index[sid] = len(nodes) - 1
    return index[sid]


edges = set()
for r in railways:
    ids = [s for s in r['stations'] if s in stations]
    seq = ids + ([ids[0]] if r.get('loop') else [])
    for a, b in zip(seq, seq[1:]):
        ca, cb = stations[a]['coord'], stations[b]['coord']
        if not (inside(ca) and inside(cb)):
            continue
        u, v = node_of(a), node_of(b)
        if u != v:
            edges.add((min(u, v), max(u, v)))

rail = {
    'bbox': BBOX,
    'nodes': [[round(c[0], 5), round(c[1], 5)] for c in nodes],
    'names': names,
    'edges': sorted(edges),
}
(out / 'tokyo-rail.js').write_text(
    '// 東京の鉄道網(Mini Tokyo 3D のデータから生成、MIT)\nwindow.TOKYO_RAIL = '
    + json.dumps(rail, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('rail', len(nodes), 'nodes', len(edges), 'edges')

# ---------- 世界(海岸線と主要都市) ----------
land = json.loads((src / 'land.geojson').read_text())
coast = []
STEP = 1.6  # 度
for f in land['features']:
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    for poly in polys:
        ring = poly[0]
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            n = max(1, int(math.hypot(x1 - x0, y1 - y0) / STEP))
            for k in range(n):
                t = k / n
                coast.append([round(x0 + (x1 - x0) * t, 1), round(y0 + (y1 - y0) * t, 1)])
places = json.loads((src / 'places.geojson').read_text())
cities = [[round(p['properties']['longitude'], 2), round(p['properties']['latitude'], 2)] for p in places['features']]
world = {'coast': coast, 'cities': cities}
(out / 'world.js').write_text(
    '// 海岸線と主要都市(Natural Earth 1:110m、パブリックドメイン)\nwindow.WORLD = '
    + json.dumps(world, separators=(',', ':')) + ';\n')
print('world', len(coast), 'coast points', len(cities), 'cities')

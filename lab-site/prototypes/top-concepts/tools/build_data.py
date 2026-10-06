"""トップ表現の試作で使うデータを作る。

入力(先に <入力ディレクトリ> へ取得しておく):
  land.geojson                … Natural Earth 1:110m land(パブリックドメイン)
                                https://github.com/nvkelso/natural-earth-vector
  airports.dat, routes.dat    … OpenFlights(ODbL、路線は2014年時点)
                                https://github.com/jpatokal/openflights
手書き数字は scikit-learn 同梱の digits(8x8、1797枚)を使う。

使い方:
  pip install numpy scikit-learn
  python3 build_data.py <入力ディレクトリ> <出力ディレクトリ>
"""
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.datasets import load_digits

src, out = Path(sys.argv[1]), Path(sys.argv[2])


def write_js(name, var, comment, data):
    (out / name).write_text(
        f'// {comment}\nwindow.{var} = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')


# ---------- 世界: 海岸線と航空路線 ----------
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

airports = {}
with open(src / 'airports.dat', encoding='utf-8') as fp:
    for row in csv.reader(fp):
        airports[row[0]] = {'iata': row[4], 'city': row[2], 'lat': float(row[6]), 'lon': float(row[7])}

# 空港の組ごとに、その路線を飛ばしている航空会社の数を数える
airlines = defaultdict(set)
with open(src / 'routes.dat', encoding='utf-8') as fp:
    for row in csv.reader(fp):
        a, b = row[3], row[5]
        if a == '\\N' or b == '\\N' or a == b or a not in airports or b not in airports:
            continue
        airlines[(min(a, b), max(a, b))].add(row[0])

partners = defaultdict(dict)
for (a, b), s in airlines.items():
    partners[a][b] = partners[b][a] = len(s)

TOP, KEEP = 300, 5
hubs = sorted(partners, key=lambda a: -len(partners[a]))[:TOP]
idx = {a: i for i, a in enumerate(hubs)}
edges = set()
for a in hubs:
    near = sorted(((c, b) for b, c in partners[a].items() if b in idx), reverse=True)[:KEEP]
    for _, b in near:
        edges.add((min(idx[a], idx[b]), max(idx[a], idx[b])))

world = {
    'coast': coast,
    'airports': [[round(airports[a]['lon'], 2), round(airports[a]['lat'], 2)] for a in hubs],
    'iata': [airports[a]['iata'] for a in hubs],
    'edges': sorted(edges),
}
write_js('world.js', 'WORLD', '海岸線(Natural Earth、パブリックドメイン)と航空路線(OpenFlights、ODbL、2014年時点)', world)
print('world', len(coast), 'coast points', len(hubs), 'airports', len(edges), 'routes')

# ---------- 手書き数字を読むニューラルネット(64-16-16-10) ----------
digits = load_digits()
X = digits.data / 16.0
y = digits.target
rng = np.random.default_rng(7)
perm = rng.permutation(len(X))
train, test = perm[:1500], perm[1500:]
sizes = [64, 16, 16, 10]
Ws = [rng.normal(0, 1 / math.sqrt(m), (m, n)) for m, n in zip(sizes, sizes[1:])]
bs = [np.zeros(n) for n in sizes[1:]]


def sigmoid(z):
    return 1 / (1 + np.exp(-z))


def forward(x):
    acts = [x]
    for i, (W, b) in enumerate(zip(Ws, bs)):
        z = acts[-1] @ W + b
        if i < len(Ws) - 1:
            acts.append(sigmoid(z))
        else:
            e = np.exp(z - z.max(axis=-1, keepdims=True))
            acts.append(e / e.sum(axis=-1, keepdims=True))
    return acts


lr = 0.5
for epoch in range(300):
    for batch in np.array_split(rng.permutation(train), 30):
        acts = forward(X[batch])
        delta = acts[-1].copy()
        delta[np.arange(len(batch)), y[batch]] -= 1
        delta /= len(batch)
        for i in reversed(range(len(Ws))):
            gW, gb = acts[i].T @ delta, delta.sum(0)
            if i > 0:
                delta = (delta @ Ws[i].T) * acts[i] * (1 - acts[i])
            Ws[i] -= lr * gW
            bs[i] -= lr * gb

pred = forward(X[test])[-1].argmax(1)
acc = float((pred == y[test]).mean())
print('digits test accuracy', round(acc, 3))

# 表示用のサンプル: 各数字2枚ずつ、正しく読めたもの
samples = []
for d in range(10):
    ok = [i for i in test if y[i] == d and pred[list(test).index(i)] == d][:2]
    samples += [[int(v) for v in digits.data[i]] for i in ok]
order = rng.permutation(len(samples))
net = {
    'sizes': sizes,
    'W': [np.round(W, 3).tolist() for W in Ws],
    'b': [np.round(b, 3).tolist() for b in bs],
    'samples': [samples[i] for i in order],
    'accuracy': round(acc, 3),
}
write_js('digits-net.js', 'DIGITS_NET', '手書き数字 8x8 を読む 64-16-16-10 のニューラルネット(scikit-learn digits で学習)', net)

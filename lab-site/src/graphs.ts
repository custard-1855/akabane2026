// 有名なグラフの形。頂点は原点を中心とした半径1以内の3次元の点
import { dist3, type Vec3 } from "./math";

export type Shape = { name: string; nodes: Vec3[]; edges: [number, number][] };

/** 処理に渡すグラフ: 頂点の数と隣接リスト、元の形 */
export type Graph = { n: number; nbrs: number[][]; shape: Shape };

/** 形から隣接リストと辺の長さを作る。len のキーは a * n + b */
export function toGraph(shape: Shape) {
  const n = shape.nodes.length;
  const nbrs: number[][] = Array.from({ length: n }, () => []);
  const len = new Map<number, number>();
  for (const [a, b] of shape.edges) {
    nbrs[a].push(b);
    nbrs[b].push(a);
    const l = dist3(shape.nodes[a], shape.nodes[b]);
    len.set(a * n + b, l);
    len.set(b * n + a, l);
  }
  return { shape, n, nbrs, len };
}

function normalize(pts: Vec3[]): Vec3[] {
  const r = Math.max(...pts.map((p) => Math.hypot(...p)));
  return pts.map((p) => p.map((v) => v / r) as Vec3);
}

function shortestEdges(pts: Vec3[]) {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) min = Math.min(min, dist3(pts[i], pts[j]));
  const edges: [number, number][] = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      if (dist3(pts[i], pts[j]) < min * 1.001) edges.push([i, j]);
  return edges;
}

export function fullerene(): Shape {
  const f = (1 + Math.sqrt(5)) / 2,
    pts: Vec3[] = [];
  for (const b of [
    [0, 1, 3 * f],
    [1, 2 + f, 2 * f],
    [f, 2, 2 * f + 1],
  ]) {
    for (const sx of [1, -1])
      for (const sy of [1, -1])
        for (const sz of [1, -1]) {
          const v = [b[0] * sx, b[1] * sy, b[2] * sz];
          for (const c of [
            [0, 1, 2],
            [1, 2, 0],
            [2, 0, 1],
          ]) {
            const p: Vec3 = [v[c[0]], v[c[1]], v[c[2]]];
            if (!pts.some((q) => dist3(p, q) < 1e-6)) pts.push(p);
          }
        }
  }
  return { name: "C60 フラーレン", nodes: normalize(pts), edges: shortestEdges(pts) };
}

export function torus(): Shape {
  const A = 32,
    B = 11,
    R = 0.72,
    r = 0.28,
    nodes: Vec3[] = [],
    edges: [number, number][] = [];
  for (let i = 0; i < A; i++)
    for (let j = 0; j < B; j++) {
      const a = (i / A) * Math.PI * 2,
        b = (j / B) * Math.PI * 2;
      nodes.push([
        (R + r * Math.cos(b)) * Math.cos(a),
        r * Math.sin(b),
        (R + r * Math.cos(b)) * Math.sin(a),
      ]);
      edges.push([i * B + j, ((i + 1) % A) * B + j], [i * B + j, i * B + ((j + 1) % B)]);
    }
  return { name: "トーラス", nodes, edges };
}

export function hypercube(): Shape {
  // 6次元の各軸を、正二十面体の6本の対角線の向きに写して3次元に投影する
  const f = (1 + Math.sqrt(5)) / 2;
  const axes = [
    [0, 1, f],
    [0, 1, -f],
    [1, f, 0],
    [1, -f, 0],
    [f, 0, 1],
    [-f, 0, 1],
  ].map((v) => v.map((x) => x / Math.hypot(...v)));
  const nodes: Vec3[] = [],
    edges: [number, number][] = [];
  for (let m = 0; m < 64; m++) {
    const p: Vec3 = [0, 0, 0];
    axes.forEach((ax, k) => {
      const s = m & (1 << k) ? 1 : -1;
      for (let d = 0; d < 3; d++) p[d] += s * ax[d];
    });
    nodes.push(p);
    for (let k = 0; k < 6; k++) if (!(m & (1 << k))) edges.push([m, m | (1 << k)]);
  }
  return { name: "6次元超立方体", nodes: normalize(nodes), edges };
}

export function geodesic(): Shape {
  const f = (1 + Math.sqrt(5)) / 2;
  const V = (
    [
      [-1, f, 0],
      [1, f, 0],
      [-1, -f, 0],
      [1, -f, 0],
      [0, -1, f],
      [0, 1, f],
      [0, -1, -f],
      [0, 1, -f],
      [f, 0, -1],
      [f, 0, 1],
      [-f, 0, -1],
      [-f, 0, 1],
    ] as Vec3[]
  ).map((v) => v.map((x) => x / Math.hypot(...v)) as Vec3);
  let F = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let s = 0; s < 2; s++) {
    const cache = new Map<string, number>(),
      NF: number[][] = [];
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const p = V[a].map((x, i) => x + V[b][i]),
        l = Math.hypot(...p);
      V.push(p.map((x) => x / l) as Vec3);
      cache.set(key, V.length - 1);
      return V.length - 1;
    };
    for (const [a, b, c] of F) {
      const ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      NF.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    F = NF;
  }
  const has = new Set<string>(),
    edges: [number, number][] = [];
  for (const [a, b, c] of F)
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = x < y ? `${x},${y}` : `${y},${x}`;
      if (!has.has(key)) {
        has.add(key);
        edges.push([x, y]);
      }
    }
  return { name: "ジオデシック球", nodes: V, edges };
}

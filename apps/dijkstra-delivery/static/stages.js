// ステージデータと validateStage。座標は viewBox 1600×900 基準

import { generateCity } from "./city.js";
import { CITY_SEED, HIT_R, MARGIN, MIN_EDGE_GAP, MIN_NODE_GAP, VIEW_H, VIEW_W } from "./config.js";
import { INF, buildAdj, dijkstra } from "./logic.js";

/**
 * @typedef {{
 *   u: string, v: string, w: number,
 *   directed?: boolean,
 * }} Edge
 * @typedef {{
 *   id: string,
 *   name: string, desc: string,
 *   nodes: Record<string, [number, number]>,
 *   edges: Edge[],
 *   expectedCost?: number,   // 大都市(dense)にはない
 *   star2?: number,          // 大都市(dense)にはない
 *   start?: string, goal?: string,
 *   allowNegative?: boolean,
 *   dense?: boolean,
 * }} Stage
 */

// 設計時の座標は旧基準(800×500)。形を保つため縦横同じ倍率で 1600×900 に拡大し、左右の余白をそろえる
/** @param {Record<string, [number, number]>} nodes */
const scale = (nodes) =>
  Object.fromEntries(
    Object.entries(nodes).map(([n, [x, y]]) => [n, [1.8 * x + 80, 1.8 * y]]),
  );

/** @param {string} spec "S-A 4, S-B 3" の形 */
const roads = (spec, extra = {}) =>
  spec.split(",").map((s) => {
    const [uv, w] = s.trim().split(/\s+/);
    const [u, v] = uv.split("-");
    return { u, v, w: Number(w), ...extra };
  });

/** @type {Stage[]} */
export const STAGES = [
  {
    id: "downtown",
    name: "下町",
    desc: "倉庫 S からお届け先 G まで、いちばん早いルートで届けよう",
    nodes: scale({
      S: [80, 250], A: [220, 120], B: [220, 380], C: [380, 90], D: [380, 250],
      E: [380, 410], F: [560, 150], H: [560, 350], G: [720, 250],
    }),
    edges: roads(
      "S-A 4, S-B 3, A-C 5, A-D 2, B-D 6, B-E 4, C-D 3, C-F 6, D-F 7, D-H 3, E-H 5, F-G 4, H-G 4",
    ),
    expectedCost: 13,
    star2: 16,
  },
  {
    id: "residential",
    name: "住宅街",
    desc: "街が広くなった。倉庫 S からお届け先 G まで、いちばん早いルートで届けよう",
    nodes: scale({
      S: [80, 250],
      A: [200, 80], B: [200, 250], C: [200, 420],
      D: [330, 80], E: [330, 250], F: [330, 420],
      H: [460, 80], I: [460, 250], J: [460, 420],
      K: [590, 80], L: [590, 250], M: [590, 420],
      G: [720, 250],
    }),
    // 目先の罠: S から出るいちばん短い道 S-B(1)は、どの最短ルートにも含まれない。
    // B から先は最善でも 22 で、star2 を超える
    edges: roads(
      "S-A 3, S-B 1, S-C 5, A-B 8, B-C 7, A-D 1, A-E 5, B-E 9, C-F 3, D-E 2, E-F 9, " +
        "D-H 8, E-I 3, F-I 6, F-J 8, H-I 9, I-J 4, H-K 8, H-L 7, I-L 5, J-M 9, " +
        "K-L 8, L-M 5, K-G 5, L-G 4, M-G 9",
    ),
    expectedCost: 18,
    star2: 20,
  },
  generateCity(CITY_SEED),
];

/**
 * ステージの条件を検査する。テストで全ステージにかける
 * @param {Stage} stage
 * @returns {string[]} 違反の説明。空なら合格
 */
export function validateStage(stage) {
  const errors = [];
  const has = (n) => Object.hasOwn(stage.nodes, n);
  for (const e of stage.edges) {
    for (const n of [e.u, e.v]) {
      if (!has(n)) errors.push(`辺 ${e.u}-${e.v} の端点 ${n} が nodes にない`);
    }
  }
  const start = stage.start ?? "S";
  const goal = stage.goal ?? "G";
  for (const n of [start, goal]) {
    if (!has(n)) errors.push(`start/goal の ${n} が nodes にない`);
  }
  // 端点が欠けていると隣接表を作れないので、ここで打ち切る
  if (errors.length > 0) return errors;

  // 同じ向きの辺が重複すると、隣接表で上書きされる。無向辺は両向きとして数える
  const arcs = new Set();
  for (const e of stage.edges) {
    const dirs = e.directed ? [[e.u, e.v]] : [[e.u, e.v], [e.v, e.u]];
    for (const [u, v] of dirs) {
      const key = `${u}→${v}`;
      if (arcs.has(key)) errors.push(`${key} の辺が重複している`);
      arcs.add(key);
    }
  }

  for (const e of stage.edges) {
    // 無向辺に負の重みを付けると、往復するだけで負の閉路になる
    const negativeOk = stage.allowNegative && e.directed;
    if (!Number.isInteger(e.w) || e.w === 0 || (e.w < 0 && !negativeOk)) {
      errors.push(`辺 ${e.u}-${e.v} の重み ${e.w} が使えない`);
    }
  }
  if (stage.allowNegative && hasNegativeCycle(stage)) {
    errors.push("負の閉路がある");
  }

  if (dijkstra(buildAdj(stage), start).dist.get(goal) === INF) {
    errors.push(`${start} から ${goal} へ到達できない`);
  }

  const pts = Object.entries(stage.nodes);
  for (const [n, [x, y]] of pts) {
    if (x < MARGIN || x > VIEW_W - MARGIN || y < MARGIN || y > VIEW_H - MARGIN) {
      errors.push(`${n} (${x}, ${y}) が viewBox の余白にはみ出している`);
    }
  }
  // 大都市は交差点を小さい点で描き、押した位置にいちばん近い交差点としてタップを受けるので、
  // タップ判定の円の間隔と、辺がノードの上を通るかは検査しない
  if (stage.dense) return errors;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const [a, p] = pts[i];
      const [b, q] = pts[j];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < MIN_NODE_GAP) {
        errors.push(`${a} と ${b} が近すぎる(タップ判定 r=${HIT_R} が重なる)`);
      }
    }
  }
  for (const e of stage.edges) {
    for (const [n, p] of pts) {
      if (n === e.u || n === e.v) continue;
      if (segmentDist(p, stage.nodes[e.u], stage.nodes[e.v]) < MIN_EDGE_GAP) {
        errors.push(`辺 ${e.u}-${e.v} が ${n} の上を通る`);
      }
    }
  }
  return errors;
}

/**
 * ベルマン–フォード法で負の閉路を探す。全頂点を始点 0 として、V 回目にも緩和が起きれば閉路がある
 * @param {Stage} stage
 */
function hasNegativeCycle(stage) {
  const adj = buildAdj(stage);
  const dist = new Map([...adj.keys()].map((n) => [n, 0]));
  for (let i = 0; i < adj.size; i++) {
    let changed = false;
    for (const [u, out] of adj) {
      for (const [v, w] of out) {
        if (dist.get(u) + w < dist.get(v)) {
          dist.set(v, dist.get(u) + w);
          changed = true;
        }
      }
    }
    if (!changed) return false;
  }
  return true;
}

/**
 * 点 p と線分 ab の距離
 * @param {[number, number]} p
 * @param {[number, number]} a
 * @param {[number, number]} b
 */
function segmentDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

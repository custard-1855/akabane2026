// ステージデータと検証。座標は viewBox 800×500 基準(設計書 3.9)

import { INF, buildAdj, dijkstra } from "./logic.js";

/** @typedef {import("./logic.js").Stage} Stage */

export const VIEW_W = 800;
export const VIEW_H = 500;
const MARGIN = 30;
const MIN_NODE_GAP = 100;
const MIN_EDGE_NODE_GAP = 30;

/** @type {Stage[]} */
export const STAGES = [
  {
    id: "downtown",
    name: "下町",
    desc: "基本の街。道の数字は所要時間です。",
    nodes: {
      S: [80, 250], A: [220, 120], B: [220, 380], C: [380, 90], D: [380, 250],
      E: [380, 410], F: [560, 150], H: [560, 350], G: [720, 250],
    },
    edges: [
      { u: "S", v: "A", w: 4 }, { u: "S", v: "B", w: 3 }, { u: "A", v: "C", w: 5 },
      { u: "A", v: "D", w: 2 }, { u: "B", v: "D", w: 6 }, { u: "B", v: "E", w: 4 },
      { u: "C", v: "D", w: 3 }, { u: "C", v: "F", w: 6 }, { u: "D", v: "F", w: 7 },
      { u: "D", v: "H", w: 3 }, { u: "E", v: "H", w: 5 }, { u: "F", v: "G", w: 4 },
      { u: "H", v: "G", w: 4 },
    ],
    expectedCost: 13,
    star2: 16,
  },
  {
    id: "highway",
    name: "高速道路",
    desc: "オレンジの太い道は高速道路。遠回りに見えても速いかもしれません。",
    nodes: {
      S: [80, 250], A: [250, 250], B: [450, 250], G: [720, 250],
      P: [250, 90], Q: [500, 90], R: [250, 420], T: [500, 420],
    },
    edges: [
      { u: "S", v: "P", w: 3, kind: "highway" },
      { u: "P", v: "Q", w: 2, kind: "highway" },
      { u: "Q", v: "G", w: 4, kind: "highway" },
      { u: "S", v: "A", w: 4 }, { u: "A", v: "B", w: 9 }, { u: "B", v: "G", w: 5 },
      { u: "P", v: "A", w: 4 }, { u: "Q", v: "B", w: 3 }, { u: "R", v: "A", w: 3 },
      { u: "T", v: "B", w: 4 }, { u: "S", v: "R", w: 4 }, { u: "R", v: "T", w: 4 },
      { u: "T", v: "G", w: 4 },
    ],
    expectedCost: 9,
    star2: 12,
  },
  {
    id: "oneway",
    name: "一方通行",
    desc: "矢印の向きにしか進めません。",
    nodes: {
      S: [80, 250], A: [240, 130], B: [240, 370], C: [420, 250],
      D: [600, 130], E: [600, 370], G: [740, 250],
    },
    edges: [
      { u: "S", v: "A", w: 3, directed: true }, { u: "S", v: "B", w: 5, directed: true },
      { u: "A", v: "C", w: 4, directed: true }, { u: "B", v: "C", w: 2, directed: true },
      { u: "C", v: "D", w: 3, directed: true }, { u: "C", v: "E", w: 5, directed: true },
      { u: "D", v: "G", w: 6, directed: true }, { u: "E", v: "G", w: 2, directed: true },
      { u: "A", v: "D", w: 9, directed: true }, { u: "B", v: "A", w: 1, directed: true },
      { u: "E", v: "D", w: 1, directed: true },
    ],
    expectedCost: 14,
    star2: 17,
  },
];

/** 点 p と線分 ab の距離 */
function segmentDistance(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * ステージ1つを検証する(設計書 3.3)。
 * @param {Stage} stage
 * @returns {string[]} 問題の一覧。空なら正常
 */
export function validateStage(stage) {
  const errors = [];
  const names = Object.keys(stage.nodes);
  const has = (n) => Object.hasOwn(stage.nodes, n);
  const start = stage.start ?? "S";
  const goal = stage.goal ?? "G";

  if (!has(start)) errors.push(`start ${start} がありません`);
  if (!has(goal)) errors.push(`goal ${goal} がありません`);

  const seen = new Set();
  for (const e of stage.edges) {
    const label = `${e.u}-${e.v}`;
    if (!has(e.u) || !has(e.v)) {
      errors.push(`辺 ${label} の端点がありません`);
      continue;
    }
    if (e.u === e.v) errors.push(`辺 ${label} が自己ループです`);
    if (!Number.isInteger(e.w) || e.w <= 0) errors.push(`辺 ${label} の重み ${e.w} が正の整数ではありません`);
    const keys = e.directed ? [`${e.u}>${e.v}`] : [`${e.u}>${e.v}`, `${e.v}>${e.u}`];
    for (const k of keys) {
      if (seen.has(k)) errors.push(`辺 ${k} が重複しています`);
      seen.add(k);
    }
  }
  if (errors.length > 0) return errors;

  if (dijkstra(buildAdj(stage), start).dist.get(goal) === INF) {
    errors.push(`${goal} に ${start} から到達できません`);
  }

  for (const n of names) {
    const [x, y] = stage.nodes[n];
    if (x < MARGIN || x > VIEW_W - MARGIN || y < MARGIN || y > VIEW_H - MARGIN) {
      errors.push(`${n}(${x},${y}) が画面の余白内にありません`);
    }
  }
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [stage.nodes[names[i]], stage.nodes[names[j]]];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d < MIN_NODE_GAP) errors.push(`${names[i]} と ${names[j]} が近すぎます(${d.toFixed(0)})`);
    }
  }
  for (const e of stage.edges) {
    for (const n of names) {
      if (n === e.u || n === e.v) continue;
      const d = segmentDistance(stage.nodes[n], stage.nodes[e.u], stage.nodes[e.v]);
      if (d < MIN_EDGE_NODE_GAP) errors.push(`辺 ${e.u}-${e.v} が ${n} の上を通ります(${d.toFixed(0)})`);
    }
  }
  return errors;
}

/**
 * 全ステージを検証する。各ステージの検証に加え、id の重複を調べる。
 * @param {Stage[]} stages
 * @returns {string[]}
 */
export function validateStages(stages) {
  const errors = [];
  const ids = new Set();
  for (const s of stages) {
    if (ids.has(s.id)) errors.push(`id ${s.id} が重複しています`);
    ids.add(s.id);
    errors.push(...validateStage(s).map((m) => `${s.id}: ${m}`));
  }
  return errors;
}

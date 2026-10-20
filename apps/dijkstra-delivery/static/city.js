// Stage 3「大都市」の街を生成する。格子点を少しずらし、隣どうしを道で結ぶ。種を固定して毎回同じ街にする

import { MARGIN, VIEW_H, VIEW_W } from "./config.js";

/** @typedef {import("./stages.js").Stage} Stage */

const COLS = 23;
const ROWS = 13;
/** 格子点をずらす幅の上限(viewBox 単位) */
const JITTER = 15;
/** 抜く道の割合の目安 */
const DROP_RATE = 0.15;

/**
 * 種から決まる乱数(mulberry32)。Math.random は種を指定できないので使わない
 * @param {number} seed
 */
function random(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 格子のままだと街に見えないので、道を一部抜く。抜くと街が分断される道は残す
 * @param {{ u: string, v: string, w: number }[]} edges
 * @param {() => number} rnd
 */
function dropSome(edges, rnd) {
  /** @type {Map<string, Set<string>>} */
  const adj = new Map();
  for (const { u, v } of edges) {
    for (const [a, b] of [[u, v], [v, u]]) {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a).add(b);
    }
  }
  /** u から v へ行けるか */
  const connected = (u, v) => {
    const seen = new Set([u]);
    const stack = [u];
    while (stack.length > 0) {
      const a = stack.pop();
      if (a === v) return true;
      for (const b of adj.get(a)) {
        if (!seen.has(b)) {
          seen.add(b);
          stack.push(b);
        }
      }
    }
    return false;
  };

  const dropped = new Set();
  for (const e of edges) {
    if (rnd() >= DROP_RATE) continue;
    adj.get(e.u).delete(e.v);
    adj.get(e.v).delete(e.u);
    if (connected(e.u, e.v)) {
      dropped.add(e);
    } else {
      adj.get(e.u).add(e.v);
      adj.get(e.v).add(e.u);
    }
  }
  return edges.filter((e) => !dropped.has(e));
}

/**
 * @param {number} seed
 * @returns {Stage}
 */
export function generateCity(seed) {
  const rnd = random(seed);
  const name = (r, c) => `r${r}c${c}`;
  const x0 = MARGIN + JITTER;
  const y0 = MARGIN + JITTER;
  const dx = (VIEW_W - 2 * x0) / (COLS - 1);
  const dy = (VIEW_H - 2 * y0) / (ROWS - 1);

  /** @type {Record<string, [number, number]>} */
  const nodes = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const jx = (rnd() * 2 - 1) * JITTER;
      const jy = (rnd() * 2 - 1) * JITTER;
      nodes[name(r, c)] = [Math.round(x0 + c * dx + jx), Math.round(y0 + r * dy + jy)];
    }
  }

  const edges = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
        if (r2 >= ROWS || c2 >= COLS) continue;
        const u = name(r, c);
        const v = name(r2, c2);
        const len = Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]);
        // 所要時間は長さに比例させ、到着時間マップを街の形どおりの同心円に近づける
        edges.push({ u, v, w: Math.max(1, Math.round((len / 10) * (0.8 + rnd() * 0.4))) });
      }
    }
  }

  return {
    id: "metropolis",
    edges: dropSome(edges, rnd),
    name: "大都市",
    desc: "出発点をタップすると、そこから街じゅうへのいちばん早い時間を求める",
    nodes,
    start: name(0, 0),
    goal: name(ROWS - 1, COLS - 1),
    dense: true,
  };
}

/**
 * 押した位置にいちばん近い交差点。大都市では交差点が小さい点で間隔も狭いので、点そのものではなく位置でタップを受ける
 * @param {Pick<Stage, "nodes">} stage
 * @param {[number, number]} p viewBox 単位の位置
 */
export function nearestNode(stage, [x, y]) {
  let best = "";
  let bestD = Infinity;
  for (const [n, [nx, ny]] of Object.entries(stage.nodes)) {
    const d = Math.hypot(nx - x, ny - y);
    if (d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

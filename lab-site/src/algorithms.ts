// クリックで実行する処理
//
// run() は実際にその処理を実行し、起きた順に出来事の列を返す。画面のことは知らない。
//   EdgeEvent … 辺 a→b を時刻 t から dur 秒で伸ばす。
//               fade があれば残光として消える。key が同じ後の出来事で上書きされ、c = -1 なら消える
//   NodeEvent … 頂点 v に色 c を付ける(c = -1 で色を外す)
// 色 c は C.pal の色番号(PAL)
import { CFG } from "./config";
import type { Graph } from "./graphs";
import { clamp } from "./math";
import { PAL } from "./palette";

export type EdgeEvent = {
  e: 1;
  a: number;
  b: number;
  t: number;
  dur: number;
  c: number;
  fade?: number;
  w?: number;
  key?: string;
  alpha?: number;
};
export type NodeEvent = { e: 0; v: number; t: number; c: number; big?: boolean; dur?: undefined };
export type SceneEvent = EdgeEvent | NodeEvent;

export type AlgoResult = { ev: SceneEvent[]; result?: string };
export type Algo = {
  group: "explore" | "color";
  name: string;
  note: string;
  run(G: Graph, src: number): AlgoResult;
};

const edgeEv = (
  a: number,
  b: number,
  t: number,
  dur: number,
  c: number,
  fade?: number,
  w?: number,
  key?: string,
): EdgeEvent => ({ e: 1, a, b, t, dur, c, fade, w, key });
const nodeEv = (v: number, t: number, c: number, big?: boolean): NodeEvent => ({
  e: 0,
  v,
  t,
  c,
  big,
});

export function bfsTree(G: Graph, src: number) {
  const dist = new Int16Array(G.n).fill(-1),
    par = new Int32Array(G.n).fill(-1),
    order = [src];
  dist[src] = 0;
  for (let h = 0; h < order.length; h++) {
    const u = order[h];
    for (const v of G.nbrs[u])
      if (dist[v] < 0) {
        dist[v] = dist[u] + 1;
        par[v] = u;
        order.push(v);
      }
  }
  return { dist, par, order, maxD: dist[order[order.length - 1]] };
}

// 1手 = 1単位で作った出来事の時刻を、全体が total 秒前後に収まるよう伸縮する
export function pace(
  ev: { t: number; dur?: number }[],
  from: number,
  total: number,
  min = 0.012,
  max = 0.09,
) {
  const units = Math.max(1, ...ev.map((e) => e.t + (e.dur || 0)));
  const s = clamp(total / units, min, max);
  for (const e of ev) {
    e.t = from + e.t * s;
    if (e.dur) e.dur *= s;
  }
  return from + units * s;
}

/* k 色での塗り分け: 「まだ選べる色が一番少ない頂点」から順に塗り(DSatur)、
   どの色も置けなければ1つ前に戻って別の色を試す(バックトラック) */
export function kColoring(G: Graph, src: number, k: number, limit: number) {
  const col = new Int8Array(G.n).fill(-1),
    stack: [number, number][] = [],
    ev: SceneEvent[] = [];
  let t = 0,
    tries = 0,
    backs = 0;
  const pick = () => {
    let best = -1,
      bs = -1,
      bd = -1;
    for (let v = 0; v < G.n; v++) {
      if (col[v] >= 0) continue;
      const sat = new Set();
      let deg = 0;
      for (const u of G.nbrs[v]) {
        if (col[u] >= 0) sat.add(col[u]);
        else deg++;
      }
      if (sat.size > bs || (sat.size === bs && deg > bd)) {
        bs = sat.size;
        bd = deg;
        best = v;
      }
    }
    return best;
  };
  let v = src,
    c0 = 0;
  for (;;) {
    if (tries > limit) return { ok: false, cut: true, ev, tries, backs };
    let placed = false;
    for (let c = c0; c < k; c++) {
      tries++;
      const bad = G.nbrs[v].find((u) => col[u] === c);
      if (bad === undefined) {
        col[v] = c;
        stack.push([v, c]);
        ev.push(nodeEv(v, t, PAL.cat(c), true));
        t += 1;
        placed = true;
        break;
      }
      ev.push(edgeEv(v, bad, t, 0.5, PAL.BAD, 0.35));
      t += 0.5;
    }
    if (placed) {
      if (stack.length === G.n) return { ok: true, ev, tries, backs };
      v = pick();
      c0 = 0;
    } else {
      if (!stack.length) return { ok: false, ev, tries, backs };
      backs++;
      const [pv, pc] = stack.pop()!;
      col[pv] = -1;
      ev.push(nodeEv(pv, t, -1));
      t += 0.5;
      v = pv;
      c0 = pc + 1;
    }
  }
}

/* 辺の塗り分け: 1つの頂点に集まる辺がすべて違う色になるように塗る(制約の多い辺から、バックトラックつき) */
export function edgeColoring(G: Graph, k: number, limit: number) {
  const m = G.shape.edges.length,
    col = new Int8Array(m).fill(-1),
    stack: [number, number][] = [],
    ev: SceneEvent[] = [];
  const inc: number[][] = Array.from({ length: G.n }, () => []);
  G.shape.edges.forEach(([a, b], e) => {
    inc[a].push(e);
    inc[b].push(e);
  });
  const adj = G.shape.edges.map(([a, b], e) => [...inc[a], ...inc[b]].filter((f) => f !== e));
  const pick = () => {
    let best = -1,
      bs = -1;
    for (let e = 0; e < m; e++) {
      if (col[e] >= 0) continue;
      const sat = new Set(adj[e].map((f) => col[f]).filter((c) => c >= 0)).size;
      if (sat > bs) {
        bs = sat;
        best = e;
      }
    }
    return best;
  };
  let e = (Math.random() * m) | 0,
    c0 = 0,
    t = 0,
    tries = 0;
  for (;;) {
    if (tries > limit) return { ok: false, cut: true, ev };
    let placed = false;
    const [a, b] = G.shape.edges[e];
    for (let c = c0; c < k; c++) {
      tries++;
      const bad = adj[e].find((f) => col[f] === c);
      if (bad === undefined) {
        col[e] = c;
        stack.push([e, c]);
        ev.push({ ...edgeEv(a, b, t, 1, PAL.cat(c), 0, 2.6, "e" + e), alpha: 0.42 });
        t += 1;
        placed = true;
        break;
      }
      const [x, y] = G.shape.edges[bad];
      ev.push(edgeEv(x, y, t, 0.5, PAL.BAD, 0.35));
      t += 0.5;
    }
    if (placed) {
      if (stack.length === m) return { ok: true, ev };
      e = pick();
      c0 = 0;
    } else {
      if (!stack.length) return { ok: false, ev };
      const [pe, pc] = stack.pop()!;
      col[pe] = -1;
      const [x, y] = G.shape.edges[pe];
      ev.push(edgeEv(x, y, t, 0.5, -1, 0, 2.6, "e" + pe));
      t += 0.5;
      e = pe;
      c0 = pc + 1;
    }
  }
}

export const ALGOS = {
  bfs: {
    group: "explore",
    name: "幅優先探索",
    note: "近い順に1ホップずつ、波のように全体へ広がる",
    run(G, src) {
      const { dist, par, order, maxD } = bfsTree(G, src),
        s = CFG.bfsStep,
        ev: SceneEvent[] = [nodeEv(src, 0, PAL.ramp(0))];
      for (const v of order.slice(1)) {
        const d = dist[v],
          c = PAL.ramp(d / (maxD + 1));
        ev.push(edgeEv(par[v], v, (d - 1) * s, s, c), nodeEv(v, d * s, c));
      }
      return { ev };
    },
  },
  greedy: {
    group: "color",
    name: "貪欲彩色",
    note: "近い順に、隣と違う色のうち一番若い色で塗る。速いが、必要以上の色を使うことがある",
    run(G, src) {
      const { order } = bfsTree(G, src),
        s = Math.min(0.1, 4 / G.n),
        col = new Int8Array(G.n).fill(-1),
        ev: SceneEvent[] = [];
      let used = 0;
      order.forEach((v, i) => {
        const taken = new Set(G.nbrs[v].map((u) => col[u]));
        let c = 0;
        while (taken.has(c)) c++;
        col[v] = c;
        used = Math.max(used, c + 1);
        ev.push(nodeEv(v, i * s, PAL.cat(c), true));
      });
      return { ev, result: `${used}色を使った` };
    },
  },
  three: {
    group: "color",
    name: "3色の塗り分け",
    note: "隣どうしが同じ色にならないよう、3色だけで塗れるかを試す。行き詰まったら戻って塗り直す(白い線はぶつかった所)。3色で無理なら4色で塗る",
    run(G, src) {
      const r3 = kColoring(G, src, 3, 4000);
      const ev = r3.ev;
      let t = pace(ev, 0, 5);
      if (r3.ok) {
        const used = new Set(ev.filter((e) => e.e === 0 && e.c >= 0).map((e) => e.c)).size;
        return { ev, result: used < 3 ? `${used}色で塗れた(3色も要らなかった)` : "3色で塗れた" };
      }
      // 3色では塗れないと分かったら、少し間を置いて4色で塗り直す
      t += 0.8;
      for (let v = 0; v < G.n; v++) ev.push(nodeEv(v, t, -1));
      let r4 = kColoring(G, src, 4, 6000);
      for (let i = 0; i < 3 && !r4.ok; i++) r4 = kColoring(G, (Math.random() * G.n) | 0, 4, 6000);
      pace(r4.ev, t + 0.2, 3);
      return {
        ev: ev.concat(r4.ev),
        result: r3.cut ? "3色では途中で打ち切り → 4色で塗った" : "3色では塗れない → 4色で塗った",
      };
    },
  },
  bipartite: {
    group: "color",
    name: "2色の塗り分け",
    note: "近い順に2色を交互に塗る(二部グラフの判定)。同じ色どうしがつながったら、その原因の奇数の輪を示して止まる",
    run(G, src) {
      const s = Math.min(0.12, 4 / G.n),
        col = new Int8Array(G.n).fill(-1),
        par = new Int32Array(G.n).fill(-1),
        queue = [src],
        ev: SceneEvent[] = [];
      col[src] = 0;
      ev.push(nodeEv(src, 0, PAL.cat(0), true));
      let t = 0;
      for (let h = 0; h < queue.length; h++) {
        const u = queue[h];
        for (const w of G.nbrs[u]) {
          if (col[w] < 0) {
            col[w] = 1 - col[u];
            par[w] = u;
            queue.push(w);
            t += s;
            ev.push(nodeEv(w, t, PAL.cat(col[w]), true));
          } else if (col[w] === col[u]) {
            // u と w の共通の祖先までをたどると、奇数の長さの輪になる
            const up = (x: number) => {
              const p = [];
              for (; x >= 0; x = par[x]) p.push(x);
              return p;
            };
            const pu = up(u),
              pw = up(w),
              inW = new Set(pw);
            const lca = pu.find((x) => inW.has(x))!;
            const cyc = [
              ...pu.slice(0, pu.indexOf(lca) + 1),
              ...pw.slice(0, pw.indexOf(lca)).reverse(),
              u,
            ];
            t += 0.4;
            for (let i = 0; i + 1 < cyc.length; i++)
              ev.push(edgeEv(cyc[i], cyc[i + 1], t + i * 0.08, 0.08, PAL.BAD, 0, 3.2));
            return { ev, result: `${cyc.length - 1}本の辺の輪があるので2色では塗れない` };
          }
        }
      }
      return { ev, result: "2色で塗れた(二部グラフ)" };
    },
  },
  edges: {
    group: "color",
    name: "辺の塗り分け",
    note: "1つの点に集まる辺がすべて違う色になるよう、辺を塗る。集まる辺の最大本数と同じ色数で塗れるかを試す",
    run(G) {
      const D = Math.max(...G.nbrs.map((l) => l.length));
      let r = edgeColoring(G, D, 4000),
        k = D;
      if (!r.ok) {
        r = edgeColoring(G, D + 1, 20000);
        k = D + 1;
      }
      pace(r.ev, 0, 6, 0.008, 0.06);
      return { ev: r.ev, result: `${k}色で塗れた(1点に集まる辺は最大${D}本)` };
    },
  },
} satisfies Record<string, Algo>;

export type AlgoId = keyof typeof ALGOS;

// クリックで実行する処理: 実際に正しい結果を出しているか、出来事の列が再生できる形か
import { describe, expect, test } from "vitest";
import { loadHero } from "./load-hero";
import {
  edgeKey,
  finalKeptEdges,
  finalNodeColors,
  graphOf,
  properColorCount,
  SHAPES,
  type Graph,
} from "./helpers";

const hero = loadHero();
const graphs = Object.fromEntries(SHAPES.map((name) => [name, graphOf(hero, hero[name]())])) as Record<
  (typeof SHAPES)[number],
  Graph
>;
/** 塗り分けの色番号(PAL.cat の値) → 何番目の色か */
const catIndex = (c: number) => c - hero.PAL.cat(0);
/** 各形で試すクリック位置 */
const sources = (g: Graph) => [0, Math.floor(g.n / 2), g.n - 1];

describe("出来事の列の形", () => {
  const palSize = 13;
  test.each(Object.keys(hero.ALGOS))("%s: 時刻・頂点番号・色番号が範囲内", (id) => {
    for (const name of SHAPES) {
      const g = graphs[name];
      const { ev } = hero.ALGOS[id].run(g, 0);
      expect(ev.length).toBeGreaterThan(0);
      for (const e of ev) {
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.c).toBeGreaterThanOrEqual(-1);
        expect(e.c).toBeLessThan(palSize);
        if (e.e === 0) {
          expect(e.v).toBeGreaterThanOrEqual(0);
          expect(e.v).toBeLessThan(g.n);
        } else {
          expect(e.dur).toBeGreaterThan(0);
          expect(g.nbrs[e.a]).toContain(e.b);
        }
      }
    }
  });

  // ジオデシック球は「3色で約5秒 → 間 → 4色で約3秒」の2段になるので、合計は10秒弱
  test.each(SHAPES)("%s: 割り当てた処理の再生は 10 秒以内に終わる", (name) => {
    const g = graphs[name];
    const algo = hero.ALGOS[hero.Scene.list[SHAPES.indexOf(name)].algo];
    const { ev } = algo.run(g, 0);
    const last = Math.max(...ev.map((e: any) => e.t + (e.dur || 0)));
    expect(last).toBeLessThan(10);
  });
});

describe("bfsTree", () => {
  test.each(SHAPES)("%s: 距離・親・訪問順が幅優先探索として正しい", (name) => {
    const g = graphs[name];
    for (const src of sources(g)) {
      const { dist, par, order, maxD } = hero.bfsTree(g, src);
      expect(dist[src]).toBe(0);
      expect(order[0]).toBe(src);
      expect(new Set(order).size).toBe(g.n);
      for (let i = 1; i < order.length; i++) expect(dist[order[i]]).toBeGreaterThanOrEqual(dist[order[i - 1]]);
      for (const [a, b] of g.shape.edges) expect(Math.abs(dist[a] - dist[b])).toBeLessThanOrEqual(1);
      for (const v of order.slice(1)) {
        expect(g.nbrs[v]).toContain(par[v]);
        expect(dist[par[v]]).toBe(dist[v] - 1);
      }
      expect(maxD).toBe(Math.max(...dist));
    }
  });
});

describe("幅優先探索(ALGOS.bfs)", () => {
  test.each(SHAPES)("%s: 全頂点に1回ずつ届き、探索木の辺を距離の順に伸ばす", (name) => {
    const g = graphs[name];
    const src = 0;
    const { dist, par } = hero.bfsTree(g, src);
    const { ev } = hero.ALGOS.bfs.run(g, src);
    const nodes = ev.filter((e: any) => e.e === 0);
    const edges = ev.filter((e: any) => e.e === 1);
    expect(nodes.map((e: any) => e.v).sort((a: number, b: number) => a - b)).toEqual([...Array(g.n).keys()]);
    expect(edges).toHaveLength(g.n - 1);
    for (const e of edges) expect(par[e.b]).toBe(e.a);
    for (const e of nodes) expect(e.t).toBeCloseTo(dist[e.v] * hero.CFG.bfsStep, 9);
    // 色は橙の濃淡(PAL.ramp)のどれか
    const ramp = new Set([0, 0.5, 0.99].map(hero.PAL.ramp));
    for (const e of ev) expect(ramp).toContain(e.c);
  });
});

describe("k 色の塗り分け(kColoring)", () => {
  test.each(["fullerene", "torus", "hypercube"] as const)("%s: 3色で正しく塗れる", (name) => {
    const g = graphs[name];
    for (const src of sources(g)) {
      const r = hero.kColoring(g, src, 3, 4000);
      expect(r.ok).toBe(true);
      const k = properColorCount(g, finalNodeColors(g.n, r.ev));
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThanOrEqual(3);
    }
  });

  test("6次元超立方体は二部グラフなので、3色を許しても2色で済む", () => {
    const g = graphs.hypercube;
    const r = hero.kColoring(g, 0, 3, 4000);
    expect(properColorCount(g, finalNodeColors(g.n, r.ev))).toBe(2);
  });

  test("ジオデシック球は3色では塗れない(打ち切りではなく、探索し尽くして失敗する)", () => {
    const g = graphs.geodesic;
    for (const src of sources(g)) {
      const r = hero.kColoring(g, src, 3, 4000);
      expect(r.ok).toBe(false);
      expect(r.cut).toBeUndefined();
      expect(r.backs).toBeGreaterThan(0);
    }
  });

  test("ジオデシック球は4色なら塗れる。試行回数の上限で打ち切られることはあるが、探索し尽くして失敗することはない", () => {
    const g = graphs.geodesic;
    let ok = 0;
    for (let src = 0; src < g.n; src++) {
      const r = hero.kColoring(g, src, 4, 6000);
      if (r.ok) {
        ok++;
        expect(properColorCount(g, finalNodeColors(g.n, r.ev))).toBeLessThanOrEqual(4);
      } else {
        expect(r.cut).toBe(true);
      }
    }
    // 打ち切りは一部の開始点だけ(実装は別の開始点で最大3回やり直す)
    expect(ok / g.n).toBeGreaterThan(0.8);
  });

  test("ぶつかった印(PAL.BAD)は、同じ色の隣へ向かう辺に付く", () => {
    const g = graphs.geodesic;
    const r = hero.kColoring(g, 0, 3, 4000);
    const bad = r.ev.filter((e: any) => e.e === 1);
    expect(bad.length).toBeGreaterThan(0);
    for (const e of bad) {
      expect(e.c).toBe(hero.PAL.BAD);
      expect(g.nbrs[e.a]).toContain(e.b);
    }
  });
});

describe("3色の塗り分け(ALGOS.three)", () => {
  test.each(["fullerene", "torus"] as const)("%s: 3色で塗れたと報告し、結果も3色の正しい塗り分け", (name) => {
    const g = graphs[name];
    const { ev, result } = hero.ALGOS.three.run(g, 0);
    expect(result).toBe("3色で塗れた");
    expect(properColorCount(g, finalNodeColors(g.n, ev))).toBe(3);
  });

  test("6次元超立方体: 2色で済んだと報告する", () => {
    const g = graphs.hypercube;
    const { ev, result } = hero.ALGOS.three.run(g, 0);
    expect(result).toBe("2色で塗れた(3色も要らなかった)");
    expect(properColorCount(g, finalNodeColors(g.n, ev))).toBe(2);
  });

  test("ジオデシック球: 3色では塗れず、いったん色を外して4色で塗り直す", () => {
    const g = graphs.geodesic;
    const { ev, result } = hero.ALGOS.three.run(g, 0);
    expect(result).toBe("3色では塗れない → 4色で塗った");
    expect(properColorCount(g, finalNodeColors(g.n, ev))).toBe(4);
    // 塗り直しの前に、全頂点の色を外す出来事が同じ時刻に並ぶ
    const clears = ev.filter((e: any) => e.e === 0 && e.c === -1);
    const byTime = Map.groupBy(clears, (e: any) => e.t);
    expect([...byTime.values()].some((l) => l.length === g.n)).toBe(true);
  });

  test("ジオデシック球: クリック位置と乱数を変えても、4色の塗り直しは最後まで終わる", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const h = loadHero({ seed });
      const g = graphOf(h, h.geodesic());
      const { ev } = h.ALGOS.three.run(g, (seed * 7) % g.n);
      expect(properColorCount(g, finalNodeColors(g.n, ev))).toBe(4);
    }
  });
});

describe("2色の塗り分け(ALGOS.bipartite)", () => {
  test("6次元超立方体: 全頂点を2色で正しく塗り、ぶつかった印はない", () => {
    const g = graphs.hypercube;
    for (const src of sources(g)) {
      const { ev, result } = hero.ALGOS.bipartite.run(g, src);
      expect(result).toBe("2色で塗れた(二部グラフ)");
      expect(properColorCount(g, finalNodeColors(g.n, ev))).toBe(2);
      expect(ev.filter((e: any) => e.e === 1)).toHaveLength(0);
    }
  });

  // 二部グラフでない形では、原因の奇数の輪を示して止まる。輪の長さは検討メモ 7章の表のとおり
  test.each([
    ["fullerene", 5],
    ["torus", 11],
    ["geodesic", 3],
  ] as const)("%s: 長さ %i の奇数の輪を示す", (name, len) => {
    const g = graphs[name];
    for (const src of sources(g)) {
      const { ev, result } = hero.ALGOS.bipartite.run(g, src);
      const cyc = ev.filter((e: any) => e.e === 1);
      expect(cyc).toHaveLength(len);
      expect(result).toBe(`${len}本の辺の輪があるので2色では塗れない`);
      // 辺がつながって1周し、同じ辺を2度通らない
      for (let i = 0; i < cyc.length; i++) {
        expect(cyc[i].c).toBe(hero.PAL.BAD);
        expect(g.nbrs[cyc[i].a]).toContain(cyc[i].b);
        expect(cyc[(i + 1) % cyc.length].a).toBe(cyc[i].b);
      }
      expect(new Set(cyc.map((e: any) => edgeKey(e.a, e.b))).size).toBe(len);
    }
  });
});

describe("辺の塗り分け(ALGOS.edges)", () => {
  /** 1つの頂点に集まる辺がすべて違う色で、全辺が塗られているか。使った色の数を返す */
  function properEdgeColorCount(g: Graph, ev: any[]) {
    const kept = finalKeptEdges(ev);
    expect(new Set(kept.map((e) => edgeKey(e.a, e.b))).size).toBe(g.shape.edges.length);
    const seen = new Map<number, Set<number>>();
    for (const { a, b, c } of kept) {
      for (const v of [a, b]) {
        if (!seen.has(v)) seen.set(v, new Set());
        expect(seen.get(v)!.has(c)).toBe(false);
        seen.get(v)!.add(c);
      }
    }
    return new Set(kept.map((e) => e.c)).size;
  }

  test("C60 フラーレン: 1点に集まる辺の数(3)と同じ3色で塗れる", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const h = loadHero({ seed });
      const g = graphOf(h, h.fullerene());
      const { ev, result } = h.ALGOS.edges.run(g, 0);
      expect(result).toBe("3色で塗れた(1点に集まる辺は最大3本)");
      expect(properEdgeColorCount(g, ev)).toBe(3);
    }
  });

  test.each(["torus", "hypercube", "geodesic"] as const)(
    "%s: 最大次数か、それより1つ多い色数で正しく塗れる",
    (name) => {
      const g = graphs[name];
      const D = Math.max(...g.nbrs.map((l) => l.length));
      const { ev, result } = hero.ALGOS.edges.run(g, 0);
      const k = properEdgeColorCount(g, ev);
      expect([D, D + 1]).toContain(k);
      expect(result).toBe(`${k}色で塗れた(1点に集まる辺は最大${D}本)`);
    },
  );

  test("塗った辺は半透明で残り、塗り直した辺は c = -1 で消える", () => {
    const g = graphs.fullerene;
    const { ev } = hero.ALGOS.edges.run(g, 0);
    for (const e of ev.filter((e: any) => e.e === 1 && !e.fade)) {
      expect(e.key).toMatch(/^e\d+$/);
      if (e.c >= 0) expect(e.alpha).toBe(0.42);
    }
    expect(catIndex(Math.max(...ev.filter((e: any) => !e.fade).map((e: any) => e.c)))).toBe(2);
  });
});

describe("pace", () => {
  test("1手 = 1単位の時刻を、全体が total 秒に収まるよう伸縮し、終わりの時刻を返す", () => {
    const ev = [
      { t: 0, dur: 1 },
      { t: 1 },
      { t: 9, dur: 1 },
    ];
    const end = hero.pace(ev, 2, 0.5, 0, 1);
    expect(end).toBeCloseTo(2.5, 9);
    expect(ev.map((e) => e.t)).toEqual([2, 2.05, 2.45]);
    expect(ev[0].dur).toBeCloseTo(0.05, 9);
  });

  test("1単位の長さは min〜max に収まる", () => {
    const short = [{ t: 0 }, { t: 1 }];
    hero.pace(short, 0, 100, 0.01, 0.09);
    expect(short[1].t).toBeCloseTo(0.09, 9);
    const long = [{ t: 0 }, { t: 1000 }];
    hero.pace(long, 0, 1, 0.01, 0.09);
    expect(long[1].t).toBeCloseTo(10, 9);
  });
});

// 有名なグラフの形: 頂点数・辺数・次数が数学的に正しいか
import { describe, expect, test } from "vitest";
import { loadHero } from "./load-hero";
import { edgeKey, graphOf, SHAPES, type Shape } from "./helpers";

const hero = loadHero();

function degrees(shape: Shape) {
  const deg = new Array(shape.nodes.length).fill(0);
  for (const [a, b] of shape.edges) {
    deg[a]++;
    deg[b]++;
  }
  return deg;
}

/** 次数ごとの頂点の数 { 次数: 個数 } */
function degreeHistogram(shape: Shape) {
  const h: Record<number, number> = {};
  for (const d of degrees(shape)) h[d] = (h[d] ?? 0) + 1;
  return h;
}

describe.each(SHAPES)("%s", (name) => {
  const shape: Shape = hero[name]();

  test("自己ループと重複した辺がない", () => {
    const keys = new Set<string>();
    for (const [a, b] of shape.edges) {
      expect(a).not.toBe(b);
      keys.add(edgeKey(a, b));
    }
    expect(keys.size).toBe(shape.edges.length);
  });

  test("辺の端点がすべて頂点の範囲にある", () => {
    for (const [a, b] of shape.edges) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(shape.nodes.length);
    }
  });

  test("連結している", () => {
    const g = graphOf(hero, shape);
    const { order } = hero.bfsTree(g, 0);
    expect(order.length).toBe(g.n);
  });

  test("座標は3次元で、原点からの距離が1以下に収まる", () => {
    for (const p of shape.nodes) {
      expect(p).toHaveLength(3);
      expect(Math.hypot(...p)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

test("C60 フラーレン: 60頂点・90辺で、どの頂点も次数3", () => {
  const s = hero.fullerene();
  expect([s.nodes.length, s.edges.length]).toEqual([60, 90]);
  expect(degreeHistogram(s)).toEqual({ 3: 60 });
});

test("トーラス: 32×11 の格子で、352頂点・704辺、どの頂点も次数4", () => {
  const s = hero.torus();
  expect([s.nodes.length, s.edges.length]).toEqual([352, 704]);
  expect(degreeHistogram(s)).toEqual({ 4: 352 });
});

test("6次元超立方体: 64頂点・192辺、どの頂点も次数6で、辺は1ビットだけ違う頂点を結ぶ", () => {
  const s = hero.hypercube();
  expect([s.nodes.length, s.edges.length]).toEqual([64, 192]);
  expect(degreeHistogram(s)).toEqual({ 6: 64 });
  for (const [a, b] of s.edges) {
    const x = a ^ b;
    expect(x & (x - 1)).toBe(0);
  }
});

test("ジオデシック球: 正二十面体を2回分割し、162頂点・480辺、次数5が12個で残りは次数6、全頂点が単位球上", () => {
  const s = hero.geodesic();
  expect([s.nodes.length, s.edges.length]).toEqual([162, 480]);
  expect(degreeHistogram(s)).toEqual({ 5: 12, 6: 150 });
  for (const p of s.nodes) expect(Math.hypot(...p)).toBeCloseTo(1, 9);
});

test("形の並びと、形ごとに割り当てた処理(検討メモ 9章)", () => {
  expect(hero.showcase().map((s: any) => [s.name, s.algo])).toEqual([
    ["C60 フラーレン", "edges"],
    ["トーラス", "bfs"],
    ["6次元超立方体", "bipartite"],
    ["ジオデシック球", "three"],
  ]);
});

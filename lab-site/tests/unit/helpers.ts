// テスト用の小道具: グラフの用意と、出来事の列の再生
import { loadHero } from "./load-hero";

export type Hero = ReturnType<typeof loadHero>;
export type Shape = { name: string; nodes: number[][]; edges: [number, number][] };
/** 処理に渡すグラフ(実装では Scene がこの形を兼ねている) */
export type Graph = { n: number; nbrs: number[][]; shape: Shape };

export const SHAPES = ["fullerene", "torus", "hypercube", "geodesic"] as const;

export function graphOf(hero: Hero, shape: Shape): Graph {
  hero.Scene.load(shape);
  const { n, nbrs } = hero.Scene;
  return { n, nbrs: nbrs.map((l: number[]) => [...l]), shape };
}

/** 頂点への出来事を時刻順に適用し、最後に付いている色(パレット番号、-1 は色なし)を返す */
export function finalNodeColors(n: number, events: any[]): number[] {
  const col = new Array(n).fill(-1);
  for (const ev of [...events].sort((x, y) => x.t - y.t)) if (ev.e === 0) col[ev.v] = ev.c;
  return col;
}

/**
 * 残る辺(fade のない辺の出来事)を時刻順に適用し、最後に残っている辺を返す。
 * 描画と同じく、key が同じものは後の出来事で上書きされ、c = -1 で消える
 */
export function finalKeptEdges(events: any[]): { a: number; b: number; c: number }[] {
  const kept = new Map<string, any>();
  let idx = 0;
  for (const ev of [...events].sort((x, y) => x.t - y.t)) {
    if (ev.e !== 1 || ev.fade) continue;
    const key = ev.key || "i" + idx++;
    if (ev.c < 0) kept.delete(key);
    else kept.set(key, ev);
  }
  return [...kept.values()].map(({ a, b, c }) => ({ a, b, c }));
}

/** 隣どうしが同じ色でなく、全頂点が塗られているか。使った色の数を返す(不正なら -1) */
export function properColorCount(g: Graph, col: number[]): number {
  if (col.some((c) => c < 0)) return -1;
  for (const [a, b] of g.shape.edges) if (col[a] === col[b]) return -1;
  return new Set(col).size;
}

export const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

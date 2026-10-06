// テストで使う実装を1つにまとめて渡す。乱数は種を固定する
import * as algorithms from "../../src/algorithms";
import { CFG } from "../../src/config";
import * as graphs from "../../src/graphs";
import { PAL } from "../../src/palette";
import { showcase } from "../../src/scene";

/** 乱数を固定する(mulberry32) */
export function seededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function loadHero({ seed = 1 }: { seed?: number } = {}) {
  Math.random = seededRandom(seed);
  return { ...graphs, ...algorithms, CFG, PAL, showcase } as Record<string, any>;
}

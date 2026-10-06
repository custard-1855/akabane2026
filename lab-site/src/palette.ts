// 色(CSS の変数から読む)
//
// 基本は2色: 常時の信号は青、クリックで起こした処理は橙(先頭ほど明るい)。
// 彩色の処理だけ、塗り分けの色(最大7色)を使う
import { hexRgb, mix, type RGB } from "./color";

export type Colors = {
  bg: RGB;
  ink: RGB;
  muted: RGB;
  edge: RGB;
  accent: RGB;
  base: Record<"accent" | "accent2" | "c3" | "c4" | "c5" | "c6" | "c7", RGB>;
  /** 背景が暗いか */
  dark: boolean;
  /** 色番号 → 色。番号の意味は PAL */
  pal: RGB[];
};

/** C.pal の色番号 */
export const PAL = {
  AMB: 0, // 常時の信号
  ramp: (t: number) => 1 + Math.min(2, Math.floor(t * 3)), // 処理の進み具合 0〜1(橙の濃淡)
  cat: (k: number) => 5 + (k % 7), // 塗り分けの色番号
  BAD: 12, // ぶつかった・失敗した印
};

/** 今のテーマの色。readColors() で読み直す */
export const C = {} as Colors;

export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string) => hexRgb(cs.getPropertyValue(n));
  Object.assign(C, {
    bg: g("--bg"),
    ink: g("--ink"),
    muted: g("--muted"),
    edge: g("--edge"),
    accent: g("--accent"),
  });
  C.base = {
    accent: g("--accent"),
    accent2: g("--accent2"),
    c3: g("--c3"),
    c4: g("--c4"),
    c5: g("--c5"),
    c6: g("--c6"),
    c7: g("--c7"),
  };
  C.dark = (C.bg[0] + C.bg[1] + C.bg[2]) / 3 < 128;
  applyScheme();
}

function applyScheme() {
  const b = C.base;
  C.pal = [
    b.accent,
    b.accent2,
    mix(b.accent2, C.bg, 0.3),
    mix(b.accent2, C.bg, 0.5),
    mix(b.accent, C.bg, 0.4),
    // 塗り分けの色は、常時の信号の青と混ざらないよう橙から始め、青は最後に回す
    b.accent2,
    b.c3,
    b.c4,
    b.c5,
    b.c6,
    b.c7,
    b.accent,
    C.ink,
  ];
}

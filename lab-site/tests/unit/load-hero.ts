// index.html のスクリプトを Node 上で動かし、即時関数の中の関数を取り出す。
// 実装側には手を入れず、DOM と canvas は「何を呼ばれても黙って受け流す」スタブで置き換える。
// ファイルを分けた後は、このファイルを各モジュールの import に置き換えれば、テスト本体はそのまま使える。
import { readFileSync } from "node:fs";
import vm from "node:vm";

const EXPORTS = [
  "fullerene",
  "torus",
  "hypercube",
  "geodesic",
  "bfsTree",
  "kColoring",
  "edgeColoring",
  "pace",
  "ALGOS",
  "PAL",
  "CFG",
  "Scene",
];

/** 何を読んでも呼んでも自分を返す。数値や文字列に変換されると 0 / "" になる */
function blackhole(): any {
  const target = function () {};
  const proxy: any = new Proxy(target, {
    get: (_t, key) => {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === "then") return undefined;
      return proxy;
    },
    set: () => true,
    apply: () => proxy,
    construct: () => proxy,
  });
  return proxy;
}

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

const CSS_VARS: Record<string, string> = {
  "--bg": "#0a1020",
  "--ink": "#e9eef7",
  "--muted": "#8d9ab0",
  "--edge": "#34425f",
  "--accent": "#6cc4ff",
  "--accent2": "#f5b14c",
  "--c3": "#4fd1a5",
  "--c4": "#f46b8a",
  "--c5": "#b28dff",
  "--c6": "#4cc9e0",
  "--c7": "#e6cf5c",
};

export function loadHero({ seed = 1 }: { seed?: number } = {}) {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("index.html にスクリプトが見つからない");
  const body = script.trim();
  if (!body.startsWith("(() => {") || !body.endsWith("})();")) {
    throw new Error("スクリプトが即時関数の形になっていない");
  }
  const source =
    body.slice("(() => {".length, -"})();".length) + `\nglobalThis.__hero = { ${EXPORTS.join(", ")} };`;

  const element = () => {
    const el = blackhole();
    return new Proxy(el, {
      get: (t, key) => {
        if (key === "getBoundingClientRect") return () => ({ left: 0, top: 0, width: 1280, height: 640 });
        if (key === "textContent") return "";
        return t[key as any];
      },
    });
  };
  const elements = new Map<string, any>();
  const context: any = {
    document: {
      getElementById: (id: string) => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: () => element(),
      addEventListener: () => {},
      documentElement: element(),
      hidden: false,
    },
    getComputedStyle: () => ({ getPropertyValue: (name: string) => CSS_VARS[name] ?? "#000000" }),
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    localStorage: { getItem: () => null, setItem: () => {} },
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    ResizeObserver: class { observe() {} },
    IntersectionObserver: class { observe() {} },
    MutationObserver: class { observe() {} },
    Path2D: class { moveTo() {} lineTo() {} },
    devicePixelRatio: 1,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(`Math.random = (${seededRandom.toString()})(${seed});`, context);
  vm.runInContext(source, context);
  return context.__hero as Record<string, any>;
}

// 入門の段。1つの段の問い・操作・描き方・始めの状態をここに1か所ずつまとめる。
// STEPS から段を外せば、その段だけがなくなり、進み具合の数も合う。DOM に依存させず、Node で直接テストする

// ---- グラフ(入門用に新しく作った6頂点8辺)。座標は描く側(main.js)が持つ ----

export const NAMES = ["A", "B", "C", "D", "E", "F"];
export const EDGES = ["A-B", "A-C", "B-C", "B-D", "C-E", "D-E", "D-F", "E-F"];

const key = (u, v) => [u, v].sort().join("-");
const adj = (u, v) => EDGES.includes(key(u, v));
const neighbors = (u) => NAMES.filter((v) => adj(u, v));

/**
 * 吹き出し。anchor は点の名前、線の "A-B"、図の真ん中の "center" のどれか
 * @typedef {{ anchor: string, title: string | null, text: string, kind: "term" | "hint" }} Bubble
 */

/** 用語の吹き出しを出す */
function term(st, anchor, title, text) {
  st.bubble = { anchor, title, text, kind: "term" };
}
/** 間違えた理由などの吹き出しを出す */
function hint(st, anchor, text) {
  st.bubble = { anchor, title: null, text, kind: "hint" };
}

// ---- 段 ----
// 段は { id, label, start, prompt, vertex?, edge?, theme?, look } の形にする。
//   start: 段の始めの状態(ready と bubble は begin が足す)
//   prompt: 上の字幕に出す問い
//   vertex / edge / theme: 点・線・読みかえのボタンをタップしたとき。持たない段では何もしない
//   look: 描き方。次のうち要るものだけを返し、ほかは描かない
//     dir 線の向き、w 線の数字、hl 光らせる線、colors 点の色、pathVerts / pathEdges たどった点と線、
//     focus 今いる点、marked 見つけた点、removed 消した線、sum 合計の札、themes 読みかえのボタンと問い

// 点を1つ選んでから(sub 0 → 1)、線を1本選ぶ
const vertex = {
  id: "vertex",
  label: "頂点・辺",
  start: () => ({ sub: 0 }),
  prompt: (st) => (st.sub === 0 ? "点をどれか1つタップしよう" : "次は、線を1本タップしよう"),
  vertex(st, v) {
    if (st.sub === 1) return hint(st, v, "今度は線のほうをタップしよう");
    term(st, v, "頂点", "ものを表す点。交差点、駅、人、コンピュータ…なんでもよい");
    st.sub = 1;
  },
  edge(st, k) {
    if (st.sub === 0) return hint(st, k, "まずは点のほうをタップしよう");
    term(st, k, "辺", "2つの頂点のつながり。頂点と辺でつながりを表したものを「グラフ」という");
    st.ready = true;
  },
  look: () => ({}),
};

const adjacent = {
  id: "adjacent",
  label: "隣接",
  start: () => ({ found: new Set() }),
  prompt: () => "B と線で直接つながっている点を、全部タップしよう",
  vertex(st, v) {
    if (v === "B") return;
    if (!adj("B", v)) return hint(st, v, "B とは線で直接つながっていない");
    st.found.add(v);
    if (st.found.size === neighbors("B").length) {
      term(st, "B", "隣接", "辺で直接結ばれた頂点どうし。B の隣は A・C・D の3つ");
      st.ready = true;
    } else st.bubble = null;
  },
  look: (st) => ({ marked: st.found, focus: "B" }),
};

/** たどった点の列を、光らせる点と線にする。focus は今いる点 */
function trail(path) {
  return {
    pathVerts: new Set(path),
    pathEdges: new Set(path.slice(1).map((v, i) => key(path[i], v))),
    focus: path.at(-1),
  };
}

const path = {
  id: "path",
  label: "経路",
  start: () => ({ path: ["A"] }),
  prompt: () => "A から F まで、線をたどって点を順にタップしよう",
  vertex(st, v) {
    const last = st.path.at(-1);
    if (st.path.length > 1 && v === st.path.at(-2)) return void st.path.pop();
    if (st.path.includes(v)) return hint(st, v, "同じ点は2回通らない");
    if (!adj(last, v)) return hint(st, v, `${last} と線でつながった点を選ぼう`);
    st.path.push(v);
    st.bubble = null;
    if (v === "F") {
      term(st, "F", "経路", "辺をたどって進む道すじ。A から F への経路はほかにもある");
      st.ready = true;
    }
  },
  look: (st) => trail(st.path),
};

const cycle = {
  id: "cycle",
  label: "閉路",
  start: () => ({ path: [] }),
  prompt: () => "どこかの点から出発して、ぐるっと回って元の点に戻ろう",
  vertex(st, v) {
    const last = st.path.at(-1);
    if (st.path.length === 0) return void st.path.push(v);
    if (v === st.path[0] && st.path.length >= 3 && adj(last, v)) {
      st.path.push(v);
      term(st, "center", "閉路", "ぐるりと一周して元の点に戻る経路。輪ともいう");
      st.ready = true;
      return;
    }
    if (st.path.length > 1 && v === st.path.at(-2)) return void st.path.pop();
    if (st.path.includes(v)) return hint(st, v, "同じ点は1回だけ。出発した点に戻ろう");
    if (!adj(last, v)) return hint(st, v, `${last} と線でつながった点を選ぼう`);
    st.path.push(v);
    st.bubble = null;
  },
  look: (st) => ({ ...trail(st.path), focus: null }),
};

/** removed を除いた線で全部の点がつながっているか */
function connected(removed) {
  const seen = new Set(["A"]);
  const stack = ["A"];
  while (stack.length) {
    const u = stack.pop();
    for (const v of NAMES)
      if (!seen.has(v) && adj(u, v) && !removed.has(key(u, v))) {
        seen.add(v);
        stack.push(v);
      }
  }
  return seen.size === NAMES.length;
}

const tree = {
  id: "tree",
  label: "木・連結",
  start: () => ({ removed: new Set() }),
  prompt: () => "線をタップして消し、輪をなくそう。ただし、点どうしは全部つながったままで",
  edge(st, k) {
    if (st.removed.has(k)) return void st.removed.delete(k);
    if (!connected(new Set([...st.removed, k]))) return hint(st, k, "これを消すと、ほかとつながらない点ができる");
    st.removed.add(k);
    st.bubble = null;
    // つながったまま、線が点の数より1少なくなれば輪はない
    if (EDGES.length - st.removed.size === NAMES.length - 1) {
      term(st, "center", "木・連結", "全部の点がつながっていることを「連結」という。連結で、輪がひとつもない形が「木」");
      st.ready = true;
    }
  },
  look: (st) => ({ removed: st.removed }),
};

// 向きの段。A→B は行き止まり(B から出る線がない)で、A→C→E→D→F だけが F に届く
const DIR = { "A-B": "AB", "A-C": "AC", "B-C": "CB", "B-D": "DB", "C-E": "CE", "D-E": "ED", "D-F": "DF", "E-F": "FE" };

const direction = {
  id: "direction",
  label: "向き",
  start: () => ({ path: ["A"] }),
  prompt: () => "矢印の向きにだけ進んで、A から F まで行こう",
  vertex(st, v) {
    const last = st.path.at(-1);
    if (st.path.length > 1 && v === st.path.at(-2)) {
      st.path.pop();
      st.bubble = null;
      return;
    }
    if (!adj(last, v)) return hint(st, v, `${last} と線でつながった点を選ぼう`);
    if (DIR[key(last, v)] !== last + v) return hint(st, key(last, v), "この線は逆向き。一方通行");
    st.path.push(v);
    st.bubble = null;
    if (v === "F") {
      term(st, "F", "向き", "一方通行のつながりを「向きのある辺」といい、それでできたグラフを「有向グラフ」という");
      st.ready = true;
    } else if (!NAMES.some((u) => DIR[key(v, u)] === v + u))
      hint(st, v, `${v} からはどこへも出られない。1つ前の点をタップして戻ろう`);
  },
  look: (st) => ({ ...trail(st.path), dir: DIR }),
};

// 重みの段。いちばん小さい合計は A-B-C-E-D-F の 9
const W = { "A-B": 2, "A-C": 4, "B-C": 1, "B-D": 7, "C-E": 3, "D-E": 1, "D-F": 2, "E-F": 6 };
const BEST = 9;

const weight = {
  id: "weight",
  label: "重み",
  start: () => ({ path: ["A"], sum: 0 }),
  prompt: () => "数字の合計がいちばん小さくなるように、A から F まで行こう",
  vertex(st, v) {
    const last = st.path.at(-1);
    if (st.path.length > 1 && v === st.path.at(-2)) {
      st.sum -= W[key(last, v)];
      st.path.pop();
      return;
    }
    if (st.path.includes(v)) return hint(st, v, "同じ点は2回通らない");
    if (!adj(last, v)) return hint(st, v, `${last} と線でつながった点を選ぼう`);
    st.path.push(v);
    st.sum += W[key(last, v)];
    st.bubble = null;
    if (v !== "F") return;
    if (st.sum === BEST) {
      term(st, "F", "重み", "辺についた数字。時間・費用・量など、何を表すかは問題で決まる");
      st.ready = true;
    } else {
      hint(st, "F", `合計 ${st.sum}。もっと小さくできる。A からやり直そう`);
      st.path = ["A"];
      st.sum = 0;
    }
  },
  look: (st) => ({ ...trail(st.path), w: W, sum: st.sum }),
};

// 読みかえの段。同じグラフを4本のゲームの題材として見せる
const THEMES = [
  {
    id: "delivery",
    name: "配達",
    point: "交差点",
    line: "道",
    num: "所要時間(分)",
    w: W,
    question: "A から F へ、いちばん早く届けるには?",
    answer: "いちばん早いルートは 9分",
    game: "配達員ダイクストラ",
    hl: ["A-B", "B-C", "C-E", "D-E", "D-F"],
  },
  {
    id: "fiber",
    name: "工事",
    point: "局舎",
    line: "道",
    num: "工事費(万円)",
    w: { "A-B": 3, "A-C": 2, "B-C": 5, "B-D": 4, "C-E": 6, "D-E": 3, "D-F": 7, "E-F": 2 },
    question: "全部の局舎を、いちばん安くつなぐには?",
    answer: "いちばん安い敷き方は 14万円",
    game: "工事士クラスカル",
    hl: ["A-C", "E-F", "A-B", "D-E", "B-D"],
  },
  {
    id: "radio",
    name: "電波",
    point: "基地局",
    line: "隣どうし",
    num: null,
    question: "隣どうしが同じチャンネルにならないように、番号を付けるには?",
    answer: "チャンネルは 3つで足りる",
    game: "電波技師ウェルシュ",
    colors: { A: 1, B: 2, C: 3, D: 1, E: 2, F: 3 },
  },
  {
    id: "data",
    name: "データ",
    point: "地点",
    line: "回線",
    num: "帯域",
    w: { "A-B": 4, "A-C": 3, "B-C": 2, "B-D": 3, "C-E": 5, "D-E": 2, "D-F": 4, "E-F": 3 },
    dir: { "A-B": "AB", "A-C": "AC", "B-C": "BC", "B-D": "BD", "C-E": "CE", "D-E": "ED", "D-F": "DF", "E-F": "EF" },
    question: "A から F へ、一度にいちばん多く送るには?",
    answer: "一度に送れるのは最大 7",
    game: "回線係フォード",
  },
];

const yomikae = {
  id: "yomikae",
  label: "読みかえ",
  start: () => ({ theme: null, seen: new Set() }),
  prompt: () => "同じ形を、4つの見方で見てみよう。ボタンを全部押してみよう",
  theme(st, id) {
    const t = THEMES.find((x) => x.id === id);
    st.theme = t;
    st.seen.add(id);
    const words = `頂点 = ${t.point}、辺 = ${t.line}` + (t.num ? `、重み = ${t.num}` : "");
    term(st, "center", `${t.name}として見ると`, words);
    if (st.seen.size === THEMES.length) st.ready = true;
  },
  look: (st) => ({
    dir: st.theme?.dir,
    w: st.theme?.w,
    hl: new Set(st.theme?.hl ?? []),
    colors: st.theme?.colors,
    themes: { all: THEMES, selected: st.theme, seen: st.seen },
  }),
};

/**
 * 入門の段の並び。配列の要素1つが1つの段で、[閉路, 木・連結] のように並べた段は、進み具合で同じ番号にする
 * @type {(object | object[])[]}
 */
export const STEPS = [vertex, adjacent, path, [cycle, tree], direction, weight, yomikae];

/**
 * 段を部分ごとに並べ、進み具合の番号(n / total)を添える
 * @param {(object | object[])[]} steps
 */
export function sequence(steps) {
  return steps.flatMap((s, i) => (Array.isArray(s) ? s : [s]).map((step) => ({ step, n: i + 1, total: steps.length })));
}

/** 段を始める。タップのたびに tap で書き換える状態を返す */
export function begin(step) {
  return { ready: false, bubble: /** @type {Bubble | null} */ (null), ...step.start() };
}

/**
 * タップを段に渡す。正解した後は、読みかえのボタンだけを受ける
 * @param {"vertex" | "edge" | "theme"} kind
 * @param {string} target 点の名前、線の "A-B"、題材の id
 */
export function tap(step, st, kind, target) {
  if (st.ready && kind !== "theme") return;
  step[kind]?.(st, target);
}

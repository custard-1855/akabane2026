// 入門。アプリを開くと最初に出し、グラフの基本の用語と概念を触って確かめる(GLOSSARY.md の入門)。
// 上の字幕で問いを出し、吹き出しは触った点や線の上に1つだけ出す。問いはどのゲームの言葉にも寄せず「点」「線」で出す

// ---- グラフ(入門用に新しく作った6頂点8辺) ----

const VIEW_W = 1600;
const VIEW_H = 900;
const P = { A: [220, 450], B: [560, 200], C: [560, 700], D: [1040, 200], E: [1040, 700], F: [1380, 450] };
const NAMES = Object.keys(P);
const EDGES = ["A-B", "A-C", "B-C", "B-D", "C-E", "D-E", "D-F", "E-F"];
const CENTER = [800, 450];

const key = (u, v) => [u, v].sort().join("-");
const ends = (k) => k.split("-");
const adj = (u, v) => EDGES.includes(key(u, v));
const mid = (k) => {
  const [u, v] = ends(k);
  return [(P[u][0] + P[v][0]) / 2, (P[u][1] + P[v][1]) / 2];
};
const neighbors = (u) => NAMES.filter((v) => adj(u, v));

/** removed を除いた辺で全部の頂点がつながっているか */
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

// 向きの段。A→B は行き止まり(B から出る辺がない)で、A→C→E→D→F だけが F に届く
const DIR = { "A-B": "AB", "A-C": "AC", "B-C": "CB", "B-D": "DB", "C-E": "CE", "D-E": "ED", "D-F": "DF", "E-F": "FE" };
// 重みの段。いちばん小さい合計は A-B-C-E-D-F の 9
const W = { "A-B": 2, "A-C": 4, "B-C": 1, "B-D": 7, "C-E": 3, "D-E": 1, "D-F": 2, "E-F": 6 };
const BEST = 9;

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

// ---- 段 ----
// concept は進み具合の表示に使う番号(閉路と木・連結は同じ4番)

const STEPS = [
  { id: "vertex", concept: 1, label: "頂点・辺" },
  { id: "adjacent", concept: 2, label: "隣接" },
  { id: "path", concept: 3, label: "経路" },
  { id: "cycle", concept: 4, label: "閉路" },
  { id: "tree", concept: 4, label: "木・連結" },
  { id: "direction", concept: 5, label: "向き" },
  { id: "weight", concept: 6, label: "重み" },
  { id: "yomikae", concept: 7, label: "読みかえ" },
];

function prompt() {
  const s = state;
  switch (STEPS[s.step].id) {
    case "vertex":
      return s.sub === 0 ? "点をどれか1つタップしよう" : "次は、線を1本タップしよう";
    case "adjacent":
      return "B と線で直接つながっている点を、全部タップしよう";
    case "path":
      return "A から F まで、線をたどって点を順にタップしよう";
    case "cycle":
      return "どこかの点から出発して、ぐるっと回って元の点に戻ろう";
    case "tree":
      return "線をタップして消し、輪をなくそう。ただし、点どうしは全部つながったままで";
    case "direction":
      return "矢印の向きにだけ進んで、A から F まで行こう";
    case "weight":
      return "数字の合計がいちばん小さくなるように、A から F まで行こう";
    case "yomikae":
      return "同じ形を、4つの見方で見てみよう。ボタンを全部押してみよう";
  }
}

// ---- 状態 ----

/** startIntro のたびに作り直す */
let state;

function freshState() {
  return {
    step: 0,
    sub: 0,
    ready: false,
    path: [],
    found: new Set(),
    removed: new Set(),
    sum: 0,
    theme: null,
    seen: new Set(),
    bubble: null, // いま出ている吹き出し { at, title, text, kind }
  };
}

function resetStep() {
  Object.assign(state, { sub: 0, ready: false, path: [], found: new Set(), removed: new Set(), sum: 0, bubble: null });
  const id = STEPS[state.step].id;
  if (id === "path" || id === "direction" || id === "weight") state.path = ["A"];
}

const at = (anchor) => (anchor === "center" ? CENTER : (P[anchor] ?? mid(anchor)));

function term(anchor, title, text) {
  state.bubble = { at: at(anchor), title, text, kind: "term" };
}
function hint(anchor, text) {
  state.bubble = { at: at(anchor), title: null, text, kind: "hint" };
}

// ---- 操作 ----

function onVertex(v) {
  const s = state;
  if (s.ready && STEPS[s.step].id !== "weight") return;
  const last = s.path.at(-1);
  switch (STEPS[s.step].id) {
    case "vertex":
      if (s.sub === 0) {
        term(v, "頂点", "ものを表す点。交差点、駅、人、コンピュータ…なんでもよい");
        s.sub = 1;
      } else hint(v, "今度は線のほうをタップしよう");
      break;
    case "adjacent":
      if (v === "B") return;
      if (!adj("B", v)) return hint(v, "B とは線で直接つながっていない");
      s.found.add(v);
      if (s.found.size === neighbors("B").length) {
        term("B", "隣接", "辺で直接結ばれた頂点どうし。B の隣は A・C・D の3つ");
        s.ready = true;
      } else s.bubble = null;
      break;
    case "path":
      if (s.path.length > 1 && v === s.path.at(-2)) return void s.path.pop();
      if (s.path.includes(v)) return hint(v, "同じ点は2回通らない");
      if (!adj(last, v)) return hint(v, `${last} と線でつながった点を選ぼう`);
      s.path.push(v);
      s.bubble = null;
      if (v === "F") {
        term("F", "経路", "辺をたどって進む道すじ。A から F への経路はほかにもある");
        s.ready = true;
      }
      break;
    case "cycle":
      if (s.path.length === 0) return void s.path.push(v);
      if (v === s.path[0] && s.path.length >= 3 && adj(last, v)) {
        s.path.push(v);
        term("center", "閉路", "ぐるりと一周して元の点に戻る経路。輪ともいう");
        s.ready = true;
        return;
      }
      if (s.path.length > 1 && v === s.path.at(-2)) return void s.path.pop();
      if (s.path.includes(v)) return hint(v, "同じ点は1回だけ。出発した点に戻ろう");
      if (!adj(last, v)) return hint(v, `${last} と線でつながった点を選ぼう`);
      s.path.push(v);
      s.bubble = null;
      break;
    case "direction": {
      if (s.path.length > 1 && v === s.path.at(-2)) {
        s.path.pop();
        s.bubble = null;
        return;
      }
      if (!adj(last, v)) return hint(v, `${last} と線でつながった点を選ぼう`);
      if (DIR[key(last, v)] !== last + v) return hint(key(last, v), "この線は逆向き。一方通行");
      s.path.push(v);
      s.bubble = null;
      if (v === "F") {
        term("F", "向き", "一方通行のつながりを「向きのある辺」といい、それでできたグラフを「有向グラフ」という");
        s.ready = true;
      } else if (!NAMES.some((u) => DIR[key(v, u)] === v + u))
        hint(v, `${v} からはどこへも出られない。1つ前の点をタップして戻ろう`);
      break;
    }
    case "weight":
      if (s.ready) return;
      if (s.path.length > 1 && v === s.path.at(-2)) {
        s.sum -= W[key(last, v)];
        s.path.pop();
        return;
      }
      if (s.path.includes(v)) return hint(v, "同じ点は2回通らない");
      if (!adj(last, v)) return hint(v, `${last} と線でつながった点を選ぼう`);
      s.path.push(v);
      s.sum += W[key(last, v)];
      s.bubble = null;
      if (v === "F") {
        if (s.sum === BEST) {
          term("F", "重み", "辺についた数字。時間・費用・量など、何を表すかは問題で決まる");
          s.ready = true;
        } else {
          hint("F", `合計 ${s.sum}。もっと小さくできる。A からやり直そう`);
          s.path = ["A"];
          s.sum = 0;
        }
      }
      break;
  }
}

function onEdge(k) {
  const s = state;
  if (s.ready) return;
  switch (STEPS[s.step].id) {
    case "vertex":
      if (s.sub === 0) return hint(k, "まずは点のほうをタップしよう");
      term(k, "辺", "2つの頂点のつながり。頂点と辺でつながりを表したものを「グラフ」という");
      s.ready = true;
      break;
    case "tree":
      if (s.removed.has(k)) return void s.removed.delete(k);
      if (!connected(new Set([...s.removed, k]))) return hint(k, "これを消すと、ほかとつながらない点ができる");
      s.removed.add(k);
      s.bubble = null;
      if (EDGES.length - s.removed.size === NAMES.length - 1) {
        term("center", "木・連結", "全部の点がつながっていることを「連結」という。連結で、輪がひとつもない形が「木」");
        s.ready = true;
      }
      break;
  }
}

function onTheme(id) {
  const s = state;
  s.theme = THEMES.find((t) => t.id === id);
  s.seen.add(id);
  const t = s.theme;
  const words = `頂点 = ${t.point}、辺 = ${t.line}` + (t.num ? `、重み = ${t.num}` : "");
  term("center", `${t.name}として見ると`, words);
  if (s.seen.size === THEMES.length) s.ready = true;
}

// ---- 描画 ----

/** 今の段で、辺の向き・数字・強調・色をどう描くか */
function look() {
  const s = state;
  const id = STEPS[s.step].id;
  const t = id === "yomikae" ? s.theme : null;
  const pathEdges = new Set(s.path.slice(1).map((v, i) => key(s.path[i], v)));
  return {
    dir: t ? (t.dir ?? null) : id === "direction" ? DIR : null,
    w: t ? (t.w ?? null) : id === "weight" ? W : null,
    hl: new Set(t?.hl ?? []),
    colors: t?.colors ?? null,
    pathEdges,
    pathVerts: new Set(s.path),
    marked: id === "adjacent" ? s.found : new Set(),
    focus: id === "adjacent" ? "B" : id === "path" || id === "direction" || id === "weight" ? s.path.at(-1) : null,
    removed: s.removed,
  };
}

const CH_COLORS = { 1: "#f7c948", 2: "#74c0fc", 3: "#f783ac" };

/** 閉じタグは呼ぶ側で、吹き出しを足してから書く */
function svgGraph() {
  const L = look();
  let out = `<svg class="graph" viewBox="0 0 ${VIEW_W} ${VIEW_H}">`;
  out += `<defs><marker id="intro-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5b6372"/></marker></defs>`;

  for (const k of EDGES) {
    const [u, v] = L.dir?.[k] ? L.dir[k].split("") : ends(k);
    let [x1, y1] = P[u];
    let [x2, y2] = P[v];
    const removed = L.removed.has(k);
    const on = L.pathEdges.has(k) || L.hl.has(k);
    if (L.dir) {
      // 矢印が頂点に隠れないよう、終わりを少し手前にする
      const len = Math.hypot(x2 - x1, y2 - y1);
      x2 -= ((x2 - x1) / len) * 44;
      y2 -= ((y2 - y1) / len) * 44;
    }
    const cls = ["edge", removed && "removed", on && "on"].filter(Boolean).join(" ");
    const marker = L.dir ? ` marker-end="url(#intro-arrow)"` : "";
    out += `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${marker}/>`;
    out += `<line class="hit" data-e="${k}" x1="${P[u][0]}" y1="${P[u][1]}" x2="${P[v][0]}" y2="${P[v][1]}"/>`;
    if (L.w && !removed) {
      const [mx, my] = mid(k);
      out += `<g class="weight"><circle cx="${mx}" cy="${my}" r="30"/><text x="${mx}" y="${my}">${L.w[k]}</text></g>`;
    }
  }

  for (const n of NAMES) {
    const [x, y] = P[n];
    const cls = ["node", L.pathVerts.has(n) && "on", L.marked.has(n) && "marked", L.focus === n && "focus"]
      .filter(Boolean)
      .join(" ");
    const fill = L.colors ? ` style="fill:${CH_COLORS[L.colors[n]]}"` : "";
    out += `<circle class="${cls}"${fill} cx="${x}" cy="${y}" r="34"/>`;
    const label = L.colors ? `${n}:${L.colors[n]}` : n;
    out += `<text class="node-label" x="${x}" y="${y}">${label}</text>`;
    out += `<circle class="hit" data-v="${n}" cx="${x}" cy="${y}" r="64"/>`;
  }
  return out;
}

/** 吹き出し。図の座標に置き、点が下のほうなら上に、上のほうなら下に出す */
function bubbleSvg(b) {
  const W_ = 460;
  const H_ = 300;
  const x = Math.min(Math.max(b.at[0] - W_ / 2, 10), VIEW_W - W_ - 10);
  const below = b.at[1] < 450;
  const y = below ? b.at[1] + 50 : b.at[1] - 50 - H_;
  return `<foreignObject x="${x}" y="${y}" width="${W_}" height="${H_}" class="bubble-fo ${below ? "below" : "above"}">
    <div class="bubble-box"><div class="bubble ${b.kind}">${b.title ? `<strong>${b.title}</strong>` : ""}<span>${b.text}</span></div></div>
  </foreignObject>`;
}

function progressText() {
  const st = STEPS[state.step];
  return `${st.concept} / 7 ${st.label}`;
}

function nextButton() {
  if (!state.ready) return "";
  const last = state.step === STEPS.length - 1;
  return `<button type="button" class="primary" data-act="next">${last ? "ゲームを選ぶ" : "次へ"}</button>`;
}

function themeButtons() {
  if (STEPS[state.step].id !== "yomikae") return "";
  return `<div class="themes">${THEMES.map(
    (t) =>
      `<button type="button" data-theme="${t.id}" class="${state.theme?.id === t.id ? "selected" : ""} ${state.seen.has(t.id) ? "seen" : ""}">${t.name}</button>`,
  ).join("")}</div>`;
}

function themeCard() {
  const t = state.theme;
  if (!t || STEPS[state.step].id !== "yomikae") return "";
  return `<div class="theme-card"><p class="q">${t.question}</p><p class="a">${t.answer}</p><p class="g">このゲーム:${t.game}</p></div>`;
}

function weightSum() {
  if (STEPS[state.step].id !== "weight") return "";
  return `<div class="sum">合計 ${state.sum}</div>`;
}

function render(root) {
  const b = state.bubble;
  root.innerHTML = `<div class="intro-layout">
    <header class="intro-caption"><span class="progress">${progressText()}</span><p>${prompt()}</p></header>
    <main class="stage">
      <div class="graph-wrap">${svgGraph()}${b ? bubbleSvg(b) : ""}</svg></div>
      ${weightSum()}${themeCard()}
    </main>
    <footer class="controls">${themeButtons()}${nextButton()}</footer>
  </div>`;
}

// ---- つなぎこみ ----

/** 終えたときに呼ぶ。startIntro のたびに差し替える */
let finish = () => {};
/** クリックを受ける要素。同じ要素に二重に登録しないよう覚えておく */
let wired = null;

/**
 * 入門を最初の段から始める。最後の段で「ゲームを選ぶ」を押すと onDone を呼ぶ
 * @param {HTMLElement} root
 * @param {() => void} onDone
 */
export function startIntro(root, onDone) {
  state = freshState();
  finish = onDone;
  resetStep();
  render(root);
  if (wired === root) return;
  wired = root;
  root.addEventListener("click", (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest("[data-v],[data-e],[data-act],[data-theme]");
    if (!el) return;
    if (el.dataset.act === "next") {
      if (state.step === STEPS.length - 1) return finish();
      state.step++;
      resetStep();
    } else if (el.dataset.theme) onTheme(el.dataset.theme);
    else if (el.dataset.v) onVertex(el.dataset.v);
    else if (el.dataset.e) onEdge(el.dataset.e);
    render(root);
  });
}

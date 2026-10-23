// 入門の描画とつなぎこみ。アプリを開くと最初に出し、グラフの基本の用語と概念を触って確かめる(GLOSSARY.md の入門)。
// 上の字幕で問いを出し、吹き出しは触った点や線の上に1つだけ出す。段の中身は steps.js に置く

import { EDGES, NAMES, STEPS, begin, sequence, tap } from "./steps.js";

const VIEW_W = 1600;
const VIEW_H = 900;
const P = { A: [220, 450], B: [560, 200], C: [560, 700], D: [1040, 200], E: [1040, 700], F: [1380, 450] };
const CENTER = [800, 450];

const ends = (k) => k.split("-");
const mid = (k) => {
  const [u, v] = ends(k);
  return [(P[u][0] + P[v][0]) / 2, (P[u][1] + P[v][1]) / 2];
};
/** 吹き出しの anchor(点の名前、線、"center")を図の座標にする */
const at = (anchor) => (anchor === "center" ? CENTER : (P[anchor] ?? mid(anchor)));

/** 段を部分ごとに並べたもの。i は今の部分 */
const PARTS = sequence(STEPS);

/** startIntro のたびに作り直す */
let i = 0;
let st;

const part = () => PARTS[i].step;

// ---- 描画 ----

/** 段の描き方に、描かないものの既定を足す */
function look() {
  return {
    dir: null,
    w: null,
    hl: new Set(),
    colors: null,
    pathEdges: new Set(),
    pathVerts: new Set(),
    marked: new Set(),
    focus: null,
    removed: new Set(),
    sum: null,
    themes: null,
    ...part().look(st),
  };
}

const CH_COLORS = { 1: "#f7c948", 2: "#74c0fc", 3: "#f783ac" };

/** 閉じタグは呼ぶ側で、吹き出しを足してから書く */
function svgGraph(L) {
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
  const [ax, ay] = at(b.anchor);
  const x = Math.min(Math.max(ax - W_ / 2, 10), VIEW_W - W_ - 10);
  const below = ay < 450;
  const y = below ? ay + 50 : ay - 50 - H_;
  return `<foreignObject x="${x}" y="${y}" width="${W_}" height="${H_}" class="bubble-fo ${below ? "below" : "above"}">
    <div class="bubble-box"><div class="bubble ${b.kind}">${b.title ? `<strong>${b.title}</strong>` : ""}<span>${b.text}</span></div></div>
  </foreignObject>`;
}

function nextButton() {
  if (!st.ready) return "";
  const last = i === PARTS.length - 1;
  return `<button type="button" class="primary" data-act="next">${last ? "ゲームを選ぶ" : "次へ"}</button>`;
}

/** 読みかえのボタン */
function themeButtons(T) {
  if (!T) return "";
  return `<div class="themes">${T.all
    .map(
      (t) =>
        `<button type="button" data-theme="${t.id}" class="${T.selected?.id === t.id ? "selected" : ""} ${T.seen.has(t.id) ? "seen" : ""}">${t.name}</button>`,
    )
    .join("")}</div>`;
}

/** 読みかえで選んだ題材の問いと答え */
function themeCard(T) {
  const t = T?.selected;
  if (!t) return "";
  return `<div class="theme-card"><p class="q">${t.question}</p><p class="a">${t.answer}</p><p class="g">このゲーム:${t.game}</p></div>`;
}

function render(root) {
  const { step, n, total } = PARTS[i];
  const L = look();
  root.innerHTML = `<div class="intro-layout">
    <header class="intro-caption"><span class="progress">${n} / ${total} ${step.label}</span><p>${step.prompt(st)}</p></header>
    <main class="stage">
      <div class="graph-wrap">${svgGraph(L)}${st.bubble ? bubbleSvg(st.bubble) : ""}</svg></div>
      ${L.sum === null ? "" : `<div class="sum">合計 ${L.sum}</div>`}${themeCard(L.themes)}
    </main>
    <footer class="controls">${themeButtons(L.themes)}${nextButton()}</footer>
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
  i = 0;
  st = begin(part());
  finish = onDone;
  render(root);
  if (wired === root) return;
  wired = root;
  root.addEventListener("click", (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest("[data-v],[data-e],[data-act],[data-theme]");
    if (!el) return;
    if (el.dataset.act === "next") {
      if (i === PARTS.length - 1) return finish();
      i++;
      st = begin(part());
    } else if (el.dataset.theme) tap(part(), st, "theme", el.dataset.theme);
    else if (el.dataset.v) tap(part(), st, "vertex", el.dataset.v);
    else if (el.dataset.e) tap(part(), st, "edge", el.dataset.e);
    render(root);
  });
}

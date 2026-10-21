// 起動と、入力 → 割り当て → 描画の接続、層Bの自動進行

import { AUTO_STEP_MS, MAX_CHANNELS, RUN_PAUSE_MS } from "./config.js";
import {
  canComplete,
  captionFor,
  channelCount,
  conflicts,
  greedySteps,
  minColoring,
  starsFor,
  tap,
  usedChannels,
  welshPowellOrder,
} from "./logic.js";
import { STAGE } from "./stages.js";
import { TERMS } from "./terms.js";
import { buildMap, render } from "./view.js";

/** @typedef {"A" | "B"} Mode A は自分で割り当てる、B は貪欲法が2回塗る様子を見る */
/** @typedef {import("./logic.js").Assign} Assign */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const asSvg = (/** @type {string} */ id) => /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($(id)));
const svg = asSvg("board");
const ui = {
  modeA: $("mode-a"),
  modeB: $("mode-b"),
  done: /** @type {HTMLButtonElement} */ ($("done")),
  reset: /** @type {HTMLButtonElement} */ ($("reset")),
  run: /** @type {HTMLButtonElement} */ ($("run")),
  showTerms: $("show-terms"),
  compare: $("compare"),
  terms: $("terms"),
  termsList: $("terms-list"),
  termsClose: $("terms-close"),
  msg: $("msg"),
  sub: $("sub"),
};

const stage = STAGE;
const best = minColoring(stage);
const starText = (/** @type {number} */ n) => "★".repeat(n) + "☆".repeat(3 - n);
const degree = (/** @type {string} */ n) => stage.edges.filter((p) => p.u === n || p.v === n).length;

/** 層Bの2回。1回目は自然に見える順番、2回目は隣どうしの多い順(docs/games.md 5.4) */
const RUNS = [
  {
    label: "1回目: 左から順に塗る",
    order: stage.naturalOrder,
    orderText: (/** @type {string} */ n) => n,
  },
  {
    label: "2回目: 隣どうしの多い基地局から塗る",
    order: welshPowellOrder(stage),
    orderText: (/** @type {string} */ n) => `${n}(${degree(n)})`,
  },
].map((r) => ({ ...r, steps: greedySteps(stage, r.order) }));

const state = {
  /** @type {Mode} */
  mode: "A",
  /** @type {Assign} */
  assign: {},
  done: false,
  /** 層Bで塗っている回(0 か 1)。-1 はスタート前、2 は2回とも塗り終えた後 */
  run: -1,
  /** 層Bで、その回に塗り終えた基地局の数 */
  shown: 0,
  autoTimer: 0,
};

/** @param {import("./logic.js").GreedyStep[]} steps */
const toAssign = (steps) => Object.fromEntries(steps.map((s) => [s.node, s.channel]));

function updateA() {
  const { assign, done } = state;
  const bad = conflicts(stage, assign);
  const count = usedChannels(assign);
  render(svg, { assign, conflicts: bad, ghost: done ? best.assign : null, current: null });
  ui.done.disabled = done || !canComplete(stage, assign);
  ui.reset.disabled = Object.keys(assign).length === 0;

  const left = Object.keys(stage.nodes).filter((n) => assign[n] === undefined).length;
  if (done) {
    ui.msg.textContent = `完成! 使ったチャンネル ${count}つ ${starText(starsFor(count, stage))}`;
    ui.sub.textContent = `外側の点線の輪と小さい番号は、いちばん少ない割り当て(${best.count}つ)。「自動で割り当てる」も見てみよう`;
  } else if (count === 0) {
    ui.msg.textContent = "基地局をタップしてチャンネルを割り当てよう。線で結んだ隣どうしは、同じチャンネルだと混信する";
    ui.sub.textContent = `タップするたびにチャンネルが 1 → 2 → … → ${MAX_CHANNELS} → 1 と変わる。使うチャンネルの数はできるだけ少なく`;
  } else {
    ui.msg.textContent = `使っているチャンネル: ${count}つ`;
    if (bad.size > 0) ui.sub.textContent = `赤い破線の隣どうしが混信しています(${bad.size}か所)`;
    else if (left > 0) ui.sub.textContent = `まだチャンネルのない基地局があります(あと${left}つ)`;
    else ui.sub.textContent = "混信がなくなりました。よければ「完成」を押そう";
  }
}

function updateB() {
  const finished = state.run === RUNS.length;
  ui.compare.hidden = !finished;
  svg.style.display = finished ? "none" : "";
  ui.run.disabled = state.run >= 0 && !finished;
  ui.run.textContent = finished ? "もう一度" : "スタート";
  ui.showTerms.hidden = !finished;

  if (state.run < 0) {
    render(svg, { assign: {}, conflicts: new Set(), ghost: null, current: null });
    ui.msg.textContent = "決まった順番で基地局を1つずつ見て、隣が使っていない中でいちばん小さい番号を付けていきます";
    ui.sub.textContent = "順番を変えて2回やってみます。「スタート」を押そう";
    return;
  }
  if (finished) {
    showCompare();
    return;
  }
  const r = RUNS[state.run];
  const seen = r.steps.slice(0, state.shown);
  const current = state.shown > 0 && state.shown <= r.steps.length ? r.steps[state.shown - 1].node : null;
  render(svg, { assign: toAssign(seen), conflicts: new Set(), ghost: null, current });
  const order = r.order.map((n) => (n === current ? `[${r.orderText(n)}]` : r.orderText(n))).join(" → ");
  if (state.shown === 0) ui.msg.textContent = r.label;
  else ui.msg.textContent = `${r.label} … ${captionFor(r.steps, state.shown - 1)}`;
  if (state.shown === r.steps.length) ui.msg.textContent += `。使ったチャンネルは ${channelCount(r.steps)}つ`;
  ui.sub.textContent = `塗る順番: ${order}`;
}

function showCompare() {
  const [one, two] = RUNS.map((r) => channelCount(r.steps));
  const cmp = [
    { id: "cmp-1", assign: toAssign(RUNS[0].steps), cap: `1回目(左から順) <strong>${one}</strong>つ` },
    { id: "cmp-2", assign: toAssign(RUNS[1].steps), cap: `2回目(隣どうしの多い順) <strong>${two}</strong>つ` },
    state.done
      ? { id: "cmp-mine", assign: state.assign, cap: `あなた <strong>${usedChannels(state.assign)}</strong>つ` }
      : { id: "cmp-mine", assign: {}, cap: "あなた(まだ完成していません)" },
  ];
  for (const c of cmp) {
    render(asSvg(c.id), { assign: c.assign, conflicts: new Set(), ghost: null, current: null });
    $(`${c.id}-cap`).innerHTML = c.cap;
  }
  ui.msg.textContent = `同じやり方でも、塗る順番を変えただけで ${one}つ → ${two}つ になった`;
  ui.sub.textContent = `いちばん少ないのは ${best.count}つ。どんな順番がいいかを確かめるには、ほぼ全部の組み合わせを試すしかない`;
}

function update() {
  const a = state.mode === "A";
  ui.modeA.classList.toggle("active", a);
  ui.modeB.classList.toggle("active", !a);
  for (const b of [ui.reset, ui.done]) b.hidden = !a;
  ui.run.hidden = a;
  if (a) {
    ui.showTerms.hidden = true;
    ui.compare.hidden = true;
    svg.style.display = "";
    updateA();
  } else updateB();
}

function stopAuto() {
  clearTimeout(state.autoTimer);
  state.autoTimer = 0;
}

/** 層Bを1手進める。回の終わりでは少し待ってから次の回へ、2回とも終えたら結果を並べる */
function tick() {
  const r = RUNS[state.run];
  if (state.shown < r.steps.length) {
    state.shown += 1;
    state.autoTimer = window.setTimeout(tick, state.shown === r.steps.length ? RUN_PAUSE_MS : AUTO_STEP_MS);
  } else {
    state.run += 1;
    state.shown = 0;
    if (state.run === RUNS.length) {
      state.autoTimer = 0;
      ui.terms.hidden = false;
    } else state.autoTimer = window.setTimeout(tick, AUTO_STEP_MS);
  }
  update();
}

/** @param {Mode} mode */
function setMode(mode) {
  stopAuto();
  ui.terms.hidden = true;
  state.mode = mode;
  state.run = -1;
  state.shown = 0;
  update();
}

// 選ぶ画面(配達員ダイクストラの index.html)に戻る
$("to-select").addEventListener("click", () => location.assign("../"));

svg.addEventListener("click", (ev) => {
  if (state.mode !== "A" || state.done) return;
  const n = /** @type {Element} */ (ev.target).closest("[data-node]")?.getAttribute("data-node");
  if (!n) return;
  state.assign = tap(state.assign, n, MAX_CHANNELS);
  update();
});

ui.done.addEventListener("click", () => {
  if (!canComplete(stage, state.assign)) return;
  state.done = true;
  update();
});

ui.reset.addEventListener("click", () => {
  state.assign = {};
  state.done = false;
  update();
});

ui.modeA.addEventListener("click", () => setMode("A"));
ui.modeB.addEventListener("click", () => setMode("B"));

ui.run.addEventListener("click", () => {
  stopAuto();
  ui.terms.hidden = true;
  state.run = 0;
  state.shown = 0;
  state.autoTimer = window.setTimeout(tick, AUTO_STEP_MS);
  update();
});

ui.showTerms.addEventListener("click", () => {
  ui.terms.hidden = false;
});
ui.termsClose.addEventListener("click", () => {
  ui.terms.hidden = true;
});

for (const [word, term] of TERMS) {
  const dt = document.createElement("dt");
  dt.textContent = word;
  const dd = document.createElement("dd");
  dd.textContent = term;
  ui.termsList.append(dt, dd);
}

for (const s of [svg, asSvg("cmp-1"), asSvg("cmp-2"), asSvg("cmp-mine")]) buildMap(s, stage);
update();

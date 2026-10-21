// 起動と、入力 → 手番 → 描画の接続、層Bの自動進行

import { AUTO_STEP_MS } from "./config.js";
import {
  captionFor,
  complete,
  createRound,
  cyclePath,
  cycleRoads,
  isConnected,
  kruskalSteps,
  laidRoads,
  minimumRoads,
  roadKey,
  starsFor,
  toggle,
  totalCost,
  undo,
} from "./logic.js";
import { STAGE } from "./stages.js";
import { TERMS } from "./terms.js";
import { buildMap, render } from "./view.js";

/** @typedef {"A" | "B"} Mode A は自分で敷く、B はクラスカル法が敷く様子を見る */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("board")));
const ui = {
  modeA: $("mode-a"),
  modeB: $("mode-b"),
  done: /** @type {HTMLButtonElement} */ ($("done")),
  undo: /** @type {HTMLButtonElement} */ ($("undo")),
  reset: /** @type {HTMLButtonElement} */ ($("reset")),
  run: /** @type {HTMLButtonElement} */ ($("run")),
  showTerms: $("show-terms"),
  terms: $("terms"),
  termsList: $("terms-list"),
  termsClose: $("terms-close"),
  msg: $("msg"),
  sub: $("sub"),
};

const stage = STAGE;
const nodeNames = Object.keys(stage.nodes);
const best = minimumRoads(stage);
const opt = totalCost(best);
const starText = (/** @type {number} */ n) => "★".repeat(n) + "☆".repeat(3 - n);

// 全部の局舎がつながった(最後の道を敷いた)ところで止める。残りの道は見なくてよい
const allSteps = kruskalSteps(stage);
const steps = allSteps.slice(0, allSteps.findLastIndex((s) => s.action === "lay") + 1);

const state = {
  /** @type {Mode} */
  mode: "A",
  round: createRound(),
  /** 層Bでいま見せている手の番号。-1 はスタート前、steps.length は全部つながった後 */
  shown: -1,
  autoTimer: 0,
};

function updateA() {
  const { round } = state;
  const roads = laidRoads(stage, round);
  const total = totalCost(roads);
  const connected = isConnected(nodeNames, roads);
  const cycle = cycleRoads(roads);
  render(svg, {
    laid: new Set(round.laid),
    cycle,
    ghost: round.done ? new Set(best.map(roadKey)) : null,
    auto: false,
    current: null,
    skipped: new Set(),
  });
  ui.done.disabled = round.done || !connected;
  ui.undo.disabled = round.history.length === 0;
  ui.reset.disabled = round.history.length === 0;

  if (round.done) {
    ui.msg.textContent = `完成! 工事費 ${total}万円 ${starText(starsFor(total, stage))}`;
    ui.sub.textContent = `点線は、いちばん安い敷き方(${opt}万円)。「自動で敷く」で、安い順に敷くやり方を見てみよう`;
  } else if (round.laid.length === 0) {
    ui.msg.textContent = "道をタップして光ファイバーを敷こう。全部の局舎が通信できれば完成";
    ui.sub.textContent = "道の数字は工事費(万円)。もう一度タップすると外せる。工事費の合計はできるだけ安く";
  } else {
    ui.msg.textContent = `工事費の合計: ${total}万円`;
    // 輪は禁止せず、無駄があることだけを知らせる(docs/games.md 4.3)
    if (cycle.size > 0) ui.sub.textContent = "輪ができています。赤い道は、1本外しても全部つながっています";
    else if (connected) ui.sub.textContent = "全部の局舎がつながりました。よければ「完成」を押そう";
    else ui.sub.textContent = "まだ通信できない局舎があります";
  }
}

function updateB() {
  const seen = steps.slice(0, state.shown + 1);
  const laid = seen.filter((s) => s.action === "lay").map((s) => s.road);
  const finished = state.shown === steps.length;
  const step = state.shown >= 0 && !finished ? steps[state.shown] : null;
  // 飛ばす手では、その道が閉じる輪(敷いた道の道筋と、飛ばす道)を赤で見せる
  const cycle = new Set(
    step?.action === "skip"
      ? [roadKey(step.road), ...cyclePath(laid, step.road.u, step.road.v)]
      : [],
  );
  render(svg, {
    laid: new Set([...laid.map(roadKey), ...(step?.action === "skip" ? [roadKey(step.road)] : [])]),
    cycle,
    ghost: null,
    auto: true,
    current: step ? roadKey(step.road) : null,
    skipped: new Set(seen.filter((s) => s.action === "skip").map((s) => roadKey(s.road))),
  });

  ui.run.disabled = state.shown >= 0 && !finished;
  ui.run.textContent = finished ? "もう一度" : "スタート";
  ui.showTerms.hidden = !finished;
  if (state.shown < 0) {
    ui.msg.textContent = "工事費の安い道から順に、1本ずつ敷くかどうかを決めていきます";
    ui.sub.textContent = "「スタート」を押そう";
  } else if (finished) {
    ui.msg.textContent = `全部の局舎がつながりました。工事費の合計 ${totalCost(laid)}万円`;
    const mine = state.round.done ? `あなたの敷き方は ${totalCost(laidRoads(stage, state.round))}万円。` : "";
    ui.sub.textContent = `${mine}安い順に、輪にならない道だけを敷くと、いちばん安くなる`;
  } else if (step) {
    ui.msg.textContent = captionFor(step);
    ui.sub.textContent = `工事費の合計: ${totalCost(laid)}万円`;
  }
}

function update() {
  const a = state.mode === "A";
  ui.modeA.classList.toggle("active", a);
  ui.modeB.classList.toggle("active", !a);
  for (const b of [ui.undo, ui.reset, ui.done]) b.hidden = !a;
  ui.run.hidden = a;
  if (a) {
    ui.showTerms.hidden = true;
    updateA();
  } else updateB();
}

function stopAuto() {
  clearInterval(state.autoTimer);
  clearTimeout(state.autoTimer);
  state.autoTimer = 0;
}

/** @param {Mode} mode */
function setMode(mode) {
  stopAuto();
  ui.terms.hidden = true;
  state.mode = mode;
  state.shown = -1;
  update();
}

// 選ぶ画面(配達員ダイクストラの index.html)に戻る
$("to-select").addEventListener("click", () => location.assign("../"));

svg.addEventListener("click", (ev) => {
  if (state.mode !== "A") return;
  const key = /** @type {Element} */ (ev.target).closest("[data-road]")?.getAttribute("data-road");
  if (!key) return;
  state.round = toggle(state.round, key);
  update();
});

ui.done.addEventListener("click", () => {
  state.round = complete(stage, state.round);
  update();
});

ui.undo.addEventListener("click", () => {
  state.round = undo(state.round);
  update();
});

ui.reset.addEventListener("click", () => {
  state.round = createRound();
  update();
});

ui.modeA.addEventListener("click", () => setMode("A"));
ui.modeB.addEventListener("click", () => setMode("B"));

ui.run.addEventListener("click", () => {
  stopAuto();
  ui.terms.hidden = true;
  state.shown = 0;
  update();
  state.autoTimer = window.setInterval(() => {
    state.shown += 1;
    if (state.shown >= steps.length) {
      stopAuto();
      // 最後の地図を少し見せてから、対応表を重ねる
      state.autoTimer = window.setTimeout(() => {
        ui.terms.hidden = false;
      }, AUTO_STEP_MS);
    }
    update();
  }, AUTO_STEP_MS);
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

buildMap(svg, stage);
update();

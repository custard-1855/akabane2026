// 起動と、入力 → 手番 → 描画の接続、層Bの自動進行

import { AUTO_STEP_MS } from "./config.js";
import {
  captionFor,
  createRound,
  flowAfter,
  fordFulkersonSteps,
  hasForwardRoute,
  lineKey,
  maxFlow,
  minCut,
  sentTotal,
  starsFor,
  tap,
  totalSent,
  undo,
} from "./logic.js";
import { STAGE } from "./stages.js";
import { TERMS } from "./terms.js";
import { buildMap, render } from "./view.js";

/** @typedef {"A" | "B"} Mode A は自分で送る、B はフォード–ファルカーソン法が送る様子を見る */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("board")));
const ui = {
  modeA: $("mode-a"),
  modeB: $("mode-b"),
  undo: /** @type {HTMLButtonElement} */ ($("undo")),
  reset: /** @type {HTMLButtonElement} */ ($("reset")),
  run: /** @type {HTMLButtonElement} */ ($("run")),
  showTerms: $("show-terms"),
  playOther: $("play-other"),
  handOver: $("hand-over"),
  terms: $("terms"),
  termsList: $("terms-list"),
  termsClose: $("terms-close"),
  msg: $("msg"),
  sub: $("sub"),
};

const stage = STAGE;
const max = maxFlow(stage);
const steps = fordFulkersonSteps(stage);
const best = flowAfter(steps);
const cut = minCut(stage);
const starText = (/** @type {number} */ n) => "★".repeat(n) + "☆".repeat(3 - n);
const routeText = (/** @type {string[]} */ r) => r.join("→");

/**
 * 層Bの場面。各手を「ルートを光らせる」と「送る量を変える」の2つに分け、最後にいちばん細い切れ目を見せる
 * @type {({ kind: "route" | "sent", i: number } | { kind: "cut" })[]}
 */
const FRAMES = [
  ...steps.flatMap((_, i) => [
    { kind: /** @type {const} */ ("route"), i },
    { kind: /** @type {const} */ ("sent"), i },
  ]),
  { kind: "cut" },
];

const state = {
  /** @type {Mode} */
  mode: "A",
  round: createRound(stage),
  /** 直前のタップの結果を伝える一言。次のタップで消す */
  note: "",
  /** 層Bで見せている場面の番号。-1 はスタート前 */
  frame: -1,
  autoTimer: 0,
};

const noB = { hops: null, amount: 0, cut: null, side: null };

function updateA() {
  const { round } = state;
  render(svg, stage, {
    flow: round.flow,
    route: round.done ? [] : round.route,
    ghost: round.done ? best : null,
    ...noB,
  });
  const total = sentTotal(round);
  const untouched = round.sent.length === 0 && round.route.length === 1;
  ui.undo.disabled = untouched;
  ui.reset.disabled = untouched;
  if (round.done) {
    ui.msg.textContent = `完成! 送れた量 ${total} ${starText(starsFor(total, stage))}`;
    ui.sub.textContent = `データセンターから利用者へのルートは、もうありません。破線の枠は、最大(${max})まで送ったときの送る量`;
  } else if (untouched) {
    ui.msg.textContent = "データセンター(S)から利用者(T)へ、矢印の向きに地点を順にタップしてルートを作ろう";
    ui.sub.textContent =
      state.note || "T に着くと、そのルートで送れるだけ送る。回線の数字は「送る量/帯域」。全体でできるだけ多く送ろう";
  } else {
    ui.msg.textContent = `送った量の合計: ${total}`;
    ui.sub.textContent = state.note || `ルート: ${routeText(round.route)}`;
  }
}

function updateB() {
  const finished = state.frame === FRAMES.length - 1;
  ui.run.disabled = state.frame >= 0 && !finished;
  ui.run.textContent = finished ? "もう一度" : "スタート";
  ui.showTerms.hidden = !finished;
  ui.playOther.hidden = !finished;
  ui.handOver.hidden = !finished;

  const f = FRAMES[state.frame];
  if (!f) {
    render(svg, stage, { flow: {}, route: [], ghost: null, ...noB });
    ui.msg.textContent = "送れるルートを1本ずつ見つけて送っていきます。行き詰まったら、送り方を付け替えます";
    ui.sub.textContent = "「スタート」を押そう";
    return;
  }
  if (f.kind === "cut") {
    render(svg, stage, { flow: best, route: [], ghost: null, ...noB, cut: new Set(cut.lines.map(lineKey)), side: cut.side });
    const parts = cut.lines.map((e) => `${e.u}→${e.v}(${e.cap})`).join(" + ");
    ui.msg.textContent = `いちばん細い切れ目: ${parts} = ${cut.total}`;
    ui.sub.textContent = `送れた量 ${totalSent(stage, best)} と等しい。どう送っても、この切れ目より多くは通らない(青い地点がデータセンター側)`;
    return;
  }
  const step = steps[f.i];
  const flow = flowAfter(steps.slice(0, f.kind === "sent" ? f.i + 1 : f.i));
  render(svg, stage, { flow, route: [], ghost: null, ...noB, hops: step.hops, amount: step.amount });
  ui.msg.textContent = captionFor(step);
  const total = totalSent(stage, flow);
  // 順方向のルートがなくなったのに、まだ次の手がある: 層Aで行き詰まったのと同じ場面
  const stuck = f.kind === "sent" && f.i + 1 < steps.length && !hasForwardRoute(stage, flow);
  ui.sub.textContent = stuck
    ? `送った量の合計: ${total}。矢印の向きに送れるルートはもうない。でも、送り方を付け替えれば、まだ増やせる`
    : `送った量の合計: ${total}`;
}

function update() {
  const a = state.mode === "A";
  ui.modeA.classList.toggle("active", a);
  ui.modeB.classList.toggle("active", !a);
  for (const b of [ui.undo, ui.reset]) b.hidden = !a;
  ui.run.hidden = a;
  if (a) {
    ui.showTerms.hidden = true;
    ui.playOther.hidden = true;
    ui.handOver.hidden = true;
    updateA();
  } else updateB();
}

function stopAuto() {
  clearTimeout(state.autoTimer);
  state.autoTimer = 0;
}

/** 層Bを1場面進める。最後の場面(切れ目)を少し見せてから、対応表を重ねる */
function tick() {
  state.frame += 1;
  update();
  state.autoTimer = window.setTimeout(
    state.frame < FRAMES.length - 1
      ? tick
      : () => {
          state.autoTimer = 0;
          ui.terms.hidden = false;
        },
    AUTO_STEP_MS,
  );
}

/** @param {Mode} mode */
function setMode(mode) {
  stopAuto();
  ui.terms.hidden = true;
  state.mode = mode;
  state.frame = -1;
  update();
}

// 同じ人が続けて遊ぶときは、入門を飛ばしてゲームを選ぶ画面(配達員ダイクストラの index.html)に戻る。
// 来場者が交代するときは、アプリを開き直して入門から始める
$("to-select").addEventListener("click", () => location.assign("../#select"));
ui.playOther.addEventListener("click", () => location.assign("../#select"));
ui.handOver.addEventListener("click", () => location.assign("../"));

svg.addEventListener("click", (ev) => {
  if (state.mode !== "A") return;
  const n = /** @type {Element} */ (ev.target).closest("[data-node]")?.getAttribute("data-node");
  const { round } = state;
  if (!n || round.done) return;
  const { round: next, result } = tap(stage, round, n);
  const here = round.route.at(-1);
  if (result === "sent") {
    const last = next.sent[next.sent.length - 1];
    state.note = `${routeText(last.route)} で ${last.amount} 送った`;
  } else if (result === "blocked") state.note = `${here}→${n} は帯域いっぱいで、もう送れません`;
  else if (result === "visited") state.note = `${n} はこのルートで通りました`;
  else if (result === "not_next") state.note = `${here} から ${n} へ、矢印の向きに進める回線はありません`;
  else state.note = "";
  state.round = next;
  update();
});

ui.undo.addEventListener("click", () => {
  state.round = undo(stage, state.round);
  state.note = "";
  update();
});

ui.reset.addEventListener("click", () => {
  state.round = createRound(stage);
  state.note = "";
  update();
});

ui.modeA.addEventListener("click", () => setMode("A"));
ui.modeB.addEventListener("click", () => setMode("B"));

ui.run.addEventListener("click", () => {
  stopAuto();
  ui.terms.hidden = true;
  state.frame = -1;
  tick();
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

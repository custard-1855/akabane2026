// 起動と、入力 → 手番 → 描画の接続

import { createRound, flowAfter, fordFulkersonSteps, maxFlow, sentTotal, starsFor, tap, undo } from "./logic.js";
import { STAGE } from "./stages.js";
import { buildMap, render } from "./view.js";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("board")));
const ui = {
  undo: /** @type {HTMLButtonElement} */ ($("undo")),
  reset: /** @type {HTMLButtonElement} */ ($("reset")),
  msg: $("msg"),
  sub: $("sub"),
};

const stage = STAGE;
const max = maxFlow(stage);
const best = flowAfter(fordFulkersonSteps(stage));
const starText = (/** @type {number} */ n) => "★".repeat(n) + "☆".repeat(3 - n);
const routeText = (/** @type {string[]} */ r) => r.join("→");

let round = createRound(stage);
/** 直前のタップの結果を伝える一言。次のタップで消す */
let note = "";

function update() {
  render(svg, stage, { flow: round.flow, route: round.done ? [] : round.route, ghost: round.done ? best : null });
  const total = sentTotal(round);
  const untouched = round.sent.length === 0 && round.route.length === 1;
  ui.undo.disabled = untouched;
  ui.reset.disabled = untouched;
  if (round.done) {
    ui.msg.textContent = `完成! 送れた量 ${total} ${starText(starsFor(total, stage))}`;
    ui.sub.textContent = `データセンターから利用者へのルートは、もうありません。破線の枠は、最大(${max})まで送ったときの送る量`;
  } else if (untouched) {
    ui.msg.textContent = "データセンター(S)から利用者(T)へ、矢印の向きに地点を順にタップしてルートを作ろう";
    ui.sub.textContent = note || "T に着くと、そのルートで送れるだけ送る。回線の数字は「送る量/帯域」。全体でできるだけ多く送ろう";
  } else {
    ui.msg.textContent = `送った量の合計: ${total}`;
    ui.sub.textContent = note || `ルート: ${routeText(round.route)}`;
  }
}

svg.addEventListener("click", (ev) => {
  const n = /** @type {Element} */ (ev.target).closest("[data-node]")?.getAttribute("data-node");
  if (!n || round.done) return;
  const { round: next, result } = tap(stage, round, n);
  const here = round.route.at(-1);
  if (result === "sent") {
    const last = next.sent[next.sent.length - 1];
    note = `${routeText(last.route)} で ${last.amount} 送った`;
  } else if (result === "blocked") note = `${here}→${n} は帯域いっぱいで、もう送れません`;
  else if (result === "visited") note = `${n} はこのルートで通りました`;
  else if (result === "not_next") note = `${here} から ${n} へ、矢印の向きに進める回線はありません`;
  else note = "";
  round = next;
  update();
});

ui.undo.addEventListener("click", () => {
  round = undo(stage, round);
  note = "";
  update();
});

ui.reset.addEventListener("click", () => {
  round = createRound(stage);
  note = "";
  update();
});

buildMap(svg, stage);
update();

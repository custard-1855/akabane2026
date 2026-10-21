// 起動と、入力 → 手番 → 描画の接続

import {
  complete,
  createRound,
  cycleRoads,
  isConnected,
  laidRoads,
  minimumRoads,
  roadKey,
  starsFor,
  toggle,
  totalCost,
  undo,
} from "./logic.js";
import { STAGE } from "./stages.js";
import { buildMap, render } from "./view.js";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("board")));
const ui = {
  done: /** @type {HTMLButtonElement} */ ($("done")),
  undo: /** @type {HTMLButtonElement} */ ($("undo")),
  reset: /** @type {HTMLButtonElement} */ ($("reset")),
  msg: $("msg"),
  sub: $("sub"),
};

const stage = STAGE;
const nodeNames = Object.keys(stage.nodes);
const best = minimumRoads(stage);
const opt = totalCost(best);
const starText = (/** @type {number} */ n) => "★".repeat(n) + "☆".repeat(3 - n);

let round = createRound();

function update() {
  const roads = laidRoads(stage, round);
  const total = totalCost(roads);
  const connected = isConnected(nodeNames, roads);
  const cycle = cycleRoads(roads);
  render(svg, {
    laid: new Set(round.laid),
    cycle,
    ghost: round.done ? new Set(best.map(roadKey)) : null,
  });
  ui.done.disabled = round.done || !connected;
  ui.undo.disabled = round.history.length === 0;
  ui.reset.disabled = round.history.length === 0;

  if (round.done) {
    ui.msg.textContent = `完成! 工事費 ${total}万円 ${starText(starsFor(total, stage))}`;
    ui.sub.textContent = `点線は、いちばん安い敷き方(${opt}万円)`;
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

svg.addEventListener("click", (ev) => {
  const key = /** @type {Element} */ (ev.target).closest("[data-road]")?.getAttribute("data-road");
  if (!key) return;
  round = toggle(round, key);
  update();
});

ui.done.addEventListener("click", () => {
  round = complete(stage, round);
  update();
});

ui.undo.addEventListener("click", () => {
  round = undo(round);
  update();
});

ui.reset.addEventListener("click", () => {
  round = createRound();
  update();
});

buildMap(svg, stage);
update();

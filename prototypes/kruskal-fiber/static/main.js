// 起動と、入力 → 手番 → 描画の接続

import { complete, createRound, isConnected, laidRoads, minimumRoads, starsFor, toggle, totalCost } from "./logic.js";
import { STAGE } from "./stages.js";
import { buildMap, render } from "./view.js";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("board")));
const ui = {
  done: /** @type {HTMLButtonElement} */ ($("done")),
  msg: $("msg"),
  sub: $("sub"),
};

const stage = STAGE;
const nodeNames = Object.keys(stage.nodes);
const opt = totalCost(minimumRoads(stage));
const starText = (/** @type {number} */ n) => "★".repeat(n) + "☆".repeat(3 - n);

let round = createRound();

function update() {
  const roads = laidRoads(stage, round);
  const total = totalCost(roads);
  const connected = isConnected(nodeNames, roads);
  render(svg, { laid: new Set(round.laid) });
  ui.done.disabled = round.done || !connected;

  if (round.done) {
    ui.msg.textContent = `完成! 工事費 ${total}万円 ${starText(starsFor(total, stage))}`;
    ui.sub.textContent = `いちばん安い敷き方は ${opt}万円`;
  } else if (round.laid.length === 0) {
    ui.msg.textContent = "道をタップして光ファイバーを敷こう。全部の局舎が通信できれば完成";
    ui.sub.textContent = "道の数字は工事費(万円)。もう一度タップすると外せる。工事費の合計はできるだけ安く";
  } else {
    ui.msg.textContent = `工事費の合計: ${total}万円`;
    ui.sub.textContent = connected
      ? "全部の局舎がつながりました。よければ「完成」を押そう"
      : "まだ通信できない局舎があります";
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

buildMap(svg, stage);
update();

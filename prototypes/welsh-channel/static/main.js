// 起動と、入力 → 割り当て → 描画の接続

import { MAX_CHANNELS } from "./config.js";
import { canComplete, conflicts, minColoring, starsFor, tap, usedChannels } from "./logic.js";
import { STAGE } from "./stages.js";
import { buildMap, render } from "./view.js";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("board")));
const ui = {
  done: /** @type {HTMLButtonElement} */ ($("done")),
  reset: /** @type {HTMLButtonElement} */ ($("reset")),
  msg: $("msg"),
  sub: $("sub"),
};

const stage = STAGE;
const best = minColoring(stage);
const starText = (/** @type {number} */ n) => "★".repeat(n) + "☆".repeat(3 - n);

const state = {
  /** @type {import("./logic.js").Assign} */
  assign: {},
  done: false,
};

function update() {
  const { assign, done } = state;
  const bad = conflicts(stage, assign);
  const count = usedChannels(assign);
  render(svg, { assign, conflicts: bad, ghost: done ? best.assign : null, current: null });
  ui.done.disabled = done || !canComplete(stage, assign);
  ui.reset.disabled = Object.keys(assign).length === 0;

  const left = Object.keys(stage.nodes).filter((n) => assign[n] === undefined).length;
  if (done) {
    ui.msg.textContent = `完成! 使ったチャンネル ${count}つ ${starText(starsFor(count, stage))}`;
    ui.sub.textContent = `外側の点線の輪と小さい番号は、いちばん少ない割り当て(${best.count}つ)`;
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

svg.addEventListener("click", (ev) => {
  if (state.done) return;
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

buildMap(svg, stage);
update();

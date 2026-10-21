// SVG の描画。状態は持たず、main.js から渡された見た目の状態を描くだけにする。
// 配達員ダイクストラ(akabane2026 dev 8da5579 の apps/dijkstra-delivery/static/view.js)の地図の描画をコピーして、
// 道を敷く遊び方に合わせて直した

import { NODE_R, ROAD_HIT_W, VIEW_H, VIEW_W } from "./config.js";
import { roadKey } from "./logic.js";

/**
 * @typedef {import("./logic.js").Stage} Stage
 * @typedef {{
 *   laid: Set<string>,          // 敷いた道
 *   cycle: Set<string>,         // 敷いた道のうち、輪の一部の道
 *   ghost: Set<string> | null,  // 完成の後に重ねる、最小の敷き方
 *   auto: boolean,              // 層B(クラスカル法が敷く)。敷いた道を青で描く
 *   current: string | null,     // 層B: いま見ている道
 *   skipped: Set<string>,       // 層B: 輪になるので飛ばした道
 * }} ViewState
 */

const NS = "http://www.w3.org/2000/svg";

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {Element} [parent]
 */
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}

/**
 * ステージの地図を組み立てる。下から道、局舎、文字の3層に分ける
 * @param {SVGSVGElement} svg
 * @param {Stage} stage
 */
export function buildMap(svg, stage) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
  const roads = el("g", { class: "roads" }, svg);
  // ゴーストは自分の敷いた道の上、局舎の下に描く
  const ghosts = el("g", { class: "ghosts" }, svg);
  const nodes = el("g", { class: "nodes" }, svg);
  const labels = el("g", { class: "labels" }, svg);
  const pos = stage.nodes;

  for (const r of stage.edges) {
    const key = roadKey(r);
    const [[x1, y1], [x2, y2]] = [pos[r.u], pos[r.v]];
    const g = el("g", { class: "road", "data-road": key }, roads);
    el("line", { x1, y1, x2, y2, class: "line" }, g);
    // 指で押しやすいよう、見た目より太い透明な線で当たり判定を取る
    el("line", { x1, y1, x2, y2, class: "hit", "stroke-width": ROAD_HIT_W, "data-road": key }, g);
    el("line", { x1, y1, x2, y2, class: "ghost", "data-ghost": key }, ghosts);

    const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
    const text = String(r.w);
    const w = 22 * text.length + 24;
    const lg = el("g", { class: "cost", "data-cost": key }, labels);
    el("rect", { x: mx - w / 2, y: my - 22, width: w, height: 44, rx: 10, class: "cost-bg" }, lg);
    el("text", { x: mx, y: my, class: "cost-text" }, lg).textContent = text;
  }

  for (const [n, [x, y]] of Object.entries(pos)) {
    const g = el("g", { class: "node" }, nodes);
    el("circle", { cx: x, cy: y, r: NODE_R, class: "dot" }, g);
    el("text", { x, y, class: "name" }, g).textContent = n;
  }
}

/**
 * 状態に合わせて地図の見た目を更新する
 * @param {SVGSVGElement} svg
 * @param {ViewState} vs
 */
export function render(svg, vs) {
  svg.classList.toggle("auto", vs.auto);
  for (const g of svg.querySelectorAll("g.road")) {
    const key = /** @type {string} */ (g.getAttribute("data-road"));
    g.classList.toggle("laid", vs.laid.has(key));
    g.classList.toggle("cycle", vs.cycle.has(key));
    g.classList.toggle("current", vs.current === key);
    g.classList.toggle("skipped", vs.skipped.has(key));
  }
  for (const line of svg.querySelectorAll("line.ghost")) {
    line.classList.toggle("shown", vs.ghost?.has(/** @type {string} */ (line.getAttribute("data-ghost"))) ?? false);
  }
  for (const g of svg.querySelectorAll("g.cost")) {
    g.classList.toggle("laid", vs.laid.has(/** @type {string} */ (g.getAttribute("data-cost"))));
  }
}

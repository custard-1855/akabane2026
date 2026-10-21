// SVG の描画。状態は持たず、main.js から渡された見た目の状態を描くだけにする。
// 配達員ダイクストラ(akabane2026 dev 8da5579 の apps/dijkstra-delivery/static/view.js)の地図の描画をコピーして、
// チャンネルを割り当てる遊び方に合わせて直した

import { HIT_R, NODE_R, VIEW_H, VIEW_W } from "./config.js";
import { pairKey } from "./logic.js";

/**
 * @typedef {import("./logic.js").Stage} Stage
 * @typedef {import("./logic.js").Assign} Assign
 * @typedef {{
 *   assign: Assign,             // 基地局 → チャンネル
 *   conflicts: Set<string>,     // 混信している隣どうし
 *   ghost: Assign | null,       // 完成の後に重ねる、最小の割り当て
 *   current: string | null,     // 層B: いま塗っている基地局
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
 * ステージの地図を組み立てる。下から隣どうしの線、基地局の2層に分ける
 * @param {SVGSVGElement} svg
 * @param {Stage} stage
 */
export function buildMap(svg, stage) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
  const pairs = el("g", { class: "pairs" }, svg);
  const nodes = el("g", { class: "nodes" }, svg);
  const pos = stage.nodes;

  for (const p of stage.edges) {
    const [[x1, y1], [x2, y2]] = [pos[p.u], pos[p.v]];
    el("line", { x1, y1, x2, y2, class: "pair", "data-pair": pairKey(p) }, pairs);
  }

  for (const [n, [x, y]] of Object.entries(pos)) {
    const g = el("g", { class: "node", "data-node": n }, nodes);
    // 最小の割り当てのゴースト。基地局の外側に、チャンネルの色の破線の輪と番号を出す
    el("circle", { cx: x, cy: y, r: NODE_R + 16, class: "ghost-ring" }, g);
    el("text", { x: x + NODE_R + 18, y: y - NODE_R - 6, class: "ghost-num" }, g);
    el("circle", { cx: x, cy: y, r: NODE_R + 16, class: "glow-ring" }, g);
    el("circle", { cx: x, cy: y, r: NODE_R, class: "dot" }, g);
    el("text", { x, y, class: "num" }, g);
    el("text", { x, y: y + NODE_R + 34, class: "name" }, g).textContent = n;
    // 指で押しやすいよう、見た目より大きい透明な円で当たり判定を取る
    el("circle", { cx: x, cy: y, r: HIT_R, class: "hit", "data-node": n }, g);
  }
}

/**
 * 状態に合わせて地図の見た目を更新する
 * @param {SVGSVGElement} svg
 * @param {ViewState} vs
 */
export function render(svg, vs) {
  for (const line of svg.querySelectorAll("line.pair")) {
    line.classList.toggle("conflict", vs.conflicts.has(/** @type {string} */ (line.getAttribute("data-pair"))));
  }
  for (const g of svg.querySelectorAll("g.node")) {
    const n = /** @type {string} */ (g.getAttribute("data-node"));
    const c = vs.assign[n];
    // チャンネルは色(ch-1〜ch-5)と番号の両方で示し、色だけに頼らない
    g.setAttribute("class", `node${c ? ` ch-${c}` : ""}${vs.current === n ? " current" : ""}`);
    /** @type {SVGTextElement} */ (g.querySelector(".num")).textContent = c ? String(c) : "";
    const ghost = vs.ghost?.[n];
    g.classList.toggle("ghost", ghost !== undefined);
    if (ghost !== undefined) g.classList.add(`gh-${ghost}`);
    /** @type {SVGTextElement} */ (g.querySelector(".ghost-num")).textContent = ghost ? String(ghost) : "";
  }
}

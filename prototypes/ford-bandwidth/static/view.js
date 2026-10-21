// SVG の描画。状態は持たず、main.js から渡された見た目の状態を描くだけにする。
// 配達員ダイクストラ(akabane2026 dev 8da5579 の apps/dijkstra-delivery/static/view.js)の地図の描画(有向辺の矢印を含む)をコピーして、
// データを送る遊び方に合わせて直した

import { FLOW_MAX_W, HIT_R, NODE_R, VIEW_H, VIEW_W } from "./config.js";
import { lineKey } from "./logic.js";

/**
 * @typedef {import("./logic.js").Stage} Stage
 * @typedef {import("./logic.js").Flow} Flow
 * @typedef {{
 *   flow: Flow,                 // 回線ごとの送る量
 *   route: string[],            // 層A: 作りかけのルート
 *   ghost: Flow | null,         // 完成の後に重ねる、最大の送り方の送る量
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

/** @param {SVGSVGElement} svg @param {string} name */
const layer = (svg, name) => /** @type {SVGGElement} */ (svg.querySelector(`g.${name}`));

/**
 * 回線の両端を、地点の円の手前で止めた座標。矢印の先が円に隠れないようにする
 * @param {[number, number]} a
 * @param {[number, number]} b
 */
function trimmed(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k1 = (NODE_R + 4) / len;
  const k2 = (len - NODE_R - 8) / len;
  return {
    x1: a[0] + (b[0] - a[0]) * k1,
    y1: a[1] + (b[1] - a[1]) * k1,
    x2: a[0] + (b[0] - a[0]) * k2,
    y2: a[1] + (b[1] - a[1]) * k2,
  };
}

/**
 * ステージの地図を組み立てる。下から回線、送る量、地点、文字の4層に分ける
 * @param {SVGSVGElement} svg
 * @param {Stage} stage
 */
export function buildMap(svg, stage) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
  const defs = el("defs", {}, svg);
  // 矢印の大きさは線の太さによらず一定にする(送る量で線の太さが変わっても、向きが同じように読める)
  for (const name of ["arrow", "arrow-flow"]) {
    const marker = el("marker", {
      id: `${name}-${svg.id}`, viewBox: "0 0 10 10", refX: 9, refY: 5,
      markerWidth: 28, markerHeight: 28, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse",
    }, defs);
    el("path", { d: "M0,0 L10,5 L0,10 z", class: name }, marker);
  }
  const lines = el("g", { class: "lines" }, svg);
  el("g", { class: "flows" }, svg);
  el("g", { class: "overlay" }, svg);
  const nodes = el("g", { class: "nodes" }, svg);
  const labels = el("g", { class: "labels" }, svg);
  const pos = stage.nodes;

  for (const e of stage.edges) {
    const key = lineKey(e);
    el("line", { ...trimmed(pos[e.u], pos[e.v]), class: "line", "data-line": key, "marker-end": `url(#arrow-${svg.id})` }, lines);
    const [mx, my] = [(pos[e.u][0] + pos[e.v][0]) / 2, (pos[e.u][1] + pos[e.v][1]) / 2];
    const g = el("g", { class: "amount", "data-amount": key }, labels);
    el("rect", { x: mx - 46, y: my - 24, width: 92, height: 48, rx: 10, class: "amount-bg" }, g);
    el("text", { x: mx, y: my, class: "amount-text" }, g);
    // 最大の送り方のゴースト。自分の送る量の下に、破線の枠で「最大 n」と出す
    const gg = el("g", { class: "ghost", "data-ghost": key }, labels);
    el("rect", { x: mx - 50, y: my + 28, width: 100, height: 36, rx: 8, class: "ghost-bg" }, gg);
    el("text", { x: mx, y: my + 46, class: "ghost-text" }, gg);
  }

  for (const [n, [x, y]] of Object.entries(pos)) {
    const g = el("g", { class: "node", "data-node": n }, nodes);
    el("circle", { cx: x, cy: y, r: NODE_R, class: "dot" }, g);
    el("text", { x, y, class: "name" }, g).textContent = n;
    // 指で押しやすいよう、見た目より大きい透明な円で当たり判定を取る
    el("circle", { cx: x, cy: y, r: HIT_R, class: "hit", "data-node": n }, g);
    if (n === stage.start || n === stage.goal) {
      // 回線と重ならないよう、データセンターは左下、利用者は右下に書く
      const left = n === stage.start;
      el("text", {
        x: left ? x - NODE_R : x + NODE_R, y: y + NODE_R + 30, class: "caption", "text-anchor": left ? "end" : "start",
      }, labels).textContent = left ? "データセンター" : "利用者";
    }
  }
}

/**
 * 状態に合わせて地図の見た目を更新する
 * @param {SVGSVGElement} svg
 * @param {Stage} stage
 * @param {ViewState} vs
 */
export function render(svg, stage, vs) {
  const pos = stage.nodes;
  // 送る量は、回線の上に重ねる青い線の太さで見せる(帯域いっぱいで FLOW_MAX_W)
  const flows = layer(svg, "flows");
  flows.replaceChildren();
  for (const e of stage.edges) {
    const f = vs.flow[lineKey(e)] ?? 0;
    if (f <= 0) continue;
    el("line", {
      ...trimmed(pos[e.u], pos[e.v]), class: "flow", "stroke-width": 4 + (FLOW_MAX_W - 4) * (f / e.cap),
      "marker-end": `url(#arrow-flow-${svg.id})`,
    }, flows);
  }

  const overlay = layer(svg, "overlay");
  overlay.replaceChildren();
  if (vs.route.length >= 2) {
    el("polyline", { points: vs.route.map((n) => pos[n].join(",")).join(" "), class: "route" }, overlay);
  }

  for (const e of stage.edges) {
    const key = lineKey(e);
    const f = vs.flow[key] ?? 0;
    const g = /** @type {SVGGElement} */ (svg.querySelector(`g.amount[data-amount="${key}"]`));
    /** @type {SVGTextElement} */ (g.querySelector(".amount-text")).textContent = `${f}/${e.cap}`;
    g.classList.toggle("full", f >= e.cap);
    const gg = /** @type {SVGGElement} */ (svg.querySelector(`g.ghost[data-ghost="${key}"]`));
    gg.classList.toggle("shown", vs.ghost !== null);
    /** @type {SVGTextElement} */ (gg.querySelector(".ghost-text")).textContent = `最大 ${vs.ghost?.[key] ?? 0}`;
  }

  const here = vs.route.at(-1);
  for (const g of layer(svg, "nodes").querySelectorAll("g.node")) {
    const n = /** @type {string} */ (g.getAttribute("data-node"));
    g.classList.toggle("on-route", vs.route.includes(n));
    g.classList.toggle("current", n === here);
  }
}

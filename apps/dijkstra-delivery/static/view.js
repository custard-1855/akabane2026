// SVG の描画と演出。状態は持たず、main.js から渡された見た目の状態を描くだけにする

import { CITY_DOT_R, NODE_R, HIT_R, VIEW_W, VIEW_H } from "./config.js";

/**
 * @typedef {import("./stages.js").Stage} Stage
 * @typedef {{
 *   mode: "A" | "B" | "C",            // C は大都市
 *   route: string[],                 // 層A: プレイヤーのルート。大都市では倉庫からお届け先までの最短ルート([倉庫] だけのこともある)
 *   settled: Set<string>,            // 層B と大都市: 確定
 *   frontier: Set<string>,           // 層B: 候補
 *   labels: Map<string, number> | null, // 層B: 札
 *   ghost: string[] | null,          // 層A: クリア後の最短ルート
 *   glow: string[],                  // 配達の案内で光らせる交差点(ヒント①でも使う)
 *   map: Map<string, number> | null, // 到着時間マップ(クリア後のみ)
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
 * ステージの地図を組み立てる。下から辺、ノード、文字、演出の4層に分ける。
 * 演出層は render() が触れないので、再描画しても波紋は消えない
 * @param {SVGSVGElement} svg
 * @param {Stage} stage
 */
export function buildMap(svg, stage) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
  // 大都市は交差点を小さい点で描き、道の所要時間と交差点の名前は出さない(読めないうえ、道を自分で選ばない)
  const dense = Boolean(stage.dense);
  svg.classList.toggle("dense", dense);
  const defs = el("defs", {}, svg);
  // 同じページに地図が2枚(タイトル画面とゲーム)あるので、矢印の id を地図ごとに分ける
  const arrowId = `arrow-${svg.id}`;
  const marker = el("marker", {
    id: arrowId, viewBox: "0 0 10 10", refX: 9, refY: 5,
    markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse",
  }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, marker);

  const edges = el("g", { class: "edges" }, svg);
  const nodes = el("g", { class: "nodes" }, svg);
  const labels = el("g", { class: "labels" }, svg);
  el("g", { class: "fx" }, svg);

  const start = stage.start ?? "S";
  const goal = stage.goal ?? "G";
  const pos = stage.nodes;

  for (const e of stage.edges) {
    const [x1, y1] = pos[e.u];
    let [x2, y2] = pos[e.v];
    if (e.directed) {
      // 矢印の先がノードの円に隠れないよう、線を円の手前で止める
      const len = Math.hypot(x2 - x1, y2 - y1);
      const k = (len - NODE_R - 6) / len;
      [x2, y2] = [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
    }
    el("line", {
      x1, y1, x2, y2,
      class: "edge",
      ...(e.directed ? { "marker-end": `url(#${arrowId})` } : {}),
    }, edges);

    if (dense) continue;
    const [mx, my] = [(pos[e.u][0] + pos[e.v][0]) / 2, (pos[e.u][1] + pos[e.v][1]) / 2];
    const text = String(e.w);
    const w = 22 * text.length + 24;
    el("rect", { x: mx - w / 2, y: my - 22, width: w, height: 44, rx: 10, class: "weight-bg" }, labels);
    el("text", { x: mx, y: my, class: "weight" }, labels).textContent = text;
  }
  el("g", { class: "overlay" }, edges);

  for (const [n, [x, y]] of Object.entries(pos)) {
    const g = el("g", { class: "node", "data-node": n }, nodes);
    if (dense) {
      // タップは押した位置で受ける(nearestNode)ので、当たり判定の円は置かない
      el("circle", { cx: x, cy: y, r: CITY_DOT_R, class: "dot" }, g);
      continue;
    }
    el("circle", { cx: x, cy: y, r: NODE_R + 16, class: "glow-ring" }, g);
    el("circle", { cx: x, cy: y, r: NODE_R, class: "dot" }, g);
    el("text", { x, y, class: "name" }, g).textContent = n;
    // 指で押しやすいよう、見た目より大きい透明な円で当たり判定を取る
    el("circle", { cx: x, cy: y, r: HIT_R, class: "hit", "data-node": n }, g);

    el("text", { x, y: y - NODE_R - 18, class: "tag", "data-tag": n }, labels);
    if (n === start || n === goal) {
      el("text", { x, y: y + NODE_R + 38, class: "caption" }, labels).textContent =
        n === start ? "倉庫" : "お届け先";
    }
  }
}

/**
 * @param {SVGGElement} parent
 * @param {Stage} stage
 * @param {string[]} path
 * @param {string} cls
 */
function polyline(parent, stage, path, cls) {
  if (path.length < 2) return;
  const points = path.map((n) => stage.nodes[n].join(",")).join(" ");
  el("polyline", { points, class: cls }, parent);
}

/**
 * 到着時間マップの色。近いほど薄く、遠いほど濃い青(1色の濃淡)
 * @param {number} t 0〜1
 */
function rampColor(t) {
  // 青の濃淡 100 → 650
  const from = [0xcd, 0xe2, 0xfb];
  const to = [0x10, 0x42, 0x81];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t));
  return `rgb(${c.join(",")})`;
}

/**
 * 状態に合わせて地図の見た目を更新する
 * @param {SVGSVGElement} svg
 * @param {Stage} stage
 * @param {ViewState} vs
 */
export function render(svg, stage, vs) {
  const overlay = /** @type {SVGGElement} */ (svg.querySelector("g.overlay"));
  overlay.replaceChildren();
  if (vs.mode !== "B") polyline(overlay, stage, vs.route, "route");
  if (vs.ghost) polyline(overlay, stage, vs.ghost, "ghost");

  const maxDist = vs.map ? Math.max(...[...vs.map.values()].filter(Number.isFinite), 1) : 1;
  const current = vs.route.at(-1);

  for (const g of layer(svg, "nodes").querySelectorAll("g.node")) {
    const n = /** @type {string} */ (g.getAttribute("data-node"));
    const dot = /** @type {SVGCircleElement} */ (g.querySelector(".dot"));
    const onRoute = vs.mode === "A" && vs.route.includes(n);
    g.classList.toggle("on-route", onRoute);
    g.classList.toggle(
      "current",
      vs.mode === "C" ? n === vs.route[0] || n === current : vs.mode === "A" && n === current && !vs.map,
    );
    g.classList.toggle("settled", vs.mode !== "A" && vs.settled.has(n));
    g.classList.toggle("frontier", vs.mode === "B" && vs.frontier.has(n));
    g.classList.toggle("glow", vs.glow.includes(n));
    g.classList.toggle("map", vs.map !== null);
    const d = vs.map?.get(n);
    const t = d !== undefined && Number.isFinite(d) ? d / maxDist : null;
    dot.style.fill = t === null ? "" : rampColor(t);
    // 濃い塗りの上では白い文字にする
    g.classList.toggle("dark-fill", t !== null && t > 0.45);
  }

  for (const tag of layer(svg, "labels").querySelectorAll("text.tag")) {
    const n = /** @type {string} */ (tag.getAttribute("data-tag"));
    let text = "";
    if (vs.map) {
      const d = vs.map.get(n);
      text = d !== undefined && Number.isFinite(d) ? `${d}分` : "×";
    } else if (vs.labels) {
      const d = vs.labels.get(n);
      text = d === undefined || !Number.isFinite(d) ? "∞" : String(d);
    }
    tag.textContent = text;
    tag.classList.toggle("settled", vs.mode === "B" && vs.settled.has(n) && !vs.map);
  }
}

/**
 * 確定した交差点から円を広げる。「近い順に確定する」を目で見せる
 * @param {SVGSVGElement} svg
 * @param {Stage} stage
 * @param {string} n
 */
export function ripple(svg, stage, n) {
  const [cx, cy] = stage.nodes[n];
  const c = el("circle", { cx, cy, r: NODE_R, class: "ripple" }, layer(svg, "fx"));
  c.addEventListener("animationend", () => c.remove());
}

/** @param {SVGSVGElement} svg */
export function clearFx(svg) {
  layer(svg, "fx")?.replaceChildren();
}

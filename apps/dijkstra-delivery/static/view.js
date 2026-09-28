// SVG 描画と演出(設計書 3.5, 3.7)。ゲームの状態は持たず、main.js が組み立てた scene を描く

import { VIEW_W, VIEW_H } from "./stages.js";

const NS = "http://www.w3.org/2000/svg";
const NODE_R = 18;
const HIT_R = 45;
const TAG_H = 32;
/** 札の縁とノード中心の最小距離(S・G の外周リングにかからない) */
const TAG_GAP = 30;
const TAG_DIRS = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];
const ARROW_LEN = 16;
const ARROW_HALF = 8;

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null && v !== false) e.setAttribute(k, String(v));
  }
  if (parent) parent.append(e);
  return e;
}

// 等時線の色(近い=黄 → 遠い=紫)。viridis の近似
const HEAT_STOPS = [
  [253, 231, 37], [94, 201, 98], [33, 145, 140], [59, 82, 139], [68, 1, 84],
];

/** t ∈ [0, 1] の色と、その上に載せる文字色 */
export function heatColor(t) {
  const x = Math.max(0, Math.min(1, t)) * (HEAT_STOPS.length - 1);
  const i = Math.min(Math.floor(x), HEAT_STOPS.length - 2);
  const f = x - i;
  const c = HEAT_STOPS[i].map((a, k) => Math.round(a + (HEAT_STOPS[i + 1][k] - a) * f));
  return { fill: `rgb(${c.join(",")})`, ink: t > 0.45 ? "#fff" : "#1b1b1b" };
}

export function heatGradientCss() {
  return `linear-gradient(to right, ${HEAT_STOPS.map((c) => `rgb(${c.join(",")})`).join(", ")})`;
}

/**
 * @typedef {{
 *   stage: import("./logic.js").Stage,
 *   nodes: Map<string, { cls: string[], tag?: string, fill?: string, ink?: string }>,
 *   edgeCls: (e: import("./logic.js").Edge) => string[],
 *   ghost: string[] | null,
 *   halos: Map<string, string> | null,
 * }} Scene
 */

export function createView(svg, onTap) {
  let portrait = false;
  let stage = null;

  const layers = {};
  for (const name of ["heat", "edges", "ghost", "nodes", "labels", "hit", "fx"]) {
    layers[name] = el("g", { class: `layer-${name}` }, svg);
  }

  svg.addEventListener("click", (ev) => {
    const hit = ev.target.closest?.("[data-node]");
    if (hit) onTap(hit.getAttribute("data-node"));
  });

  /** ステージ座標 → 画面座標。縦長では x と y を入れ替える */
  const pt = (n) => {
    const [x, y] = stage.nodes[n];
    return portrait ? [y, x] : [x, y];
  };

  function setOrientation(isPortrait) {
    portrait = isPortrait;
    svg.setAttribute("viewBox", portrait ? `0 0 ${VIEW_H} ${VIEW_W}` : `0 0 ${VIEW_W} ${VIEW_H}`);
    clearFx();
  }

  function clearFx() {
    layers.fx.replaceChildren();
  }

  /**
   * 札の中心。つながる辺から角度が最も離れた向きに置く(縦長では辺の多くが縦向きになり、上に置くと重みと重なるため)。
   * 同点なら TAG_DIRS の順(上を優先)。
   */
  function tagPosition(n, w, h) {
    const [x, y] = pt(n);
    const angles = [];
    for (const e of stage.edges) {
      const other = e.u === n ? e.v : e.v === n ? e.u : null;
      if (other === null) continue;
      const [ox, oy] = pt(other);
      angles.push(Math.atan2(oy - y, ox - x));
    }
    const [vw, vh] = portrait ? [VIEW_H, VIEW_W] : [VIEW_W, VIEW_H];
    let best = null;
    let bestScore = -Infinity;
    for (const [dx, dy] of TAG_DIRS) {
      const len = Math.hypot(dx, dy);
      const [ux, uy] = [dx / len, dy / len];
      const t = TAG_GAP + Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
      const [cx, cy] = [x + ux * t, y + uy * t];
      const a = Math.atan2(uy, ux);
      let score = Math.min(Math.PI, ...angles.map((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))));
      const inside = cx - w / 2 >= 0 && cx + w / 2 <= vw && cy - h / 2 >= 0 && cy + h / 2 <= vh;
      if (!inside) score -= 10;
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = [cx, cy];
      }
    }
    return best;
  }

  function drawEdge(e, cls) {
    const [a, b] = [pt(e.u), pt(e.v)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const g = el("g", { class: ["edge", e.kind ?? "road", e.directed && "directed", ...cls].filter(Boolean).join(" ") }, layers.edges);
    if (!e.directed) {
      el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, g);
    } else {
      // 矢じりの先端をノードの縁に合わせる
      const tip = [b[0] - ux * (NODE_R + 3), b[1] - uy * (NODE_R + 3)];
      const base = [tip[0] - ux * ARROW_LEN, tip[1] - uy * ARROW_LEN];
      el("line", { x1: a[0], y1: a[1], x2: base[0], y2: base[1] }, g);
      const pts = [
        tip,
        [base[0] - uy * ARROW_HALF, base[1] + ux * ARROW_HALF],
        [base[0] + uy * ARROW_HALF, base[1] - ux * ARROW_HALF],
      ];
      el("polygon", { class: "arrow", points: pts.map((p) => p.join(",")).join(" ") }, g);
    }
    const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const w = String(e.w).length * 15 + 16;
    const lg = el("g", { class: `weight ${e.kind ?? "road"}` }, layers.labels);
    el("rect", { x: mx - w / 2, y: my - 16, width: w, height: 32, rx: 8 }, lg);
    el("text", { x: mx, y: my + 1 }, lg).textContent = String(e.w);
  }

  /** @param {Scene} scene */
  function render(scene) {
    stage = scene.stage;
    for (const name of ["heat", "edges", "ghost", "nodes", "labels", "hit"]) layers[name].replaceChildren();

    if (scene.halos) {
      for (const [n, color] of scene.halos) {
        const [x, y] = pt(n);
        el("circle", { cx: x, cy: y, r: 72, fill: color, class: "halo" }, layers.heat);
      }
    }

    for (const e of stage.edges) drawEdge(e, scene.edgeCls(e));

    if (scene.ghost && scene.ghost.length > 1) {
      el("polyline", { class: "ghost", points: scene.ghost.map((n) => pt(n).join(",")).join(" ") }, layers.ghost);
    }

    for (const n of Object.keys(stage.nodes)) {
      const [x, y] = pt(n);
      const st = scene.nodes.get(n) ?? { cls: [] };
      const g = el("g", { class: ["node", ...st.cls].join(" ") }, layers.nodes);
      if (st.cls.includes("start") || st.cls.includes("goal")) {
        el("circle", { class: "ring", cx: x, cy: y, r: NODE_R + 7 }, g);
      }
      el("circle", { class: "body", cx: x, cy: y, r: NODE_R, style: st.fill ? `fill:${st.fill}` : null }, g);
      el("text", { x, y: y + 1, style: st.ink ? `fill:${st.ink}` : null }, g).textContent = n;

      if (st.tag !== undefined) {
        const tg = el("g", { class: "tag" }, layers.labels);
        const w = st.tag.length * 15 + 16;
        const [tx, ty] = tagPosition(n, w, TAG_H);
        el("rect", { x: tx - w / 2, y: ty - TAG_H / 2, width: w, height: TAG_H, rx: 6 }, tg);
        el("text", { x: tx, y: ty + 1 }, tg).textContent = st.tag;
      }
      el("circle", { class: "hit", cx: x, cy: y, r: HIT_R, "data-node": n }, layers.hit);
    }
  }

  /** 波紋(kind: "settle" は確定、"bad" は誤操作) */
  function ripple(n, kind = "settle") {
    if (!stage) return;
    const [x, y] = pt(n);
    const c = el("circle", { class: `ripple ${kind}`, cx: x, cy: y, r: NODE_R }, layers.fx);
    const remove = () => c.remove();
    c.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 1500); // アニメーションが無効な環境向け
  }

  return { setOrientation, render, ripple, clearFx };
}

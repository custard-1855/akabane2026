// 起動と、DOM・入力・時間の接続
import { CFG } from "./config";
import { setupDevPanel, devPanelEnabled } from "./dev-panel";
import { clamp } from "./math";
import { readColors } from "./palette";
import { createRenderer } from "./render";
import { Scene } from "./scene";
import { setupThemeButton } from "./theme";

const hero = document.getElementById("hero")!;
const cv = document.getElementById("cv") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
const nameEl = document.getElementById("shape-name")!;
const algoEl = document.getElementById("algo-name")!;
const themeBtn = document.getElementById("theme-btn") as HTMLButtonElement;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const renderer = createRenderer(ctx, reduceMotion);
let W = 0,
  H = 0;
let visible = true,
  last = 0;
const draw = () => renderer.draw(scene, W, H);

function sizeCanvas() {
  const r = hero.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(r.width));
  H = Math.max(1, Math.round(r.height));
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function loop(ts: number) {
  requestAnimationFrame(loop);
  const dt = clamp((ts - last) / 1000 || 0.016, 0, 0.05);
  last = ts;
  if (!visible) return;
  scene.update(dt);
  draw();
}

/* 操作: ドラッグで回す / ホバーで隣を照らす / クリックで処理を実行 */
const local = (e: PointerEvent): [number, number] => {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};
let press: {
  x: number;
  y: number;
  lx: number;
  ly: number;
  lt: number;
  moved: boolean;
  id: number;
} | null = null;
const redraw = () => {
  if (reduceMotion) draw();
};
cv.addEventListener("pointerdown", (e) => {
  const [x, y] = local(e);
  press = { x, y, lx: x, ly: y, lt: performance.now(), moved: false, id: e.pointerId };
  scene.vRot = 0;
  scene.vTilt = 0;
  scene.idle = 0;
});
cv.addEventListener("pointermove", (e) => {
  const [x, y] = local(e);
  Object.assign(scene.ptr, { x, y, inside: true, mouse: e.pointerType === "mouse" });
  if (press && press.id === e.pointerId) {
    if (!press.moved && Math.hypot(x - press.x, y - press.y) > 6) {
      press.moved = true;
      scene.dragging = true;
      hero.classList.add("dragging");
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* 取れなくても回せる */
      }
    }
    if (press.moved) {
      const now = performance.now(),
        sec = Math.max(0.008, (now - press.lt) / 1000);
      const dr = (x - press.lx) * CFG.drag,
        dtl = -(y - press.ly) * CFG.drag;
      scene.rot += dr;
      scene.tilt = clamp(scene.tilt + dtl, -1.2, 1.2);
      scene.vRot = 0.6 * (dr / sec) + 0.4 * scene.vRot;
      scene.vTilt = 0.6 * (dtl / sec) + 0.4 * scene.vTilt;
      Object.assign(press, { lx: x, ly: y, lt: now });
      scene.idle = 0;
    }
  }
  redraw();
});
const release = (e: PointerEvent, canceled: boolean) => {
  if (!press || press.id !== e.pointerId) return;
  if (!press.moved && !canceled) {
    scene.click(...local(e));
  }
  // 最後に動かしてから時間が空いていれば、慣性は付けない
  if (performance.now() - press.lt > 120) {
    scene.vRot = 0;
    scene.vTilt = 0;
  }
  if (reduceMotion) {
    scene.vRot = 0;
    scene.vTilt = 0;
  }
  press = null;
  scene.dragging = false;
  hero.classList.remove("dragging");
  redraw();
};
cv.addEventListener("pointerup", (e) => release(e, false));
cv.addEventListener("pointercancel", (e) => release(e, true));
cv.addEventListener("pointerleave", () => {
  if (!scene.dragging) scene.ptr.inside = false;
  redraw();
});

new ResizeObserver(() => {
  sizeCanvas();
  draw();
}).observe(hero);
new IntersectionObserver((es) => {
  visible = es[0].isIntersecting;
}).observe(hero);
document.addEventListener("visibilitychange", () => {
  visible = !document.hidden;
  last = performance.now();
});
function onTheme() {
  readColors();
  renderer.resetCaches();
  draw();
}
matchMedia("(prefers-color-scheme: light)").addEventListener("change", onTheme);
new MutationObserver(onTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

setupThemeButton(themeBtn);
readColors();
sizeCanvas();
const scene = new Scene(
  {
    onShapeLoad: (shape) => {
      nameEl.textContent = shape.name;
    },
    // ヒーローでは結果の文は出さず、実行中の処理の名前だけを形の名前の横に出す
    onAlgoStart: (algo) => {
      algoEl.textContent = algo.name;
    },
    onAlgoIdle: () => {
      if (algoEl.textContent) algoEl.textContent = "";
    },
  },
  reduceMotion,
);
if (devPanelEnabled()) setupDevPanel(hero, scene, draw);

if (reduceMotion) {
  // 動きを減らす設定では、信号が広がった状態の1枚で止める(ドラッグとクリックには応じる)
  scene.settle();
  draw();
} else {
  requestAnimationFrame(loop);
}

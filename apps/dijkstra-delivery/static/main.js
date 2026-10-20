// 起動と、入力 → ラウンド → 描画の接続、自動進行

import { AUTO_SETTLE_MS } from "./config.js";
import { ControlRound, DeliveryRound, INF, buildAdj, dijkstra } from "./logic.js";
import { STAGES } from "./stages.js";
import { buildMap, clearFx, render, ripple } from "./view.js";

/** 自動進行の順。各ステージで層A(配達)→ 層B(管制室) */
const FLOW = STAGES.flatMap((_, stageIndex) => [
  { stageIndex, mode: /** @type {const} */ ("A") },
  { stageIndex, mode: /** @type {const} */ ("B") },
]);

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("board")));
const ui = {
  titleScreen: $("title-screen"),
  gameScreen: $("game-screen"),
  titleMap: /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("title-map"))),
  start: $("start"),
  choose: $("choose"),
  stageList: $("stage-list"),
  toTitle: $("to-title"),
  stage: /** @type {HTMLSelectElement} */ ($("stage")),
  modeA: $("mode-a"),
  modeB: $("mode-b"),
  undo: /** @type {HTMLButtonElement} */ ($("undo")),
  reset: $("reset"),
  map: /** @type {HTMLButtonElement} */ ($("map")),
  finishAll: /** @type {HTMLButtonElement} */ ($("finish-all")),
  next: /** @type {HTMLButtonElement} */ ($("next")),
  msg: $("msg"),
  sub: $("sub"),
};

const state = {
  stageIndex: 0,
  /** @type {"A" | "B"} */
  mode: "A",
  /** @type {{ dist: Map<string, number>, prev: Map<string, string> } | null} */
  opt: null,
  /** @type {DeliveryRound | null} */
  delivery: null,
  /** @type {ControlRound | null} */
  control: null,
  showMap: false,
  /** @type {string[]} */
  alertPath: [],
  /** @type {string[]} */
  alertNodes: [],
  msg: "",
  sub: "",
  /** 「続けて全地点を確定」のタイマー。ステージやモードを変えたら止める */
  autoTimer: 0,
};

const stage = () => STAGES[state.stageIndex];
const fmt = (d) => (d === INF ? "∞" : String(d));
const starText = (n) => "★".repeat(n) + "☆".repeat(3 - n);
const flowIndex = () =>
  FLOW.findIndex((f) => f.stageIndex === state.stageIndex && f.mode === state.mode);
const isLast = () => flowIndex() === FLOW.length - 1;

function cleared() {
  return state.mode === "A" ? state.delivery.finished : state.control.finished;
}

function say(msg, sub = "") {
  state.msg = msg;
  state.sub = sub;
}

function stopAuto() {
  clearInterval(state.autoTimer);
  state.autoTimer = 0;
}

/** ステージとモードを読み込み、ラウンドを作り直す */
function load(stageIndex, mode) {
  stopAuto();
  state.stageIndex = stageIndex;
  state.mode = mode;
  const s = stage();
  state.opt = dijkstra(buildAdj(s), s.start ?? "S");
  buildMap(svg, s);
  reset();
}

function reset() {
  stopAuto();
  clearFx(svg);
  const s = stage();
  state.delivery = new DeliveryRound(s);
  state.control = new ControlRound(s);
  state.showMap = false;
  state.alertPath = [];
  state.alertNodes = [];
  if (state.mode === "A") {
    say(
      "倉庫 S から、お届け先 G まで、いちばん早いルートで届けよう",
      "隣の交差点をタップして進む。道の数字は所要時間(分)。同じ交差点は2度通れない",
    );
  } else {
    say(
      "管制室: 交差点の上の札は「S から、今わかっている中でいちばん早い時間」",
      "札がいちばん小さい候補(黄色の破線)をタップして確定しよう。まずは倉庫 S(札 0)から",
    );
  }
  update();
}

/** @param {string} n */
function tapDelivery(n) {
  const round = state.delivery;
  if (round.finished) return;
  const r = round.tap(n);
  const sofar = `ここまで ${round.cost()}分`;
  const via = `ルート: ${round.route.join(" → ")}`;
  switch (r.kind) {
    case "added":
      say(sofar, via);
      break;
    case "undone":
      say(`1手戻りました。${sofar}`, via);
      break;
    case "invalid":
      say("そこへは直接行けません", `${sofar}。${via}`);
      break;
    case "stuck":
      say(
        "ここからはお届け先に行けません。戻ってください",
        "1つ前の交差点をタップするか、「1手戻る」で戻れます",
      );
      break;
    case "finished": {
      const cost = round.cost();
      const { tie } = round.ghost();
      const best =
        cost === round.optCost
          ? `最短です! 点線はあなたのルート${tie ? "。ほかにも同じ時間のルートがあります" : ""}`
          : `最短は ${round.optCost}分。点線が最短ルート`;
      say(`到着! ${cost}分 ${starText(round.stars())}`, `${best}。「到着時間マップ」で全地点への最短時間を見られます`);
      break;
    }
  }
}

/** @param {string} n */
function tapControl(n) {
  const round = state.control;
  // クリア後は「続けて全地点を確定」でだけ進める(採点の対象外)
  if (round.finished) return;
  state.alertPath = [];
  state.alertNodes = [];
  const label = round.dist.get(n);
  const r = round.settle(n);
  switch (r.kind) {
    case "already":
      say("確定済みです", "まだ確定していない候補(黄色の破線)から選ぼう");
      break;
    case "unreached":
      say("まだ届いていません", "札が ∞ の交差点は、まだ確定できません");
      break;
    case "not_min": {
      const miss = `ミス ${round.mistakes}回。札がいちばん小さい候補から確定しよう`;
      if (r.reason.kind === "overturn") {
        const { via, viaDist, best, path } = r.reason;
        state.alertPath = path;
        state.alertNodes = [via];
        say(`まだ確定していない ${via}(札 ${viaDist})を経由すると、${n} には ${best} で着けます`, miss);
      } else {
        state.alertNodes = r.reason.minNodes;
        say(
          `札が ${label} より小さい候補が残っています。今回はたまたま合っていますが、この時点では保証できません`,
          miss,
        );
      }
      break;
    }
    case "settled": {
      ripple(svg, stage(), n);
      if (round.finished) {
        say(
          `${n} を確定! S から ${n} まで最短 ${label}分。ミス ${round.mistakes}回 ${starText(round.stars())}`,
          "「続けて全地点を確定」で、1回の実行で全地点への最短が求まる様子を見られます",
        );
      } else {
        say(`${n} を確定(${label}分)`, summarize(r.relaxations));
      }
      break;
    }
  }
}

/** 1回の確定で書き換えた札をまとめて1行にする */
function summarize(relaxations) {
  const updated = relaxations.filter((x) => x.updated);
  if (updated.length === 0) return "札の書き換えなし";
  return `札の書き換え: ${updated.map((x) => `${x.node}: ${fmt(x.from)}→${x.cand}`).join(", ")}`;
}

/** 層Bのクリア後に、残りを最小の候補から順に確定する */
function finishAll() {
  const round = state.control;
  state.alertPath = [];
  state.alertNodes = [];
  state.autoTimer = setInterval(() => {
    const cands = round.candidates();
    if (cands.length === 0) {
      stopAuto();
      say("全地点を確定しました", "1回の実行で、S からすべての交差点への最短時間が求まりました");
      update();
      return;
    }
    const n = cands.reduce((a, b) => (round.dist.get(b) < round.dist.get(a) ? b : a));
    const r = round.settle(n);
    ripple(svg, stage(), n);
    say(`${n} を確定(${round.dist.get(n)}分)`, r.kind === "settled" ? summarize(r.relaxations) : "");
    update();
  }, AUTO_SETTLE_MS);
  update();
}

/** 次の来場者に端末を渡せるよう、タイトル画面に戻す */
function showTitle() {
  stopAuto();
  clearFx(svg);
  ui.gameScreen.hidden = true;
  ui.titleScreen.hidden = false;
  ui.stageList.hidden = true;
  ui.choose.setAttribute("aria-expanded", "false");
}

function startGame(stageIndex) {
  ui.titleScreen.hidden = true;
  ui.gameScreen.hidden = false;
  load(stageIndex, "A");
}

function update() {
  const s = stage();
  const isA = state.mode === "A";
  const done = cleared();
  const d = state.delivery;
  const c = state.control;

  render(svg, s, {
    mode: state.mode,
    route: d.route,
    settled: c.done,
    frontier: new Set(c.candidates()),
    labels: isA ? null : c.dist,
    ghost: isA && d.finished ? d.ghost().path : null,
    alertPath: state.alertPath,
    alertNodes: state.alertNodes,
    map: done && state.showMap ? state.opt.dist : null,
  });

  ui.stage.value = String(state.stageIndex);
  ui.modeA.classList.toggle("active", isA);
  ui.modeB.classList.toggle("active", !isA);
  ui.undo.disabled = !isA || d.finished || d.route.length < 2;
  ui.map.disabled = !done;
  ui.map.setAttribute("aria-pressed", String(done && state.showMap));
  ui.finishAll.hidden = isA || !c.finished;
  ui.finishAll.disabled = state.autoTimer !== 0 || c.candidates().length === 0;
  // 最後のステージの後は、「次へ」の代わりに「タイトルへ」を出す
  ui.next.textContent = isLast() ? "タイトルへ" : "次へ";
  ui.next.disabled = !done;
  ui.msg.textContent = state.msg;
  ui.sub.textContent =
    done && isLast() ? `${state.sub}。全ステージクリア!` : state.sub;
}

ui.stage.append(
  ...STAGES.map((s, i) => new Option(`Stage ${i + 1} ${s.name}`, String(i))),
);
ui.stage.addEventListener("change", () => load(Number(ui.stage.value), state.mode));
ui.modeA.addEventListener("click", () => load(state.stageIndex, "A"));
ui.modeB.addEventListener("click", () => load(state.stageIndex, "B"));
ui.undo.addEventListener("click", () => {
  state.delivery.undo();
  say(`1手戻りました。ここまで ${state.delivery.cost()}分`, `ルート: ${state.delivery.route.join(" → ")}`);
  update();
});
ui.reset.addEventListener("click", reset);
ui.map.addEventListener("click", () => {
  state.showMap = !state.showMap;
  update();
});
ui.finishAll.addEventListener("click", finishAll);
ui.next.addEventListener("click", () => {
  const f = FLOW[flowIndex() + 1];
  if (f) load(f.stageIndex, f.mode);
  else showTitle();
});
ui.toTitle.addEventListener("click", showTitle);
ui.start.addEventListener("click", () => startGame(0));
ui.choose.addEventListener("click", () => {
  ui.stageList.hidden = !ui.stageList.hidden;
  ui.choose.setAttribute("aria-expanded", String(!ui.stageList.hidden));
});
ui.stageList.append(
  ...STAGES.map((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `Stage ${i + 1} ${s.name}`;
    b.addEventListener("click", () => startGame(i));
    return b;
  }),
);

// タッチもタッチパッドも click で受ける
svg.addEventListener("click", (e) => {
  const hit = /** @type {Element} */ (e.target).closest("[data-node]");
  if (!hit || state.autoTimer !== 0) return;
  const n = /** @type {string} */ (hit.getAttribute("data-node"));
  if (state.mode === "A") tapDelivery(n);
  else tapControl(n);
  update();
});

// タイトル画面の挿絵として、Stage 1 の地図をゲームと同じ描画で置く
buildMap(ui.titleMap, STAGES[0]);
showTitle();

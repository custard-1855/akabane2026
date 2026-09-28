// 起動と、入力 → ラウンド → 描画の接続(設計書 3.5)

import { STAGES } from "./stages.js";
import { INF, solveStage, DeliveryRound, ControlRound, formatUpdates } from "./logic.js";
import { createView, heatColor, heatGradientCss } from "./view.js";
import { loadProgress, recordStars } from "./progress.js";
import { finish } from "./core-adapter.js";

const AUTO_STEP_MS = 700;
const LOG_MAX = 30;

const $ = (id) => document.getElementById(id);
const els = {
  stageSelect: $("stage-select"),
  modeA: $("mode-a"),
  modeB: $("mode-b"),
  undo: $("btn-undo"),
  reset: $("btn-reset"),
  hint: $("btn-hint"),
  heat: $("btn-heat"),
  finish: $("btn-finish"),
  map: $("map"),
  status: $("status"),
  message: $("message"),
  actions: $("actions"),
  legend: $("legend"),
  log: $("log"),
};

const state = {
  stageIndex: 0,
  /** @type {"A" | "B"} */
  mode: "A",
  stage: STAGES[0],
  /** 正解(dist・prev・path・cost)。ステージ読込時に計算 */
  opt: solveStage(STAGES[0]),
  /** @type {DeliveryRound} */
  delivery: null,
  /** @type {ControlRound} */
  control: null,
  showHeat: false,
  /** ヒントで光らせるノードと、次に押したときの段階 */
  hintNodes: [],
  hintNext: 1,
  /** 層Aでゴーストとして重ねる経路 */
  ghost: null,
  autoTimer: null,
  message: { text: "", tone: "" },
  log: [],
  /** @type {{ label: string, run: () => void }[]} */
  actions: [],
};

const view = createView(els.map, onTap);
const portraitQuery = matchMedia("(orientation: portrait)");

// --- ステージ・モード ---------------------------------------------------

function loadStage(i) {
  state.stageIndex = i;
  state.stage = STAGES[i];
  state.opt = solveStage(state.stage);
  reset();
}

function setMode(mode) {
  state.mode = mode;
  reset();
}

function reset() {
  stopAuto();
  state.delivery = new DeliveryRound(state.stage, state.opt);
  state.control = new ControlRound(state.stage, state.opt);
  state.showHeat = false;
  state.ghost = null;
  state.log = [];
  state.actions = [];
  clearHint();
  view.clearFx();
  if (state.mode === "A") {
    say(`${state.stage.desc} S(倉庫)から G(お届け先)まで、隣の交差点を順にタップして最短で届けよう。`);
  } else {
    say("札(上の数字)は S からの暫定の所要時間。札が最小の未確定地点をタップして確定しよう。確定すると隣の札が更新されます。");
  }
  render();
}

function clearHint() {
  state.hintNodes = [];
  state.hintNext = 1;
}

function say(text, tone = "") {
  state.message = { text, tone };
}

function pushLog(line) {
  state.log.unshift(line);
  state.log.length = Math.min(state.log.length, LOG_MAX);
}

// --- 入力 ---------------------------------------------------------------

function onTap(n) {
  if (state.autoTimer) return;
  if (state.mode === "A") tapDelivery(n);
  else tapControl(n);
  render();
}

function tapDelivery(n) {
  const r = state.delivery;
  const res = r.tap(n);
  clearHint();
  switch (res.kind) {
    case "added":
      say(`${n} へ。ここまでの所要 ${r.cost()}`);
      break;
    case "undone":
      say(`1手戻りました。ここまでの所要 ${r.cost()}`);
      break;
    case "stuck":
      say("行き止まりです。1手戻ってください", "warn");
      view.ripple(n, "bad");
      break;
    case "invalid":
      say(INVALID_MESSAGES[res.reason](n, r.current()), "warn");
      view.ripple(n, "bad");
      break;
    case "finished":
      onDeliveryFinished();
      break;
    case "ignored":
      say("お届け済みです。もう一度遊ぶにはリセットを押してください");
      break;
  }
}

const INVALID_MESSAGES = {
  no_edge: () => "そこへは直接行けません",
  oneway: (n, cur) => `一方通行です。${cur} から ${n} へは進めません`,
  visited: () => "一度通った交差点には戻れません",
  current: (n) => `いまは ${n} にいます。隣の交差点をタップしてください`,
};

function onDeliveryFinished() {
  const r = state.delivery;
  const stars = r.stars();
  recordStars(state.stage.id, "A", stars);
  refreshStageOptions();
  state.ghost = state.opt.path;
  const cost = r.cost();
  const opt = state.opt.cost;
  const verdict =
    cost === opt
      ? "最短です!"
      : `最短は ${opt}(点線)。${cost - opt} 遅れました。見た目の近さと所要時間は別物です。`;
  say(`お届け完了!所要 ${cost} ${starText(stars)} ${verdict} 等時線が使えるようになりました。`, "good");
  state.actions = [{ label: "管制室で確かめる", run: () => setMode("B") }];
}

function tapControl(n) {
  clearHint();
  handleSettle(state.control.settle(n));
}

/** settle() の結果をメッセージと演出にする */
function handleSettle(res, prefix = "") {
  const r = state.control;
  const n = res.node;
  switch (res.kind) {
    case "already":
      say(`${n} は確定済みです`);
      return;
    case "unreached":
      say(`${n} にはまだ届いていません(札が ∞)`);
      return;
    case "not_min": {
      const d = r.dist.get(n);
      const smaller = r.minCandidates().map((c) => `${c}:${r.dist.get(c)}`).join(", ");
      say(
        `${n} の札は ${d} ですが、札が ${d} より小さい候補が残っています(${smaller})。` +
          "小さい候補を経由すると、まだ短くなるかもしれません。" +
          (r.finished ? "" : `ミス ${r.mistakes}`),
        "bad",
      );
      view.ripple(n, "bad");
      return;
    }
    case "settled": {
      view.ripple(n, "settle");
      const line = `${n} を確定(${r.dist.get(n)})。` + (res.updates.length ? formatUpdates(res.updates) : "札の更新なし");
      pushLog(line);
      say(prefix + line);
      if (res.goalReached) onControlFinished();
      else if (r.finished && r.allDone()) onAllSettled();
      return;
    }
  }
}

function onControlFinished() {
  const r = state.control;
  const stars = r.stars();
  recordStars(state.stage.id, "B", stars);
  refreshStageOptions();
  const result = `G を確定!S から G の最短は ${r.dist.get(r.goal)}。ミス ${r.mistakes} ${starText(stars)}`;
  if (r.allDone()) {
    onAllSettled(`${result} `);
  } else {
    say(`${result} 等時線が使えるようになりました。`, "good");
    state.actions = [{ label: "続けて全地点を確定", run: startAuto }];
  }
}

function onAllSettled(prefix = "") {
  stopAuto();
  state.actions = nextStageAction();
  say(`${prefix}全地点が確定しました。1回の実行で、S から全地点への最短所要時間が求まっています。等時線で色分けを見てみよう。`, "good");
}

function nextStageAction() {
  const i = state.stageIndex + 1;
  if (i >= STAGES.length) return [];
  return [{ label: `次のステージ(${STAGES[i].name})へ`, run: () => { state.mode = "A"; loadStage(i); } }];
}

function startAuto() {
  state.actions = [];
  const step = () => {
    const r = state.control;
    if (r.allDone()) return stopAuto();
    handleSettle(r.settle(r.minCandidates()[0]));
    render();
  };
  state.autoTimer = setInterval(step, AUTO_STEP_MS);
  step();
}

function stopAuto() {
  if (state.autoTimer) clearInterval(state.autoTimer);
  state.autoTimer = null;
}

function onHint() {
  const level = state.hintNext;
  state.hintNext = Math.min(level + 1, 3);
  if (state.mode === "A") {
    const h = state.delivery.hint(level);
    if (level === 3) {
      state.ghost = h.path;
      state.hintNodes = [];
      say("点線が最短ルートです(このラウンドは★1が上限)");
    } else {
      state.hintNodes = h.nodes;
      if (h.nodes.length === 0) {
        say("ここからはお届け先に着けません。1手戻ってください", "warn");
      } else if (level === 1) {
        say("光っている交差点へ進めます");
      } else {
        say("光っている交差点へ進むのが、ここからの最短です");
      }
    }
  } else {
    const scored = !state.control.finished;
    const h = state.control.hint(level);
    state.hintNodes = level === 3 ? [] : h.nodes;
    if (level === 1) say("候補は光っている地点です(札が決まっていて、まだ確定していない地点)");
    else if (level === 2) say("候補のうち札が最小なのは光っている地点です");
    else if (h.result) handleSettle(h.result, scored ? "ヒント③(★1上限): " : "ヒント③: ");
  }
  render();
}

function onUndo() {
  if (state.delivery.undo()) say(`1手戻りました。ここまでの所要 ${state.delivery.cost()}`);
  clearHint();
  render();
}

async function onFinish() {
  if (!confirm("終わりますか?")) return;
  stopAuto();
  await finish();
}

// --- 描画 ---------------------------------------------------------------

function starText(n) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}

function roundFinished() {
  return state.mode === "A" ? state.delivery.finished : state.control.finished;
}

function buildScene() {
  const { stage, opt, mode } = state;
  const heat = state.showHeat && roundFinished();
  const maxDist = Math.max(...[...opt.dist.values()].filter((d) => d < INF), 1);
  const hint = new Set(state.hintNodes);
  const nodes = new Map();
  const halos = heat ? new Map() : null;

  for (const n of Object.keys(stage.nodes)) {
    const cls = [];
    if (n === state.delivery.start) cls.push("start");
    if (n === state.delivery.goal) cls.push("goal");
    let tag;
    if (mode === "A") {
      const route = state.delivery.route;
      if (route.includes(n)) cls.push("route");
      if (n === route.at(-1) && !state.delivery.finished) cls.push("current");
    } else {
      const r = state.control;
      const d = r.dist.get(n);
      if (r.done.has(n)) cls.push("done");
      else if (d < INF) cls.push("cand");
      else cls.push("unreached");
      tag = d === INF ? "∞" : String(d);
    }
    if (hint.has(n)) cls.push("hint");
    const st = { cls, tag };
    if (heat) {
      const d = opt.dist.get(n);
      const c = d === INF ? { fill: "#ccc", ink: "#1b1b1b" } : heatColor(d / maxDist);
      st.fill = c.fill;
      st.ink = c.ink;
      st.tag = d === INF ? "∞" : String(d);
      halos.set(n, c.fill);
    }
    nodes.set(n, st);
  }

  const routeEdges = new Set();
  if (mode === "A") {
    const route = state.delivery.route;
    for (let i = 1; i < route.length; i++) routeEdges.add(`${route[i - 1]}>${route[i]}`);
  }
  const edgeCls = (e) => {
    const cls = [];
    const fwd = `${e.u}>${e.v}`;
    const back = `${e.v}>${e.u}`;
    if (mode === "A") {
      if (routeEdges.has(fwd) || (!e.directed && routeEdges.has(back))) cls.push("route");
    } else {
      const r = state.control;
      const via = (from, to) => r.prev.get(to) === from;
      const onTree = (from, to) => via(from, to) && r.done.has(to);
      if (onTree(e.u, e.v) || (!e.directed && onTree(e.v, e.u))) cls.push("tree");
      else if (via(e.u, e.v) || (!e.directed && via(e.v, e.u))) cls.push("tent");
    }
    return cls;
  };

  return { stage, nodes, edgeCls, ghost: mode === "A" ? state.ghost : null, halos };
}

function render() {
  view.render(buildScene());

  const isA = state.mode === "A";
  els.modeA.setAttribute("aria-checked", String(isA));
  els.modeB.setAttribute("aria-checked", String(!isA));
  els.stageSelect.value = String(state.stageIndex);

  els.undo.disabled = !isA || state.delivery.finished || state.delivery.route.length < 2;
  els.undo.hidden = !isA;
  const hintDone = isA ? state.delivery.finished : state.control.allDone();
  els.hint.disabled = hintDone || Boolean(state.autoTimer);
  els.hint.textContent = ["ヒント①", "ヒント②", "答え(★1)"][state.hintNext - 1];
  els.heat.disabled = !roundFinished();
  els.heat.setAttribute("aria-pressed", String(state.showHeat && roundFinished()));

  if (isA) {
    const r = state.delivery;
    els.status.textContent = `配達 ・ ルート ${r.route.join("→")} ・ 所要 ${r.cost()}`;
  } else {
    const r = state.control;
    els.status.textContent = `管制室 ・ 確定 ${r.done.size}/${r.dist.size} ・ ミス ${r.mistakes}`;
  }
  els.message.textContent = state.message.text;
  els.message.className = state.message.tone;

  els.actions.replaceChildren(
    ...state.actions.map((a) => {
      const b = document.createElement("button");
      b.textContent = a.label;
      b.className = "primary";
      b.addEventListener("click", () => {
        a.run();
        render();
      });
      return b;
    }),
  );

  const showLegend = state.showHeat && roundFinished();
  els.legend.hidden = !showLegend;
  if (showLegend) {
    const max = Math.max(...[...state.opt.dist.values()].filter((d) => d < INF));
    els.legend.querySelector(".max").textContent = String(max);
  }

  els.log.hidden = isA || state.log.length === 0;
  els.log.replaceChildren(
    ...state.log.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }),
  );
}

function refreshStageOptions() {
  const progress = loadProgress();
  const mark = (s) => (s ? "★".repeat(s) + "☆".repeat(3 - s) : "―");
  els.stageSelect.replaceChildren(
    ...STAGES.map((s, i) => {
      const rec = progress.stages[s.id] ?? {};
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `${i + 1}. ${s.name}  配達${mark(rec.A)} 管制${mark(rec.B)}`;
      return o;
    }),
  );
  els.stageSelect.value = String(state.stageIndex);
}

// --- 起動 ---------------------------------------------------------------

els.stageSelect.addEventListener("change", () => loadStage(Number(els.stageSelect.value)));
els.modeA.addEventListener("click", () => state.mode !== "A" && setMode("A"));
els.modeB.addEventListener("click", () => state.mode !== "B" && setMode("B"));
els.undo.addEventListener("click", onUndo);
els.reset.addEventListener("click", reset);
els.hint.addEventListener("click", onHint);
els.heat.addEventListener("click", () => {
  state.showHeat = !state.showHeat;
  render();
});
els.finish.addEventListener("click", onFinish);
els.legend.querySelector(".scale").style.background = heatGradientCss();

portraitQuery.addEventListener("change", () => {
  view.setOrientation(portraitQuery.matches);
  render();
});

view.setOrientation(portraitQuery.matches);
refreshStageOptions();
loadStage(0);

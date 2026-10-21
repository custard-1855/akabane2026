// 起動と、入力 → ラウンド → 描画の接続、自動進行

import { AUTO_SETTLE_MS, RELAX_EDGE_MS } from "./config.js";
import { guideStep } from "./guide.js";
import { ControlRound, DeliveryRound, INF, buildAdj, dijkstra, treeEdges } from "./logic.js";
import { relaxLines, stepInterval } from "./relax.js";
import { revealFor } from "./reveal.js";
import { STAGES } from "./stages.js";
import { bestStars, recordStars } from "./stars.js";
import { buildMap, clearFx, clearRelax, relaxFx, render, ripple } from "./view.js";

/** @typedef {"A" | "B"} Mode A は配達、B は管制室(自動で解く様子を見る) */

/**
 * 自動進行の順。各ステージで層A(配達)→ 層B(管制室)
 * @type {{ stageIndex: number, mode: Mode }[]}
 */
const FLOW = STAGES.flatMap((_, stageIndex) => [
  { stageIndex, mode: /** @type {Mode} */ ("A") },
  { stageIndex, mode: /** @type {Mode} */ ("B") },
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
  hint: /** @type {HTMLButtonElement} */ ($("hint")),
  reset: $("reset"),
  map: /** @type {HTMLButtonElement} */ ($("map")),
  run: /** @type {HTMLButtonElement} */ ($("run")),
  skipGuide: $("skip-guide"),
  next: /** @type {HTMLButtonElement} */ ($("next")),
  reveal: $("reveal"),
  revealList: $("reveal-list"),
  revealClose: $("reveal-close"),
  revealNext: $("reveal-next"),
  msg: $("msg"),
  sub: $("sub"),
};

const state = {
  stageIndex: 0,
  /** @type {Mode} */
  mode: "A",
  /** @type {{ dist: Map<string, number>, prev: Map<string, string> } | null} */
  opt: null,
  /** @type {DeliveryRound | null} */
  delivery: null,
  /** @type {ControlRound | null} */
  control: null,
  showMap: false,
  msg: "",
  sub: "",
  /** 案内を飛ばしたか。層を始めるたび(load)に戻す */
  guideOff: false,
  /** 配達で見ているヒントの段階(0 は未使用)。①② は現在地が変わるたびに光らせ直す */
  hintLevel: /** @type {0 | 1 | 2 | 3} */ (0),
  /** 解説を出しているか、この層で一度出したか。層を始めるたび(reset)に戻す */
  revealOpen: false,
  revealSeen: false,
  /** 管制室で自動で解くタイマー。ステージやモードを変えたら止める */
  autoTimer: 0,
  /** 緩和を1本ずつ見せるタイマー。止めるときに使う */
  relaxTimers: /** @type {number[]} */ ([]),
};

const stage = () => STAGES[state.stageIndex];
const fmt = (d) => (d === INF ? "∞" : String(d));
const starText = (n) => "★".repeat(n) + "☆".repeat(3 - n);

/** 星の保存先。プライベートモードなどで localStorage に触れないときは null(保存せずに遊ぶ) */
const starStore = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const flowIndex = () =>
  FLOW.findIndex((f) => f.stageIndex === state.stageIndex && f.mode === state.mode);
const isLast = () => flowIndex() === FLOW.length - 1;

/** 今の案内。飛ばしたときと、案内しない盤面(配達以外)では null */
function guide() {
  if (state.guideOff || state.mode !== "A") return null;
  return guideStep(stage(), state.delivery);
}

function cleared() {
  return state.mode === "A" ? state.delivery.finished : state.control.finished;
}

function say(msg, sub = "") {
  state.msg = msg;
  state.sub = sub;
}

function stopAuto() {
  clearTimeout(state.autoTimer);
  state.autoTimer = 0;
  state.relaxTimers.forEach(clearTimeout);
  state.relaxTimers = [];
}

/** ステージとモードを読み込み、ラウンドを作り直す */
function load(stageIndex, mode) {
  stopAuto();
  state.stageIndex = stageIndex;
  state.mode = mode;
  state.guideOff = false;
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
  state.revealOpen = false;
  state.revealSeen = false;
  state.hintLevel = 0;
  if (state.mode === "A") {
    say(
      "倉庫 S から、お届け先 G まで、いちばん早いルートで届けよう",
      "隣の交差点をタップして進む。道の数字は所要時間(分)。同じ交差点は2度通れない",
    );
  } else {
    say(
      "管制室: 交差点の上の札は「S から、今わかっている中でいちばん早い時間」",
      "「自動で解く」を押すと、札がいちばん小さい交差点から順に確定していく",
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
      const capped = round.hintLevelUsed >= 3 ? "(最短ルートを見たので★1まで)" : "";
      recordStars(starStore, stage().id, round.stars());
      say(
        `到着! ${cost}分 ${starText(round.stars())}${capped}　最高 ${starText(bestStars(starStore, stage().id))}`,
        `${best}。「到着時間マップ」で全地点への最短時間を見られます`,
      );
      break;
    }
  }
}

/** ヒントの段階を1つ上げる(2.6)。③ は★1が上限になるので、ボタンの文言で先に知らせる */
function nextHint() {
  const level = /** @type {1 | 2 | 3} */ (Math.min(3, state.hintLevel + 1));
  state.hintLevel = level;
  state.delivery.hint(level);
  if (level === 1) say("ヒント①: 今いる所から進める交差点を光らせました");
  else if (level === 2) say("ヒント②: ここからお届け先へいちばん早く行くなら、次は光っている交差点");
  else say("ヒント③: 点線が最短ルート。このラウンドは★1までになります");
  update();
}

/** 1回の確定で書き換えた札をまとめて1行にする */
function summarize(relaxations) {
  const updated = relaxations.filter((x) => x.updated);
  if (updated.length === 0) return "札の書き換えなし";
  return `札の書き換え: ${updated.map((x) => `${x.node}: ${fmt(x.from)}→${x.cand}`).join(", ")}`;
}

/**
 * 管制室: 札が最小の候補を確定するのを、全地点を確定し終えるまで自動で繰り返す。
 * 確定した交差点から出る道は1本ずつ見せ、見せ終えるまで次の確定を待つ
 */
function runControl() {
  const round = state.control;
  const tick = () => {
    clearRelax(svg);
    const r = round.step();
    if (r === null) {
      stopAuto();
      say(
        `全地点を確定しました。お届け先 ${round.goal} までの最短は ${round.dist.get(round.goal)}分`,
        "1回の実行で、S からすべての交差点への最短時間が求まりました。「到着時間マップ」で、最短ルートを重ねた木と一緒に見られます",
      );
      update();
      return;
    }
    const n = r.node;
    ripple(svg, stage(), n);
    const lines = relaxLines(r, round.dist.get(n));
    state.relaxTimers = lines.map((line, i) =>
      setTimeout(() => relaxFx(svg, stage(), line), i * RELAX_EDGE_MS),
    );
    const goal = n === round.goal ? "。お届け先までの最短が決まった。残りの交差点も続けて確定する" : "";
    say(`札がいちばん小さい ${n}(${round.dist.get(n)}分)を確定${goal}`, summarize(r.relaxations));
    update();
    state.autoTimer = setTimeout(tick, stepInterval(lines.length));
  };
  state.autoTimer = setTimeout(tick, AUTO_SETTLE_MS);
  update();
}

/** 自動進行の次の層へ。解説のある層では、まだ出していなければ先に出す(2.2「各層の後には解説を挟む」) */
function goNext() {
  if (!state.revealSeen && revealFor(stage(), state.mode)) {
    state.revealOpen = true;
    state.revealSeen = true;
    update();
    return;
  }
  const f = FLOW[flowIndex() + 1];
  if (f) load(f.stageIndex, f.mode);
  else showTitle();
}

/** ステージを選ぶボタンに、配達の最高記録を添える */
function showStageStars() {
  stageButtons.forEach((b, i) => {
    const s = STAGES[i];
    const best = bestStars(starStore, s.id);
    b.textContent = `Stage ${i + 1} ${s.name}${best ? ` ${starText(best)}` : ""}`;
  });
}

/** 次の来場者に端末を渡せるよう、タイトル画面に戻す */
function showTitle() {
  stopAuto();
  clearFx(svg);
  ui.gameScreen.hidden = true;
  ui.titleScreen.hidden = false;
  ui.stageList.hidden = true;
  showStageStars();
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
  const g = guide();
  // ヒント①② は現在地からの一手なので、毎回求め直す。③ は最短ルートを点線で出す
  const hint = isA && !d.finished && state.hintLevel > 0 ? d.hint(state.hintLevel) : null;

  render(svg, s, {
    mode: state.mode,
    route: d.route,
    settled: c.done,
    frontier: new Set(c.candidates()),
    labels: isA ? null : c.dist,
    ghost: isA && d.finished ? d.ghost().path : (hint?.path ?? null),
    glow: g?.nodes ?? hint?.glow ?? [],
    map: done && state.showMap ? state.opt.dist : null,
    tree: !isA && done && state.showMap ? treeEdges(c.prev) : null,
  });

  ui.stage.value = String(state.stageIndex);
  ui.modeA.classList.toggle("active", isA);
  ui.modeB.classList.toggle("active", state.mode === "B");
  ui.undo.disabled = !isA || d.finished || d.route.length < 2;
  // 案内中は案内が交差点を光らせるので、ヒントを出さない
  ui.hint.hidden = !isA || g !== null;
  ui.hint.disabled = d.finished || state.hintLevel === 3;
  ui.hint.textContent = ["ヒント", "ヒント②", "最短ルートを見る(★1まで)", "ヒント"][state.hintLevel];
  ui.map.disabled = !done;
  ui.map.setAttribute("aria-pressed", String(done && state.showMap));
  ui.run.hidden = state.mode !== "B";
  ui.run.disabled = state.autoTimer !== 0 || c.finished;
  // 最後のステージの後は、「次へ」の代わりに「タイトルへ」を出す
  ui.next.textContent = isLast() ? "タイトルへ" : "次へ";
  ui.next.disabled = !done;
  ui.skipGuide.hidden = g === null;
  const reveal = state.revealOpen ? revealFor(s, state.mode) : null;
  ui.reveal.hidden = reveal === null;
  ui.revealList.replaceChildren(
    ...(reveal ?? []).flatMap((x) => {
      const dt = document.createElement("dt");
      dt.textContent = x.game;
      const dd = document.createElement("dd");
      const term = document.createElement("span");
      term.className = "term";
      term.textContent = `→ ${x.term}`;
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = x.note;
      dd.append(term, note);
      return [dt, dd];
    }),
  );
  ui.revealNext.textContent = ui.next.textContent;
  // 案内中は字幕を主に出し、ふだんの1行目(「ここまで 3分」など)を2行目に回す
  ui.msg.textContent = g ? g.caption : state.msg;
  ui.sub.textContent = g
    ? state.msg
    : done && isLast()
      ? `${state.sub}。全ステージクリア!`
      : state.sub;
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
ui.hint.addEventListener("click", nextHint);
ui.reset.addEventListener("click", reset);
ui.map.addEventListener("click", () => {
  state.showMap = !state.showMap;
  update();
});
ui.run.addEventListener("click", runControl);
ui.skipGuide.addEventListener("click", () => {
  state.guideOff = true;
  update();
});
ui.next.addEventListener("click", goNext);
ui.revealNext.addEventListener("click", goNext);
ui.revealClose.addEventListener("click", () => {
  state.revealOpen = false;
  update();
});
ui.toTitle.addEventListener("click", showTitle);
ui.start.addEventListener("click", () => startGame(0));
ui.choose.addEventListener("click", () => {
  ui.stageList.hidden = !ui.stageList.hidden;
  ui.choose.setAttribute("aria-expanded", String(!ui.stageList.hidden));
});
const stageButtons = STAGES.map((s, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.addEventListener("click", () => startGame(i));
  return b;
});
ui.stageList.append(...stageButtons);
showStageStars();

// タッチもタッチパッドも click で受ける
svg.addEventListener("click", (e) => {
  // 管制室は自動で進むので、タップを受けない
  if (state.mode === "B") return;
  const hit = /** @type {Element} */ (e.target).closest("[data-node]");
  if (!hit) return;
  const n = /** @type {string} */ (hit.getAttribute("data-node"));
  // 案内中は、光っていない交差点のタップをラウンドに渡さずに捨てる
  const g = guide();
  if (g && g.nodes.length > 0 && !g.nodes.includes(n)) {
    ui.msg.classList.remove("again");
    void ui.msg.offsetWidth; // アニメーションを最初から流し直す
    ui.msg.classList.add("again");
    return;
  }
  // 光らせない説明だけの字幕は、次のタップで終える。行き止まりなどのメッセージを字幕で隠さないため
  if (g && g.nodes.length === 0) state.guideOff = true;
  tapDelivery(n);
  update();
});

// タイトル画面の挿絵として、Stage 1 の地図をゲームと同じ描画で置く
buildMap(ui.titleMap, STAGES[0]);
showTitle();

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRound,
  flowAfter,
  fordFulkersonSteps,
  hasForwardRoute,
  maxFlow,
  minCut,
  residual,
  routeAmount,
  sentTotal,
  starsFor,
  tap,
  totalSent,
  undo,
} from "../static/logic.js";

const line = (u, v, cap) => ({ u, v, cap });

/**
 * 付け替えが要るいちばん小さい形。S→A→B→T が短く見えるが、先に送ると S→B→T と S→A→T が行き詰まる。
 * 最大は 2(S→A→T と S→B→T)
 */
const DIAMOND = {
  id: "diamond",
  name: "ひし形",
  nodes: { S: [0, 1], A: [1, 0], B: [1, 2], T: [2, 1] },
  edges: [line("S", "A", 1), line("S", "B", 1), line("A", "B", 1), line("A", "T", 1), line("B", "T", 1)],
  start: "S",
  goal: "T",
  star2: 2,
};

/** @param {string[][]} routes 層Aで、ルートを順にタップする */
function play(stage, routes) {
  let r = createRound(stage);
  for (const route of routes) for (const n of route.slice(1)) r = tap(stage, r, n).round;
  return r;
}

test("残り: 帯域から送る量を引いた量", () => {
  assert.equal(residual(line("S", "A", 5), { "S-A": 3 }), 2);
  assert.equal(residual(line("S", "A", 5), {}), 5);
});

test("送れる量: 途中の回線の残りのうち、いちばん少ない量", () => {
  assert.equal(routeAmount(DIAMOND, {}, ["S", "A", "T"]), 1);
  assert.equal(routeAmount(DIAMOND, { "A-T": 1 }, ["S", "A", "T"]), 0);
});

test("送れる量: 向きに逆らう区間があれば 0", () => {
  assert.equal(routeAmount(DIAMOND, {}, ["S", "B", "A", "T"]), 0);
});

test("ルートが残っているか: 残りのある回線を順方向にたどれれば true", () => {
  assert.equal(hasForwardRoute(DIAMOND, {}), true);
  assert.equal(hasForwardRoute(DIAMOND, { "S-A": 1, "A-B": 1, "B-T": 1 }), false);
});

test("フォード–ファルカーソン法: 短いルートで送った後、付け替えで量を増やす", () => {
  // 幅優先なので、A→B を通るルートより短い S→A→T と S→B→T が先に選ばれる
  const steps = fordFulkersonSteps(DIAMOND);
  assert.equal(steps.reduce((s, x) => s + x.amount, 0), 2);
  assert.ok(steps.every((s) => s.hops.every((h) => h.forward)));
});

test("フォード–ファルカーソン法: 先に送った分が邪魔なら、逆向きに取り消して別のルートに回す", () => {
  // S→A→B→T がいちばん短く、ほかは S→X→Y→B と A→Z→W→T の回り道しかない形
  const stage = {
    ...DIAMOND,
    nodes: { S: [0, 1], A: [1, 0], B: [1, 2], T: [2, 1], X: [0, 3], Y: [1, 3], Z: [2, -1], W: [3, 0] },
    edges: [
      line("S", "A", 1),
      line("A", "B", 1),
      line("B", "T", 1),
      line("S", "X", 1),
      line("X", "Y", 1),
      line("Y", "B", 1),
      line("A", "Z", 1),
      line("Z", "W", 1),
      line("W", "T", 1),
    ],
  };
  const steps = fordFulkersonSteps(stage);
  assert.deepEqual(steps[0].route, ["S", "A", "B", "T"]);
  const second = steps[1];
  assert.ok(second.hops.some((h) => h.key === "A-B" && !h.forward), "A→B を逆向きに取り消していない");
  assert.deepEqual(second.route, ["S", "X", "Y", "B", "A", "Z", "W", "T"]);
  assert.equal(totalSent(stage, flowAfter(steps)), 2);
});

test("いちばん細い切れ目: 帯域の合計が送れる量の最大と等しい", () => {
  const cut = minCut(DIAMOND);
  assert.equal(cut.total, maxFlow(DIAMOND));
  assert.ok(cut.side.has("S"));
  assert.ok(!cut.side.has("T"));
});

test("星: 最大なら★3、star2 以上なら★2、それより少なければ★1", () => {
  const stage = { ...DIAMOND, star2: 1 };
  assert.equal(starsFor(2, stage), 3);
  assert.equal(starsFor(1, stage), 2);
  assert.equal(starsFor(0, stage), 1);
});

test("層A: 利用者に着くと、そのルートで送れるだけ送り、データセンターから作り直す", () => {
  const r = play(DIAMOND, [["S", "A", "T"]]);
  assert.deepEqual(r.flow, { "S-A": 1, "A-T": 1 });
  assert.equal(sentTotal(r), 1);
  assert.deepEqual(r.route, ["S"]);
});

test("層A: 向きに逆らう回線、残りのない回線、通った地点には進めない", () => {
  let r = play(DIAMOND, [["S", "B"]]);
  assert.equal(tap(DIAMOND, r, "A").result, "not_next"); // B→A は向きに逆らう
  r = play(DIAMOND, [["S", "A", "T"]]);
  assert.equal(tap(DIAMOND, r, "A").result, "blocked"); // S→A は埋まっている
  r = play(DIAMOND, [["S", "A"]]);
  assert.equal(tap(DIAMOND, r, "S").result, "not_next");
});

test("層A: 順方向のルートがなくなったら完成", () => {
  assert.equal(play(DIAMOND, [["S", "A", "B", "T"]]).done, true);
  assert.equal(play(DIAMOND, [["S", "A", "T"]]).done, false);
  assert.equal(play(DIAMOND, [["S", "A", "T"], ["S", "B", "T"]]).done, true);
});

test("1手戻る: 作りかけのルートなら、最後にタップした地点を外す", () => {
  const r = undo(DIAMOND, play(DIAMOND, [["S", "A"]]));
  assert.deepEqual(r.route, ["S"]);
});

test("1手戻る: ルートを作り始める前なら、最後に送ったルートを取り消す", () => {
  const r = undo(DIAMOND, play(DIAMOND, [["S", "A", "T"], ["S", "B", "T"]]));
  assert.deepEqual(r.flow, { "S-A": 1, "A-T": 1, "S-B": 0, "B-T": 0 });
  assert.equal(sentTotal(r), 1);
  assert.equal(r.done, false);
});

test("1手戻る: 完成の後も、最後に送ったルートを取り消して完成を外す", () => {
  const r = undo(DIAMOND, play(DIAMOND, [["S", "A", "B", "T"]]));
  assert.equal(r.done, false);
  assert.equal(sentTotal(r), 0);
  assert.equal(hasForwardRoute(DIAMOND, r.flow), true);
});

test("1手戻る: 何もしていなければ何もしない", () => {
  assert.deepEqual(undo(DIAMOND, createRound(DIAMOND)), createRound(DIAMOND));
});

test("リセット: 何も送っていない最初の状態", () => {
  const r = createRound(DIAMOND);
  assert.deepEqual(r, { flow: {}, sent: [], route: ["S"], done: false });
});

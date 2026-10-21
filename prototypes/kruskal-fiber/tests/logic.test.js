import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captionFor,
  complete,
  cyclePath,
  createRound,
  cycleRoads,
  isConnected,
  kruskalSteps,
  laidRoads,
  minimumRoads,
  roadKey,
  starsFor,
  toggle,
  totalCost,
  undo,
} from "../static/logic.js";

const road = (u, v, w) => ({ u, v, w });

/** 4つの局舎の小さい街。A-B-C は輪を作れる */
const SMALL = {
  id: "small",
  name: "小さい街",
  nodes: { A: [0, 0], B: [1, 0], C: [1, 1], D: [2, 1] },
  edges: [road("A", "B", 1), road("B", "C", 2), road("A", "C", 3), road("C", "D", 4)],
  star2: 8,
};

test("つながり: 敷いた道で全部の局舎がつながっていれば true", () => {
  assert.equal(isConnected(["A", "B", "C"], [road("A", "B", 1), road("B", "C", 1)]), true);
});

test("つながり: 1つでも取り残された局舎があれば false", () => {
  assert.equal(isConnected(["A", "B", "C", "D"], [road("A", "B", 1), road("B", "C", 1)]), false);
});

test("輪: 輪の一部の道だけを返す。輪の外の道は含めない", () => {
  const roads = [road("A", "B", 1), road("B", "C", 2), road("A", "C", 3), road("C", "D", 4)];
  assert.deepEqual([...cycleRoads(roads)].sort(), ["A-B", "A-C", "B-C"]);
});

test("輪: 輪がなければ空", () => {
  assert.equal(cycleRoads([road("A", "B", 1), road("B", "C", 2)]).size, 0);
});

test("クラスカル法: 安い順に見て、輪になる道は飛ばす", () => {
  const steps = kruskalSteps(SMALL).map((s) => `${roadKey(s.road)}:${s.action}`);
  assert.deepEqual(steps, ["A-B:lay", "B-C:lay", "A-C:skip", "C-D:lay"]);
});

test("クラスカル法: 同じ工事費の道は edges の記述順に見る", () => {
  const stage = { ...SMALL, edges: [road("A", "C", 1), road("A", "B", 1), road("B", "C", 1), road("C", "D", 1)] };
  assert.deepEqual(kruskalSteps(stage).map((s) => roadKey(s.road)), ["A-C", "A-B", "B-C", "C-D"]);
});

test("最小の敷き方: クラスカル法で敷いた道で、工事費の合計が最小", () => {
  assert.equal(totalCost(minimumRoads(SMALL)), 7);
});

test("星: 最小なら★3、star2 以下なら★2、それより高ければ★1", () => {
  assert.equal(starsFor(7, SMALL), 3);
  assert.equal(starsFor(8, SMALL), 2);
  assert.equal(starsFor(9, SMALL), 1);
});

test("層A: タップで道を敷き、もう一度タップすると外す", () => {
  let r = toggle(createRound(), "A-B");
  assert.deepEqual(r.laid, ["A-B"]);
  r = toggle(r, "A-B");
  assert.deepEqual(r.laid, []);
});

test("層A: 全部つながるまで完成にならない", () => {
  let r = toggle(toggle(createRound(), "A-B"), "B-C");
  assert.equal(complete(SMALL, r).done, false);
  r = toggle(r, "C-D");
  assert.equal(complete(SMALL, r).done, true);
});

test("層A: 輪があっても、全部つながれば完成にできる", () => {
  let r = createRound();
  for (const k of ["A-B", "B-C", "A-C", "C-D"]) r = toggle(r, k);
  assert.equal(complete(SMALL, r).done, true);
});

test("層A: 完成の後は道のタップを受け付けない", () => {
  let r = createRound();
  for (const k of ["A-B", "B-C", "C-D"]) r = toggle(r, k);
  r = complete(SMALL, r);
  assert.deepEqual(toggle(r, "A-C").laid, r.laid);
});

test("1手戻る: 最後に敷いた道を外す", () => {
  const r = undo(toggle(toggle(createRound(), "A-B"), "B-C"));
  assert.deepEqual(r.laid, ["A-B"]);
});

test("1手戻る: 最後に外した道を敷き直す", () => {
  const r = undo(toggle(toggle(createRound(), "A-B"), "A-B"));
  assert.deepEqual(r.laid, ["A-B"]);
});

test("1手戻る: 完成の後なら、完成を取り消して最後の手を戻す", () => {
  let r = createRound();
  for (const k of ["A-B", "B-C", "C-D"]) r = toggle(r, k);
  r = undo(complete(SMALL, r));
  assert.equal(r.done, false);
  assert.deepEqual(r.laid, ["A-B", "B-C"]);
});

test("1手戻る: 何も手がなければ何もしない", () => {
  assert.deepEqual(undo(createRound()), createRound());
});

test("1手戻る: 輪を作った道を戻すと、輪がなくなる", () => {
  let r = createRound();
  for (const k of ["A-B", "B-C", "A-C"]) r = toggle(r, k);
  assert.equal(cycleRoads(laidRoads(SMALL, r)).size, 3);
  assert.equal(cycleRoads(laidRoads(SMALL, undo(r))).size, 0);
});

test("リセット: 何も敷いていない最初の状態に戻る", () => {
  let r = createRound();
  for (const k of ["A-B", "B-C", "C-D"]) r = toggle(r, k);
  r = complete(SMALL, r);
  assert.deepEqual(createRound(), { laid: [], history: [], done: false });
  assert.equal(totalCost(laidRoads(SMALL, createRound())), 0);
});

test("輪の道筋: 敷いた道で u から v へ行く道筋の道を返す", () => {
  const laid = [road("A", "B", 1), road("B", "C", 2), road("C", "D", 4)];
  assert.deepEqual(cyclePath(laid, "A", "C").sort(), ["A-B", "B-C"]);
});

test("輪の道筋: つながっていなければ空", () => {
  assert.deepEqual(cyclePath([road("A", "B", 1)], "A", "D"), []);
});

test("字幕: 敷く手は「いちばん安い道 X(n万円)を敷く」", () => {
  assert.equal(captionFor({ road: road("A", "B", 3), action: "lay" }), "いちばん安い道 A–B(3万円)を敷く");
});

test("字幕: 飛ばす手は「X を敷くと輪になるので飛ばす」", () => {
  assert.equal(captionFor({ road: road("B", "E", 5), action: "skip" }), "B–E(5万円)を敷くと輪になるので飛ばす");
});

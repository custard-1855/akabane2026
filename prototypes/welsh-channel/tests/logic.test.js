import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canComplete,
  captionFor,
  channelCount,
  conflicts,
  greedySteps,
  minColoring,
  starsFor,
  tap,
  usedChannels,
  welshPowellOrder,
} from "../static/logic.js";

const pair = (u, v) => ({ u, v });

/** 5つの基地局。A-B-C は三角形で、最小は3チャンネル。D と E は端にぶら下がる */
const SMALL = {
  id: "small",
  name: "小さい街",
  nodes: { A: [0, 0], B: [1, 0], C: [0, 1], D: [2, 0], E: [2, 1] },
  edges: [pair("A", "B"), pair("B", "C"), pair("A", "C"), pair("B", "D"), pair("D", "E")],
  naturalOrder: ["A", "B", "C", "D", "E"],
  star2: 4,
};

/** 4つの基地局が1列に並ぶ道 A1-B2-A2-B1。塗る順番で使う数が変わる最小の例 */
const PATH = {
  id: "path",
  name: "1列",
  nodes: { A1: [0, 0], B2: [1, 0], A2: [2, 0], B1: [3, 0] },
  edges: [pair("A1", "B2"), pair("B2", "A2"), pair("A2", "B1")],
  naturalOrder: ["A1", "B2", "A2", "B1"],
  star2: 3,
};

test("混信: 隣どうしが同じチャンネルの組だけを返す", () => {
  assert.deepEqual([...conflicts(SMALL, { A: 1, B: 1, C: 2, D: 2, E: 2 })].sort(), ["A-B", "D-E"]);
});

test("混信: まだチャンネルのない基地局は混信に数えない", () => {
  assert.equal(conflicts(SMALL, { A: 1 }).size, 0);
});

test("貪欲法: 順番どおりに、隣が使っていない中でいちばん小さい番号を付ける", () => {
  const steps = greedySteps(SMALL, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(steps, [
    { node: "A", channel: 1 },
    { node: "B", channel: 2 },
    { node: "C", channel: 3 },
    { node: "D", channel: 1 },
    { node: "E", channel: 2 },
  ]);
  assert.equal(channelCount(steps), 3);
});

test("貪欲法: 塗る順番だけで、使うチャンネルの数が変わる", () => {
  // 両端(A1 と B1)を先に塗ると、真ん中の2つが別々の番号を避けて3つ目を使う
  assert.equal(channelCount(greedySteps(PATH, ["A1", "B1", "A2", "B2"])), 3);
  assert.equal(channelCount(greedySteps(PATH, ["A1", "B2", "A2", "B1"])), 2);
});

test("並べ方: 隣どうしの多い順。同じ数なら nodes の記述順", () => {
  assert.deepEqual(welshPowellOrder(SMALL), ["B", "A", "C", "D", "E"]);
});

test("総当たり: 最小のチャンネル数と、混信のない割り当てを返す", () => {
  const { count, assign } = minColoring(SMALL);
  assert.equal(count, 3);
  assert.equal(conflicts(SMALL, assign).size, 0);
  assert.equal(usedChannels(assign), 3);
});

test("星: 最小なら★3、star2 以下なら★2、それより多ければ★1", () => {
  assert.equal(starsFor(3, SMALL), 3);
  assert.equal(starsFor(4, SMALL), 2);
  assert.equal(starsFor(5, SMALL), 1);
});

test("層A: タップするとチャンネルが 1 → 2 → … → 上限 → 1 と巡る", () => {
  let a = {};
  const seen = [];
  for (let i = 0; i < 4; i++) {
    a = tap(a, "A", 3);
    seen.push(a.A);
  }
  assert.deepEqual(seen, [1, 2, 3, 1]);
});

test("層A: 全部にチャンネルがあり、混信がなければ完成にできる", () => {
  assert.equal(canComplete(SMALL, { A: 1, B: 2, C: 3, D: 1 }), false);
  assert.equal(canComplete(SMALL, { A: 1, B: 2, C: 3, D: 1, E: 1 }), false);
  assert.equal(canComplete(SMALL, { A: 1, B: 2, C: 3, D: 1, E: 2 }), true);
});

test("字幕: 今までの番号で足りるときは「いちばん小さい番号」", () => {
  const steps = greedySteps(SMALL, ["A", "B", "C", "D", "E"]);
  assert.equal(captionFor(steps, 3), "D: 隣が使っていない中でいちばん小さい 1 にする");
});

test("字幕: 新しい番号を使うときは、隣が使っている番号を添える", () => {
  const steps = greedySteps(SMALL, ["A", "B", "C", "D", "E"]);
  assert.equal(captionFor(steps, 0), "A: 隣が使っていない中でいちばん小さい 1 にする");
  assert.equal(captionFor(steps, 2), "C: 隣が 1・2 を使っているので、新しいチャンネル 3 を使う");
});

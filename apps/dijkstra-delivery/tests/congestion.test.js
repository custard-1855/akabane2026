import { test } from "node:test";
import assert from "node:assert/strict";
import { Traffic } from "../static/congestion.js";
import { STAGES } from "../static/stages.js";

/** S から G へ、速い道(S-A-G、2+2)と少し遅い道(S-B-G、3+3.5)がある。混んでも同点にならない */
const twoRoads = {
  id: "two-roads",
  name: "",
  desc: "",
  nodes: { S: [0, 0], A: [1, -1], B: [1, 1], G: [2, 0] },
  edges: [
    { u: "S", v: "A", w: 2 },
    { u: "A", v: "G", w: 2 },
    { u: "S", v: "B", w: 3 },
    { u: "B", v: "G", w: 3.5 },
  ],
};

/** 1台ごとに所要時間が 50% 延び、もとの所要時間 1分を 60ms で走る */
const opts = { slowdown: 0.5, msPerMinute: 60 };

test("輻輳: 道が空いていれば、配達車は最短ルートを通る", () => {
  const traffic = new Traffic(STAGES.find((s) => s.id === "downtown"));
  assert.deepEqual(traffic.dispatch("S", "G").route, ["S", "A", "D", "H", "G"]);
});

test("輻輳: 配達車がいる道は、1台ごとに所要時間が延びる。向きによらない", () => {
  const traffic = new Traffic(twoRoads, opts);
  assert.equal(traffic.travelTime("S", "A"), 2);
  traffic.dispatch("S", "G");
  assert.equal(traffic.travelTime("S", "A"), 3);
  assert.equal(traffic.travelTime("A", "S"), 3);
  traffic.dispatch("S", "G");
  assert.equal(traffic.travelTime("S", "A"), 4);
  assert.equal(traffic.travelTime("S", "B"), 3);
});

test("輻輳: 速い道が混んだ後に出た配達車は、そのときの所要時間で計算し直して迂回する", () => {
  const traffic = new Traffic(twoRoads, opts);
  const routes = [1, 2, 3, 4].map(() => traffic.dispatch("S", "G").route.join(""));
  // S-A は 2、3、4、5分と延びる。4台目で 5+2=7 が S-B-G の 6.5 を超える
  assert.deepEqual(routes, ["SAG", "SAG", "SAG", "SBG"]);
});

test("輻輳: 配達車が道を抜けると、その道の所要時間は戻り、次の道が延びる", () => {
  const traffic = new Traffic(twoRoads, opts);
  traffic.dispatch("S", "G");
  // S-A に入ったときは空いていて 2分 = 120ms で抜ける
  traffic.advance(119);
  assert.equal(traffic.travelTime("S", "A"), 3);
  assert.equal(traffic.travelTime("A", "G"), 2);
  traffic.advance(1);
  assert.equal(traffic.travelTime("S", "A"), 2);
  assert.equal(traffic.travelTime("A", "G"), 3);
});

test("輻輳: お届け先に着いた配達車は消え、まとめて時間を進めても道はすべて元に戻る", () => {
  const traffic = new Traffic(twoRoads, opts);
  traffic.dispatch("S", "G");
  traffic.dispatch("S", "G");
  traffic.advance(10_000);
  assert.equal(traffic.cars.length, 0);
  for (const [u, v, w] of [["S", "A", 2], ["A", "G", 2], ["S", "B", 3], ["B", "G", 3.5]]) {
    assert.equal(traffic.travelTime(u, v), w, `${u}-${v}`);
  }
});

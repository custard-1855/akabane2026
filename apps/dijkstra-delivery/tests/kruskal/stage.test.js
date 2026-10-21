// 試作のステージの条件(docs/games.md 4.6)
import { test } from "node:test";
import assert from "node:assert/strict";
import { kruskalSteps, minimumRoads, roadKey, starsFor, totalCost } from "../../static/kruskal/logic.js";
import { STAGE } from "../../static/kruskal/stages.js";

test("ステージ: 局舎は8〜10個、道は14〜16本", () => {
  const n = Object.keys(STAGE.nodes).length;
  assert.ok(n >= 8 && n <= 10, `局舎 ${n}個`);
  assert.ok(STAGE.edges.length >= 14 && STAGE.edges.length <= 16, `道 ${STAGE.edges.length}本`);
});

test("ステージ: 工事費はすべて違う値", () => {
  const ws = STAGE.edges.map((r) => r.w);
  assert.equal(new Set(ws).size, ws.length);
});

test("ステージ: クラスカル法で「輪になるので飛ばす」が、最後の道を敷く前に1回以上起きる", () => {
  const steps = kruskalSteps(STAGE);
  const lastLay = steps.findLastIndex((s) => s.action === "lay");
  assert.ok(steps.slice(0, lastLay).some((s) => s.action === "skip"));
});

test("ステージ: 幹線は最小の敷き方に含まれず、幹線を含む最良の敷き方は★2以下", () => {
  assert.ok(!minimumRoads(STAGE).some((r) => roadKey(r) === STAGE.trunk));
  // 幹線を先に敷いてからクラスカル法を進めると、幹線を含む最良の敷き方になる
  const trunkFirst = { ...STAGE, edges: STAGE.edges.map((r) => (roadKey(r) === STAGE.trunk ? { ...r, w: -Infinity } : r)) };
  const best = minimumRoads(trunkFirst).map((r) => STAGE.edges.find((e) => roadKey(e) === roadKey(r)));
  assert.ok(starsFor(totalCost(best), STAGE) <= 2);
});

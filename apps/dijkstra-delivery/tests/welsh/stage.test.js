// 試作のステージの条件(docs/games.md 5.6)
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelCount, greedySteps, minColoring, welshPowellOrder } from "../../static/welsh/logic.js";
import { STAGE } from "../../static/welsh/stages.js";

test("ステージ: 基地局は8〜10個", () => {
  const n = Object.keys(STAGE.nodes).length;
  assert.ok(n >= 8 && n <= 10, `基地局 ${n}個`);
});

test("ステージ: 最小のチャンネル数は3", () => {
  assert.equal(minColoring(STAGE).count, 3);
});

test("ステージ: 自然に見える順番(左から右)の貪欲法は4つ以上使う", () => {
  const xs = STAGE.naturalOrder.map((n) => STAGE.nodes[n][0]);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b), "左から右の順になっていない");
  assert.ok(channelCount(greedySteps(STAGE, STAGE.naturalOrder)) >= 4);
});

test("ステージ: 隣どうしの多い順の貪欲法は3つで済む", () => {
  assert.equal(channelCount(greedySteps(STAGE, welshPowellOrder(STAGE))), 3);
});

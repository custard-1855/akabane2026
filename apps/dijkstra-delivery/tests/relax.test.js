import { test } from "node:test";
import assert from "node:assert/strict";
import { ControlRound } from "../static/logic.js";
import { relaxLines, stepInterval } from "../static/relax.js";
import { STAGES } from "../static/stages.js";

const stage = (id) => STAGES.find((s) => s.id === id);

test("緩和の1本ずつ: Stage 1 で D(6)を確定すると、C はそのまま、F と H は書き換える(設計書 2.3 の例)", () => {
  const round = new ControlRound(stage("downtown"));
  for (let i = 0; i < 3; i++) round.step(); // S、B、A
  const r = round.step();
  assert.equal(r.node, "D");
  assert.deepEqual(relaxLines(r, round.dist.get("D")), [
    { via: "D", node: "C", updated: false, text: "C: 6+3=9、今の札は 9 → そのまま" },
    { via: "D", node: "F", updated: true, text: "F: 6+7=13、今の札は ∞ → 13 に書き換え" },
    { via: "D", node: "H", updated: true, text: "H: 6+3=9、今の札は ∞ → 9 に書き換え" },
  ]);
});

test("緩和の1本ずつ: 1手の間隔は、1本0.6秒で 1.8秒に収まればそのまま、収まらなければ延ばす", () => {
  assert.equal(stepInterval(0), 1800);
  assert.equal(stepInterval(3), 1800);
  assert.equal(stepInterval(4), 2400);
});

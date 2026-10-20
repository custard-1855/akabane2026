import { test } from "node:test";
import assert from "node:assert/strict";
import { guideStep } from "../static/guide.js";
import { DeliveryRound } from "../static/logic.js";
import { STAGES } from "../static/stages.js";

const stage = (id) => STAGES.find((s) => s.id === id);

test("配達の案内: 最初は S の隣を全部光らせる", () => {
  const s = stage("downtown");
  const step = guideStep(s, new DeliveryRound(s));
  assert.deepEqual(step, {
    nodes: ["A", "B"],
    caption: "S の隣の交差点をタップして進もう。道の数字は所要時間",
  });
});

test("配達の案内: 1手進んだら戻り方の字幕を出し(光らせない)、2手進んだら案内を終える", () => {
  const s = stage("downtown");
  const round = new DeliveryRound(s);
  round.tap("B");
  assert.deepEqual(guideStep(s, round), {
    nodes: [],
    caption: "通った道の時間が足されていく。戻りたいときは、1つ前の交差点か「1手戻る」",
  });
  round.tap("D");
  assert.equal(guideStep(s, round), null);
});

test("Stage 2 では案内しない", () => {
  const s = stage("residential");
  assert.equal(guideStep(s, new DeliveryRound(s)), null);
});

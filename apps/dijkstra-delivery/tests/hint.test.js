import { test } from "node:test";
import assert from "node:assert/strict";
import { DeliveryRound } from "../static/logic.js";
import { STAGES } from "../static/stages.js";

const stage = (id) => STAGES.find((s) => s.id === id);

/** S から順にタップする */
const tapAll = (round, nodes) => nodes.forEach((n) => round.tap(n));

test("ヒント①: 現在地から進める交差点を光らせる(通った交差点は除く)", () => {
  const round = new DeliveryRound(stage("downtown"));
  assert.deepEqual(round.hint(1), { glow: ["A", "B"], path: null });
  round.tap("A");
  assert.deepEqual(round.hint(1), { glow: ["C", "D"], path: null });
});

test("ヒント②: 現在地から G への最短で次に進む交差点を光らせる", () => {
  const round = new DeliveryRound(stage("residential"));
  assert.deepEqual(round.hint(2), { glow: ["A"], path: null });
});

test("ヒント②: 目先の罠で遠回りした後も、現在地からの次善の一手を示す(S-B の後は E)", () => {
  const round = new DeliveryRound(stage("residential"));
  round.tap("B");
  assert.deepEqual(round.hint(2), { glow: ["E"], path: null });
});

test("ヒント③: 最短ルートを示す", () => {
  const round = new DeliveryRound(stage("downtown"));
  assert.deepEqual(round.hint(3), { glow: [], path: ["S", "A", "D", "H", "G"] });
});

test("ヒント①②は減点しない。最短で着けば★3", () => {
  const round = new DeliveryRound(stage("downtown"));
  round.hint(1);
  round.hint(2);
  tapAll(round, ["A", "D", "H", "G"]);
  assert.equal(round.stars(), 3);
});

test("ヒント③を使ったら、最短で着いても★1が上限", () => {
  const round = new DeliveryRound(stage("downtown"));
  round.hint(3);
  tapAll(round, ["A", "D", "H", "G"]);
  assert.equal(round.stars(), 1);
});

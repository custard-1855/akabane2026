import { test } from "node:test";
import assert from "node:assert/strict";
import { DeliveryRound } from "../static/logic.js";
import { STAGES } from "../static/stages.js";
import { oneway } from "./graphs.js";

const stage = (id) => STAGES.find((s) => s.id === id);

/** S から順にタップして、最後の結果を返す */
const tapAll = (round, nodes) => nodes.map((n) => round.tap(n)).at(-1);

test("隣の交差点をタップするとルートに加わる", () => {
  const round = new DeliveryRound(stage("downtown"));
  assert.equal(round.tap("A").kind, "added");
  assert.deepEqual(round.route, ["S", "A"]);
});

test("辺でつながっていない交差点は invalid で、ルートは変わらない", () => {
  const round = new DeliveryRound(stage("downtown"));
  assert.equal(round.tap("D").kind, "invalid");
  assert.deepEqual(round.route, ["S"]);
});

test("一方通行を逆向きに進むタップは invalid", () => {
  const round = new DeliveryRound(oneway);
  round.tap("A");
  // B→A はあるが A→B はない
  assert.equal(round.tap("B").kind, "invalid");
  assert.deepEqual(round.route, ["S", "A"]);
});

test("訪問済みの交差点(1手前を除く)は invalid", () => {
  const round = new DeliveryRound(stage("downtown"));
  tapAll(round, ["A", "D", "B"]);
  assert.equal(round.tap("S").kind, "invalid");
});

test("1手前の交差点をタップすると1手戻る", () => {
  const round = new DeliveryRound(stage("downtown"));
  tapAll(round, ["A", "D"]);
  assert.equal(round.tap("A").kind, "undone");
  assert.deepEqual(round.route, ["S", "A"]);
});

test("undo() でも1手戻る。S より前には戻らない", () => {
  const round = new DeliveryRound(stage("downtown"));
  round.tap("A");
  round.undo();
  assert.deepEqual(round.route, ["S"]);
  round.undo();
  assert.deepEqual(round.route, ["S"]);
});

test("隣に未訪問の交差点がない行き止まりは stuck(S-B-D-H-E)", () => {
  const round = new DeliveryRound(stage("downtown"));
  assert.equal(tapAll(round, ["B", "D", "H", "E"]).kind, "stuck");
  // 追加はされるので、1手戻ってやり直せる
  assert.deepEqual(round.route, ["S", "B", "D", "H", "E"]);
});

test("隣に未訪問はあるが G へ抜けられない袋小路も stuck(S-B-D-F-C)", () => {
  const round = new DeliveryRound(stage("downtown"));
  assert.equal(tapAll(round, ["B", "D", "F", "C"]).kind, "stuck");
});

test("G に着くと finished になり、ルートの所要時間が確定する", () => {
  const round = new DeliveryRound(stage("downtown"));
  assert.equal(tapAll(round, ["A", "D", "H", "G"]).kind, "finished");
  assert.equal(round.finished, true);
  assert.equal(round.cost(), 13);
});

test("クリア後のタップではルートが変わらない", () => {
  const round = new DeliveryRound(stage("downtown"));
  tapAll(round, ["A", "D", "H", "G"]);
  round.tap("H");
  round.undo();
  assert.deepEqual(round.route, ["S", "A", "D", "H", "G"]);
});

for (const [id, route, cost, stars] of [
  ["downtown", "S-A-D-H-G", 13, 3],
  ["downtown", "S-B-E-H-G", 16, 2], // star2 ちょうど
  ["downtown", "S-A-D-F-G", 17, 1],
  ["residential", "S-A-D-E-I-L-G", 18, 3],
  ["residential", "S-A-E-I-L-G", 20, 2], // star2 ちょうど
  ["residential", "S-B-E-I-L-G", 22, 1], // 目先の罠で始めたときの最善
  ["oneway", "S-B-C-E-G", 14, 3], // 同点のもう1本でも★3
  ["oneway", "S-B-A-C-E-G", 17, 2],
  ["oneway", "S-A-D-G", 18, 1],
]) {
  test(`層Aの星: ${id} で ${route}(${cost})は★${stars}`, () => {
    const round = new DeliveryRound([...STAGES, oneway].find((s) => s.id === id));
    tapAll(round, route.split("-").slice(1));
    assert.equal(round.cost(), cost);
    assert.equal(round.stars(), stars);
  });
}

test("ゴースト: プレイヤーのルートが最短なら、そのルートを示す(一方通行のグラフは同点あり)", () => {
  const round = new DeliveryRound(oneway);
  tapAll(round, ["B", "C", "E", "G"]);
  assert.deepEqual(round.ghost(), { path: ["S", "B", "C", "E", "G"], tie: true });
});

test("ゴースト: 最短が1本だけのステージでは tie は false", () => {
  const round = new DeliveryRound(stage("downtown"));
  tapAll(round, ["A", "D", "H", "G"]);
  assert.deepEqual(round.ghost(), { path: ["S", "A", "D", "H", "G"], tie: false });
});

test("ゴースト: 遠回りしたときは最短ルートを示す", () => {
  const round = new DeliveryRound(stage("residential"));
  tapAll(round, ["B", "E", "I", "L", "G"]);
  assert.deepEqual(round.ghost(), { path: ["S", "A", "D", "E", "I", "L", "G"], tie: false });
});

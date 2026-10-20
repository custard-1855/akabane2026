import { test } from "node:test";
import assert from "node:assert/strict";
import { ControlRound, INF, buildAdj, dijkstra } from "../static/logic.js";
import { STAGES } from "../static/stages.js";

const stage = (id) => STAGES.find((s) => s.id === id);

/** 順に settle して、最後の結果を返す */
const settleAll = (round, nodes) => nodes.map((n) => round.settle(n)).at(-1);

test("最初は S だけが候補で、札は S が 0、ほかは ∞", () => {
  const round = new ControlRound(stage("downtown"));
  assert.deepEqual(round.candidates(), ["S"]);
  assert.equal(round.dist.get("S"), 0);
  assert.equal(round.dist.get("G"), INF);
});

test("S を確定すると、隣の札が書き換わる", () => {
  const round = new ControlRound(stage("downtown"));
  const r = round.settle("S");
  assert.equal(r.kind, "settled");
  assert.deepEqual(r.relaxations, [
    { node: "A", via: "S", from: INF, cand: 4, updated: true },
    { node: "B", via: "S", from: INF, cand: 3, updated: true },
  ]);
  assert.deepEqual(round.candidates(), ["A", "B"]);
});

test("確定済みを選ぶと already、札が ∞ なら unreached。どちらもミスに数えない", () => {
  const round = new ControlRound(stage("downtown"));
  round.settle("S");
  assert.equal(round.settle("S").kind, "already");
  assert.equal(round.settle("G").kind, "unreached");
  assert.equal(round.mistakes, 0);
  assert.equal(round.done.has("G"), false);
});

test("札が最小でない候補を選ぶと not_min。ミスが1増え、確定はしない", () => {
  const round = new ControlRound(stage("downtown"));
  round.settle("S");
  const before = new Map(round.dist);
  // 候補は B(3) と A(4)
  assert.equal(round.settle("A").kind, "not_min");
  assert.equal(round.mistakes, 1);
  assert.equal(round.done.has("A"), false);
  assert.deepEqual(round.dist, before);
});

test("同値の候補はどれを選んでも正解(Stage 1 の C と H はどちらも 9)", () => {
  const round = new ControlRound(stage("downtown"));
  settleAll(round, ["S", "B", "A", "D", "E"]);
  assert.equal(round.settle("H").kind, "settled");
  assert.equal(round.settle("C").kind, "settled");
  assert.equal(round.mistakes, 0);
});

test("not_min の理由: 札がたまたま正しいときは lucky で、札が最小の候補を示す", () => {
  const round = new ControlRound(stage("downtown"));
  round.settle("S");
  // A の札 4 は本当の最短と同じだが、B(3)が残っている
  assert.deepEqual(round.settle("A").reason, { kind: "lucky", minNodes: ["B"] });
});

test("not_min の理由: 札が後で覆るときは overturn で、経由する未確定の c を示す", () => {
  const round = new ControlRound(stage("downtown"));
  settleAll(round, ["S", "B"]);
  // 候補は A(4)、E(7)、D(9)。D の本当の最短は S-A-D の 6
  assert.deepEqual(round.settle("D").reason, {
    kind: "overturn",
    via: "A",
    viaDist: 4,
    best: 6,
    path: ["A", "D"],
  });
});

/** 書き換えた札だけを「D: 9→6」の形にする。辺の順は仕様でないので並べ替える */
const updates = (r) =>
  r.relaxations
    .filter((x) => x.updated)
    .map((x) => `${x.node}: ${x.from === INF ? "∞" : x.from}→${x.cand}`)
    .sort();

test("Stage 1: A を確定すると D: 9→6。D の確定では、そのままの C も返す", () => {
  const round = new ControlRound(stage("downtown"));
  settleAll(round, ["S", "B"]);
  assert.deepEqual(updates(round.settle("A")), ["C: ∞→9", "D: 9→6"]);
  const r = round.settle("D");
  assert.deepEqual(r.relaxations.find((x) => x.node === "C"), {
    node: "C", via: "D", from: 9, cand: 9, updated: false,
  });
});

test("Stage 2: Q を確定すると B: 13→8", () => {
  const round = new ControlRound(stage("highway"));
  settleAll(round, ["S", "P"]);
  assert.deepEqual(updates(round.settle("A")), ["B: ∞→13"]);
  round.settle("R");
  assert.deepEqual(updates(round.settle("Q")), ["B: 13→8", "G: ∞→9"]);
});

test("Stage 3: C で D: 12→10、E で G: 16→14", () => {
  const round = new ControlRound(stage("oneway"));
  settleAll(round, ["S", "A", "B"]);
  assert.deepEqual(updates(round.settle("C")), ["D: 12→10", "E: ∞→12"]);
  round.settle("D");
  assert.deepEqual(updates(round.settle("E")), ["G: 16→14"]);
});

test("G を確定するとクリア。それまでは finished にならない", () => {
  const round = new ControlRound(stage("oneway"));
  settleAll(round, ["S", "A", "B", "C", "D", "E"]);
  assert.equal(round.finished, false);
  assert.equal(round.settle("G").kind, "settled");
  assert.equal(round.finished, true);
});

for (const s of STAGES) {
  test(`${s.id}: 候補の最小を選び続けると dijkstra() と同じ札になる`, () => {
    const round = new ControlRound(s);
    while (round.candidates().length > 0) {
      const next = round.candidates().reduce((a, b) => (round.dist.get(b) < round.dist.get(a) ? b : a));
      assert.notEqual(round.settle(next).kind, "not_min");
    }
    assert.deepEqual(round.dist, dijkstra(buildAdj(s), "S").dist);
  });
}

for (const [mistakes, stars] of [[0, 3], [1, 2], [2, 2], [3, 1]]) {
  test(`層Bの星: ミス${mistakes}回なら★${stars}`, () => {
    const round = new ControlRound(stage("downtown"));
    round.settle("S");
    // S 確定後の A(4)は B(3)より大きいので、選ぶたびにミスになる
    for (let i = 0; i < mistakes; i++) round.settle("A");
    settleAll(round, ["B", "A", "D", "E", "C", "H", "G"]);
    assert.equal(round.mistakes, mistakes);
    assert.equal(round.stars(), stars);
  });
}

test("確定済みの交差点へ向かう辺は relaxations に含めない", () => {
  const round = new ControlRound(stage("downtown"));
  round.settle("S");
  const r = round.settle("B");
  assert.deepEqual(r.relaxations.map((x) => x.node).sort(), ["D", "E"]);
});

test("not_min の理由: c は n の1つ手前とは限らず、最短ルート上で最初の未確定ノード", () => {
  // S-X-Y-N(合計3)が最短。S を確定した直後は X(1) と N(10) が候補
  const line = {
    nodes: { S: [0, 0], X: [0, 0], Y: [0, 0], N: [0, 0], G: [0, 0] },
    edges: [
      { u: "S", v: "X", w: 1 },
      { u: "X", v: "Y", w: 1 },
      { u: "Y", v: "N", w: 1 },
      { u: "S", v: "N", w: 10 },
      { u: "N", v: "G", w: 1 },
    ],
  };
  const round = new ControlRound(line);
  round.settle("S");
  assert.deepEqual(round.settle("N").reason, {
    kind: "overturn",
    via: "X",
    viaDist: 1,
    best: 3,
    path: ["X", "Y", "N"],
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { ControlRound, INF, buildAdj, dijkstra } from "../static/logic.js";
import { STAGES } from "../static/stages.js";
import { oneway } from "./graphs.js";

const stage = (id) => STAGES.find((s) => s.id === id);

/** n 回 step して、最後の結果を返す */
const stepN = (round, n) => Array.from({ length: n }, () => round.step()).at(-1);

test("最初は S だけが候補で、札は S が 0、ほかは ∞", () => {
  const round = new ControlRound(stage("downtown"));
  assert.deepEqual(round.candidates(), ["S"]);
  assert.equal(round.dist.get("S"), 0);
  assert.equal(round.dist.get("G"), INF);
});

test("S を確定すると、隣の札が書き換わる", () => {
  const round = new ControlRound(stage("downtown"));
  const r = round.step();
  assert.equal(r.node, "S");
  assert.deepEqual(r.relaxations, [
    { node: "A", via: "S", from: INF, cand: 4, updated: true },
    { node: "B", via: "S", from: INF, cand: 3, updated: true },
  ]);
  assert.deepEqual(round.candidates(), ["A", "B"]);
});

test("札が最小の候補から確定する(S 確定後は B(3)が A(4)より先)", () => {
  const round = new ControlRound(stage("downtown"));
  round.step();
  assert.equal(round.next(), "B");
  assert.equal(round.step().node, "B");
});

test("同値の候補は nodes の記述順で先のものを確定する(Stage 1 の C と H はどちらも 9)", () => {
  const round = new ControlRound(stage("downtown"));
  stepN(round, 5); // S、B、A、D、E
  assert.equal(round.dist.get("C"), 9);
  assert.equal(round.dist.get("H"), 9);
  assert.equal(round.step().node, "C");
  assert.equal(round.step().node, "H");
});

/** 書き換えた札だけを「D: 9→6」の形にする。辺の順は仕様でないので並べ替える */
const updates = (r) =>
  r.relaxations
    .filter((x) => x.updated)
    .map((x) => `${x.node}: ${x.from === INF ? "∞" : x.from}→${x.cand}`)
    .sort();

test("Stage 1: A を確定すると D: 9→6。D の確定では、そのままの C も返す", () => {
  const round = new ControlRound(stage("downtown"));
  stepN(round, 2); // S、B
  const a = round.step();
  assert.equal(a.node, "A");
  assert.deepEqual(updates(a), ["C: ∞→9", "D: 9→6"]);
  const d = round.step();
  assert.equal(d.node, "D");
  assert.deepEqual(d.relaxations.find((x) => x.node === "C"), {
    node: "C", via: "D", from: 9, cand: 9, updated: false,
  });
});

test("有向辺: 一方通行のグラフで、C で D: 12→10、E で G: 16→14", () => {
  const round = new ControlRound(oneway);
  stepN(round, 3); // S、A、B
  assert.deepEqual(updates(round.step()), ["D: 12→10", "E: ∞→12"]);
  round.step(); // D
  assert.deepEqual(updates(round.step()), ["G: 16→14"]);
});

test("行ける交差点をすべて確定すると finished になり、step は null を返す", () => {
  const round = new ControlRound(oneway);
  stepN(round, 6); // S、A、B、C、D、E
  assert.equal(round.finished, false);
  assert.equal(round.step().node, "G");
  assert.equal(round.finished, true);
  assert.equal(round.step(), null);
});

for (const s of STAGES) {
  test(`${s.id}: 最後まで進めると dijkstra() と同じ札になる`, () => {
    const round = new ControlRound(s);
    while (round.step() !== null);
    assert.deepEqual(round.dist, dijkstra(buildAdj(s), s.start ?? "S").dist);
  });
}

test("確定済みの交差点へ向かう辺は relaxations に含めない", () => {
  const round = new ControlRound(stage("downtown"));
  round.step();
  const r = round.step();
  assert.deepEqual(r.relaxations.map((x) => x.node).sort(), ["D", "E"]);
});

test("Stage 2 の札の2回の書き換え: E の札が ∞→10→8→6 と書き換わる", () => {
  const round = new ControlRound(stage("residential"));
  const history = [];
  for (let r = round.step(); r !== null; r = round.step()) {
    history.push(...updates(r).filter((u) => u.startsWith("E:")));
  }
  assert.deepEqual(history, ["E: ∞→10", "E: 10→8", "E: 8→6"]);
});

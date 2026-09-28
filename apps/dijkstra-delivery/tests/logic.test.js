import { test } from "node:test";
import assert from "node:assert/strict";

import { STAGES } from "../static/stages.js";
import {
  INF, buildAdj, dijkstra, pathTo, distToGoal, solveStage,
  DeliveryRound, ControlRound, deliveryStars, controlStars, formatUpdates,
} from "../static/logic.js";

const stage = (id) => STAGES.find((s) => s.id === id);

test("Stage 3: 有向として解くと 14、無向として解くと 12", () => {
  const s = stage("oneway");
  assert.equal(dijkstra(buildAdj(s), "S").dist.get("G"), 14);
  assert.equal(dijkstra(buildAdj(s, { undirected: true }), "S").dist.get("G"), 12);
});

test("最適経路: Stage 1 は S-A-D-H-G、Stage 2 は S-P-Q-G", () => {
  assert.deepEqual(solveStage(stage("downtown")).path, ["S", "A", "D", "H", "G"]);
  assert.deepEqual(solveStage(stage("highway")).path, ["S", "P", "Q", "G"]);
});

test("到達不能ノードは INF のままで、pathTo() が null を返す", () => {
  const s = {
    nodes: { S: [0, 0], A: [0, 0], X: [0, 0] },
    edges: [{ u: "S", v: "A", w: 2 }],
  };
  const { dist, prev } = dijkstra(buildAdj(s), "S");
  assert.equal(dist.get("X"), INF);
  assert.equal(pathTo(prev, "S", "X"), null);
  assert.deepEqual(pathTo(prev, "S", "S"), ["S"]);
});

test("distToGoal() は有向辺の向きを反転する(Stage 3 で A から 11)", () => {
  const d = distToGoal(stage("oneway"));
  assert.equal(d.get("A"), 11);
  assert.equal(d.get("S"), 14);
  assert.equal(d.get("G"), 0);
});

test("distToGoal() の exclude は通過済みの交差点を通れなくする", () => {
  // Stage 1 で D を通れないと、A から G は A-C-F-G の 15
  const d = distToGoal(stage("downtown"), { exclude: ["D"] });
  assert.equal(d.get("A"), 15);
  assert.equal(d.get("D"), INF);
});

// --- ControlRound -------------------------------------------------------

test("ControlRound.settle() の4分岐と、ミスは not_min のときだけ増える", () => {
  const r = new ControlRound(stage("downtown"));
  assert.equal(r.settle("A").kind, "unreached");
  assert.equal(r.mistakes, 0);
  assert.equal(r.settle("S").kind, "settled");
  assert.equal(r.settle("S").kind, "already");
  assert.equal(r.mistakes, 0);
  const res = r.settle("A"); // A=4, B=3
  assert.equal(res.kind, "not_min");
  assert.equal(res.min, 3);
  assert.equal(r.mistakes, 1);
  assert.equal(r.settle("B").kind, "settled");
});

/** 設計書 3.9 の「層Bの進行」 */
const PROGRESS = {
  downtown: [
    ["S", "A: ∞→4, B: ∞→3"],
    ["B", "D: ∞→9, E: ∞→7"],
    ["A", "C: ∞→9, D: 9→6"],
    ["D", "F: ∞→13, H: ∞→9"],
    ["E", ""],
    ["C", ""],
    ["H", "G: ∞→13"],
    ["F", ""],
    ["G", ""],
  ],
  highway: [
    ["S", "A: ∞→4, P: ∞→3, R: ∞→4"],
    ["P", "Q: ∞→5"],
    ["A", "B: ∞→13"],
    ["R", "T: ∞→8"],
    ["Q", "B: 13→8, G: ∞→9"],
    ["B", ""],
    ["T", ""],
    ["G", ""],
  ],
  oneway: [
    ["S", "A: ∞→3, B: ∞→5"],
    ["A", "C: ∞→7, D: ∞→12"],
    ["B", ""],
    ["C", "D: 12→10, E: ∞→12"],
    ["D", "G: ∞→16"],
    ["E", "G: 16→14"],
    ["G", ""],
  ],
};

for (const [id, steps] of Object.entries(PROGRESS)) {
  test(`層Bの進行どおりに settle() したときの updates(${id})`, () => {
    const r = new ControlRound(stage(id));
    for (const [n, expected] of steps) {
      const res = r.settle(n);
      assert.equal(res.kind, "settled", n);
      assert.equal(formatUpdates(res.updates), expected, n);
    }
    assert.equal(r.finished, true);
    assert.equal(r.mistakes, 0);
    assert.equal(r.stars(), 3);
    assert.equal(r.allDone(), true);
  });
}

test("同値の候補はどれを選んでも正解(Stage 1 の C/H)", () => {
  const r = new ControlRound(stage("downtown"));
  for (const n of ["S", "B", "A", "D", "E", "H", "C"]) assert.equal(r.settle(n).kind, "settled", n);
  assert.equal(r.mistakes, 0);
});

test("ControlRound を自動実行した結果が dijkstra() と一致する", () => {
  for (const s of STAGES) {
    const r = new ControlRound(s);
    while (!r.allDone()) r.settle(r.minCandidates()[0]);
    const { dist, prev } = dijkstra(buildAdj(s), "S");
    assert.deepEqual(r.dist, dist, s.id);
    assert.deepEqual(r.prev, prev, s.id);
    assert.deepEqual(r.violations, []);
  }
});

test("ControlRound: クリア後のミスは数えない", () => {
  const r = new ControlRound(stage("downtown"));
  for (const n of ["S", "B", "A", "D", "E", "C", "H"]) r.settle(n);
  const res = r.settle("G"); // F と G は同値(13)
  assert.equal(res.goalReached, true);
  assert.equal(r.stars(), 3);
  r.settle("F");
  assert.equal(r.mistakes, 0);
});

test("ControlRound のヒント: ① 候補 ② 最小 ③ 1手自動で確定(★1上限)", () => {
  const r = new ControlRound(stage("downtown"));
  r.settle("S");
  assert.deepEqual(r.hint(1).nodes, ["A", "B"]);
  assert.deepEqual(r.hint(2).nodes, ["B"]);
  const h = r.hint(3);
  assert.equal(h.result.kind, "settled");
  assert.equal(r.done.has("B"), true);
  while (!r.finished) r.settle(r.minCandidates()[0]);
  assert.equal(r.stars(), 1);
});

test("ControlRound の星: ミス0で★3、1〜2で★2、3以上で★1", () => {
  const play = (misses) => {
    const r = new ControlRound(stage("downtown"));
    r.settle("S");
    for (let i = 0; i < misses; i++) r.settle("A"); // B(3) が残っているのに A(4)
    while (!r.finished) r.settle(r.minCandidates()[0]);
    return r.stars();
  };
  assert.deepEqual([0, 1, 2, 3, 4].map(play), [3, 2, 2, 1, 1]);
});

// --- DeliveryRound ------------------------------------------------------

test("DeliveryRound.tap() の5分岐", () => {
  const r = new DeliveryRound(stage("downtown"));
  assert.equal(r.tap("D").kind, "invalid");
  assert.equal(r.tap("B").kind, "added");
  assert.equal(r.tap("S").kind, "undone");
  assert.deepEqual(r.route, ["S"]);
  // S-B-D-H-E は行き止まり
  for (const n of ["B", "D", "H"]) assert.equal(r.tap(n).kind, "added", n);
  assert.equal(r.tap("E").kind, "stuck");
  assert.equal(r.tap("H").kind, "undone");
  assert.equal(r.tap("G").kind, "finished");
  assert.deepEqual(r.route, ["S", "B", "D", "H", "G"]);
  assert.equal(r.cost(), 16);
  assert.equal(r.tap("A").kind, "ignored");
});

test("DeliveryRound: invalid の理由", () => {
  const r = new DeliveryRound(stage("oneway"));
  r.tap("B");
  assert.deepEqual(r.tap("S"), { kind: "undone", node: "S" });
  r.tap("B");
  r.tap("A"); // B→A は通れる
  assert.equal(r.tap("B").kind, "undone");
  r.tap("C"); // S-B-C
  assert.equal(r.tap("A").reason, "oneway"); // A→C はあるが C→A はない
  assert.equal(r.tap("S").reason, "visited");
  assert.equal(r.tap("G").reason, "no_edge");
});

test("DeliveryRound: 一方通行は逆走できない", () => {
  const r = new DeliveryRound(stage("oneway"));
  r.tap("A");
  const res = r.tap("B"); // B→A はあるが A→B はない
  assert.equal(res.kind, "invalid");
  assert.equal(res.reason, "oneway");
  assert.equal(r.tap("A").reason, "current");
});

test("DeliveryRound.undo()", () => {
  const r = new DeliveryRound(stage("downtown"));
  assert.equal(r.undo(), false);
  r.tap("A");
  assert.equal(r.undo(), true);
  assert.deepEqual(r.route, ["S"]);
});

test("星判定: 各ステージの最適・star2 ちょうど・star2 + 1", () => {
  for (const s of STAGES) {
    const opt = s.expectedCost;
    assert.equal(deliveryStars(opt, opt, s.star2), 3, s.id);
    assert.equal(deliveryStars(s.star2, opt, s.star2), 2, s.id);
    assert.equal(deliveryStars(s.star2 + 1, opt, s.star2), 1, s.id);
    assert.equal(deliveryStars(opt, opt, s.star2, true), 1, s.id);
  }
  assert.equal(controlStars(0, true), 1);
});

test("DeliveryRound の星: 実際のルートで判定する", () => {
  const play = (route, hint) => {
    const r = new DeliveryRound(stage("downtown"));
    if (hint) r.hint(hint);
    for (const n of route) r.tap(n);
    return [r.cost(), r.stars()];
  };
  assert.deepEqual(play(["A", "D", "H", "G"]), [13, 3]);
  assert.deepEqual(play(["B", "E", "H", "G"]), [16, 2]);
  assert.deepEqual(play(["A", "D", "F", "G"]), [17, 1]);
  assert.deepEqual(play(["A", "D", "H", "G"], 2), [13, 3]); // ①②は減点しない
  assert.deepEqual(play(["A", "D", "H", "G"], 3), [13, 1]);
});

test("DeliveryRound のヒント: ① 進める交差点 ② 最短で次に進む交差点 ③ 最短ルート", () => {
  const r = new DeliveryRound(stage("highway"));
  assert.deepEqual(r.hint(1).nodes.sort(), ["A", "P", "R"]);
  assert.deepEqual(r.hint(2).nodes, ["P"]);
  // 遠回りした後でも、現在地からの次善の一手を示す
  r.tap("A");
  r.tap("B");
  assert.deepEqual(r.hint(2).nodes, ["G"]);
  assert.deepEqual(r.hint(3).path, ["S", "P", "Q", "G"]);
});

test("DeliveryRound のヒント②: 通過済みの交差点を経由する道は使わない", () => {
  // Stage 1 で S-A-D と進むと、D から G は D-H-G(7)。S を経由しない
  const r = new DeliveryRound(stage("downtown"));
  r.tap("A");
  r.tap("D");
  assert.deepEqual(r.hint(2).nodes, ["H"]);
  // 行き止まりでは光らせるものがない
  const r2 = new DeliveryRound(stage("downtown"));
  for (const n of ["B", "D", "H", "E"]) r2.tap(n);
  assert.deepEqual(r2.hint(2).nodes, []);
});

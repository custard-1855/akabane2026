import { test } from "node:test";
import assert from "node:assert/strict";
import { INF, buildAdj, dijkstra, distToGoal, pathTo } from "../static/logic.js";
import { STAGES } from "../static/stages.js";
import { oneway } from "./graphs.js";

const stage = (id) => STAGES.find((s) => s.id === id);

test("Stage 1 で S から G までの最短は 13", () => {
  const { dist } = dijkstra(buildAdj(stage("downtown")), "S");
  assert.equal(dist.get("G"), 13);
});

test("有向辺は向きを守る: 一方通行のグラフは 14、逆走を許すと 12", () => {
  const s = oneway;
  assert.equal(dijkstra(buildAdj(s), "S").dist.get("G"), 14);
  assert.equal(dijkstra(buildAdj(s, { undirected: true }), "S").dist.get("G"), 12);
});

test("届かない地点は距離が INF のままで、経路は null", () => {
  const island = {
    nodes: { S: [0, 0], G: [0, 0], X: [0, 0] },
    edges: [{ u: "S", v: "G", w: 1 }],
  };
  const { dist, prev } = dijkstra(buildAdj(island), "S");
  assert.equal(dist.get("X"), INF);
  assert.equal(pathTo(prev, "S", "X"), null);
});

test("distToGoal は一方通行を逆にたどる(一方通行のグラフの A から G まで 11)", () => {
  const toGoal = distToGoal(oneway);
  assert.equal(toGoal.get("A"), 11);
  assert.equal(toGoal.get("G"), 0);
});

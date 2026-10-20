import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCity, nearestNode } from "../static/city.js";
import { INF, buildAdj, dijkstra, pathTo, solveFrom } from "../static/logic.js";
import { STAGES, validateStage } from "../static/stages.js";

test("大都市: validateStage を通り(dense の例外つき)、交差点は約300個", () => {
  const city = generateCity(1);
  assert.equal(city.dense, true);
  assert.deepEqual(validateStage(city), []);
  const n = Object.keys(city.nodes).length;
  assert.ok(n >= 280 && n <= 320, `交差点が ${n} 個`);
});

test("大都市: 同じ種からは同じ街ができ、違う種からは違う街ができる", () => {
  assert.deepEqual(generateCity(1), generateCity(1));
  assert.notDeepEqual(generateCity(1).nodes, generateCity(2).nodes);
});

test("大都市: 道を一部抜いても、どの交差点からでも全部の交差点へ行ける(どこを出発点にしても解ける)", () => {
  // 抜く道は乱数で決まるので、種によらず成り立つことを確かめる
  for (let seed = 1; seed <= 30; seed++) {
    const city = generateCity(seed);
    // 無向グラフなので、1つの交差点から全部へ行ければ、どこからでも全部へ行ける
    const { dist } = dijkstra(buildAdj(city), city.start);
    assert.deepEqual([...dist].filter(([, d]) => d === INF), [], `種 ${seed}`);
  }
});

test("大都市: 所要時間は、道の長さ ÷ 10 × 0.8〜1.2 を丸めた値", () => {
  const city = generateCity(1);
  for (const { u, v, w } of city.edges) {
    const len = Math.hypot(city.nodes[v][0] - city.nodes[u][0], city.nodes[v][1] - city.nodes[u][1]);
    assert.ok(
      w >= Math.round((len / 10) * 0.8) && w <= Math.round((len / 10) * 1.2),
      `${u}-${v}: 長さ ${len.toFixed(1)} に所要時間 ${w}`,
    );
  }
});

test("nearestNode: 押した位置にいちばん近い交差点を返す", () => {
  const stage = { nodes: { S: [200, 450], A: [800, 200], G: [1400, 450] } };
  assert.equal(nearestNode(stage, [700, 300]), "A");
  // G と同じ高さでも、A のほうが近い(A まで 320、G まで 400)
  assert.equal(nearestNode(stage, [1000, 450]), "A");
  assert.equal(nearestNode(stage, [1300, 500]), "G");
});

test("solveFrom: 出発点から近い順に全地点を確定する(Stage 1 は設計書 3.9 の層Bの進行どおり)", () => {
  const { order, dist } = solveFrom(STAGES[0], "S");
  assert.deepEqual(order, ["S", "B", "A", "D", "E", "C", "H", "F", "G"]);
  assert.equal(dist.get("G"), 13);
});

test("solveFrom: 大都市でも全交差点を確定し、札は dijkstra() と一致し、確定順に小さい", () => {
  const city = generateCity(1);
  const start = nearestNode(city, [800, 450]);
  const { order, dist } = solveFrom(city, start);
  assert.equal(order.length, Object.keys(city.nodes).length);
  assert.deepEqual(dist, dijkstra(buildAdj(city), start).dist);
  for (let i = 1; i < order.length; i++) {
    assert.ok(dist.get(order[i - 1]) <= dist.get(order[i]));
  }
});

test("solveFrom: 1回解けば、倉庫からどの交差点へも、札と同じ時間の最短ルートを prev から出せる", () => {
  const city = generateCity(1);
  const adj = buildAdj(city);
  const start = nearestNode(city, [800, 450]);
  const { dist, prev } = solveFrom(city, start);
  for (const n of Object.keys(city.nodes)) {
    const path = pathTo(prev, start, n);
    let sum = 0;
    for (let i = 1; i < path.length; i++) sum += adj.get(path[i - 1]).get(path[i]);
    assert.equal(sum, dist.get(n), n);
  }
});

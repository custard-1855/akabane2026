import { test } from "node:test";
import assert from "node:assert/strict";

import { STAGES, validateStage, validateStages } from "../static/stages.js";
import { buildAdj, dijkstra } from "../static/logic.js";

test("全ステージで validateStage() が通る", () => {
  assert.deepEqual(validateStages(STAGES), []);
});

test("全ステージで goal までの距離が expectedCost と一致する", () => {
  for (const s of STAGES) {
    const { dist } = dijkstra(buildAdj(s), "S");
    assert.equal(dist.get("G"), s.expectedCost, s.id);
  }
});

const tiny = () => ({
  id: "tiny",
  name: "",
  desc: "",
  nodes: { S: [100, 100], A: [300, 100], G: [500, 100] },
  edges: [{ u: "S", v: "A", w: 1 }, { u: "A", v: "G", w: 1 }],
  expectedCost: 2,
  star2: 2,
});

test("validateStage: 正しいデータは通る", () => {
  assert.deepEqual(validateStage(tiny()), []);
});

test("validateStage: 存在しない端点・start・goal", () => {
  const s = tiny();
  s.edges.push({ u: "A", v: "X", w: 1 });
  assert.match(validateStage(s).join(), /端点/);
  const s2 = tiny();
  s2.goal = "Z";
  assert.match(validateStage(s2).join(), /goal Z/);
});

test("validateStage: 同じ向きの辺の重複(無向辺は両向きとして数える)", () => {
  const s = tiny();
  s.edges.push({ u: "A", v: "S", w: 2, directed: true });
  assert.match(validateStage(s).join(), /A>S が重複/);
  const s2 = tiny();
  s2.edges = [{ u: "S", v: "A", w: 1, directed: true }, { u: "A", v: "S", w: 1, directed: true }, { u: "A", v: "G", w: 1 }];
  assert.deepEqual(validateStage(s2), []);
});

test("validateStage: 重みが正の整数でない", () => {
  for (const w of [0, -1, 1.5]) {
    const s = tiny();
    s.edges[0].w = w;
    assert.match(validateStage(s).join(), /正の整数/, String(w));
  }
});

test("validateStage: goal に到達できない", () => {
  const s = tiny();
  s.edges = [{ u: "S", v: "A", w: 1 }, { u: "G", v: "A", w: 1, directed: true }];
  assert.match(validateStage(s).join(), /到達できません/);
});

test("validateStage: 座標・ノード間距離・辺とノードの距離", () => {
  const s = tiny();
  s.nodes.S = [10, 100];
  assert.match(validateStage(s).join(), /余白/);
  const s2 = tiny();
  s2.nodes.A = [150, 100];
  assert.match(validateStage(s2).join(), /近すぎます/);
  const s3 = tiny();
  s3.edges.push({ u: "S", v: "G", w: 5 }); // A の上を通る
  assert.match(validateStage(s3).join(), /A の上を通ります/);
});

test("validateStages: id の重複", () => {
  assert.match(validateStages([tiny(), tiny()]).join(), /id tiny が重複/);
});

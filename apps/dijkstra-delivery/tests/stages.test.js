import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdj, dijkstra } from "../static/logic.js";
import { STAGES, validateStage } from "../static/stages.js";

/** 小さい正しいステージ。テストごとに一部を壊して使う */
const base = () => ({
  id: "t",
  name: "t",
  desc: "",
  nodes: { S: [200, 450], A: [800, 200], G: [1400, 450] },
  edges: [
    { u: "S", v: "A", w: 2 },
    { u: "A", v: "G", w: 3 },
  ],
  expectedCost: 5,
  star2: 6,
});

for (const s of STAGES) {
  test(`${s.id}: validateStage を通る`, () => {
    assert.deepEqual(validateStage(s), []);
  });

  test(`${s.id}: 最短距離が設計値 expectedCost と一致する`, () => {
    assert.equal(dijkstra(buildAdj(s), s.start ?? "S").dist.get(s.goal ?? "G"), s.expectedCost);
  });
}

test("ステージの id が重複しない(進捗保存のキーになる)", () => {
  const ids = STAGES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("辺の端点が nodes にないと検出する", () => {
  const s = base();
  s.edges.push({ u: "A", v: "X", w: 1 });
  assert.match(validateStage(s).join("\n"), /X/);
});

test("goal が nodes にないと検出する", () => {
  const s = { ...base(), goal: "Z" };
  assert.match(validateStage(s).join("\n"), /Z/);
});

test("start から goal へ行けないと検出する(一方通行で逆向きしかない場合も)", () => {
  const s = base();
  s.edges[1] = { u: "G", v: "A", w: 3, directed: true };
  assert.match(validateStage(s).join("\n"), /到達/);
});

test("無向辺と、その逆向きの有向辺は重複として検出する", () => {
  const s = base();
  s.edges.push({ u: "A", v: "S", w: 5, directed: true });
  assert.match(validateStage(s).join("\n"), /重複/);
});

test("向きが逆の有向辺どうしは重複ではない", () => {
  const s = base();
  s.edges[0] = { u: "S", v: "A", w: 2, directed: true };
  s.edges.push({ u: "A", v: "S", w: 5, directed: true });
  assert.deepEqual(validateStage(s), []);
});

for (const w of [0, -1, 1.5]) {
  test(`重み ${w} は正の整数でないので検出する`, () => {
    const s = base();
    s.edges[0].w = w;
    assert.match(validateStage(s).join("\n"), /重み/);
  });
}

test("allowNegative なら、有向辺の負の重みは認める", () => {
  const s = { ...base(), allowNegative: true };
  s.edges.push({ u: "S", v: "G", w: 9, directed: true }, { u: "G", v: "S", w: -1, directed: true });
  assert.deepEqual(validateStage(s), []);
});

test("allowNegative でも、無向辺の負の重みは検出する", () => {
  const s = { ...base(), allowNegative: true };
  s.edges[0].w = -1;
  assert.match(validateStage(s).join("\n"), /重み/);
});

test("負の閉路を検出する", () => {
  const s = { ...base(), allowNegative: true };
  s.edges = [
    { u: "S", v: "A", w: 2, directed: true },
    { u: "A", v: "G", w: 3, directed: true },
    { u: "G", v: "A", w: -4, directed: true },
  ];
  assert.match(validateStage(s).join("\n"), /負の閉路/);
});

test("viewBox の余白にはみ出したノードを検出する", () => {
  const s = base();
  s.nodes.G = [1580, 450];
  assert.match(validateStage(s).join("\n"), /G .*はみ出/);
});

test("近すぎるノード(タップ判定が重なる)を検出する", () => {
  const s = base();
  s.nodes.A = [300, 450];
  assert.match(validateStage(s).join("\n"), /近すぎる/);
});

test("ほかのノードの上を通る辺を検出する", () => {
  const s = base();
  // S-G を結ぶと、A(800,450)の真上を通る
  s.nodes.A = [800, 450];
  s.edges.push({ u: "S", v: "G", w: 9 });
  assert.match(validateStage(s).join("\n"), /上を通る/);
});

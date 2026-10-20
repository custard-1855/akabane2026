import { test } from "node:test";
import assert from "node:assert/strict";
import { revealFor } from "../static/reveal.js";
import { STAGES } from "../static/stages.js";

const stage = (id) => STAGES.find((s) => s.id === id);

/** 種明かしで出す正式な用語だけを取り出す。文面は仮なので、用語の割り当てだけを確かめる */
const terms = (id, mode) => revealFor(stage(id), mode)?.map((x) => x.term) ?? null;

test("種明かし: Stage 1 の配達の後に、地図の用語(頂点・辺・重み)を出す", () => {
  assert.deepEqual(terms("downtown", "A"), ["頂点(ノード)", "辺(エッジ)", "重み"]);
});

test("種明かし: Stage 1 の管制室の後に、手順の用語を出す", () => {
  assert.deepEqual(terms("downtown", "B"), [
    "暫定距離(ラベル)",
    "緩和",
    "ダイクストラ法(1959年)",
    "最短経路木",
  ]);
});

test("種明かし: Stage 2 の配達の後に、目先の罠を貪欲法と結びつける", () => {
  assert.deepEqual(terms("residential", "A"), ["貪欲法"]);
});

test("種明かし: 出す用語のない層では null", () => {
  assert.equal(terms("residential", "B"), null);
  assert.equal(terms("metropolis", "C"), null);
});

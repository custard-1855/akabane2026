import { test } from "node:test";
import assert from "node:assert/strict";
import { bestStars, recordStars } from "../static/stars.js";

/** localStorage と同じ形の、メモリ上の入れ物 */
function memoryStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

test("星の保存: 記録した星を、あとで同じステージの最高記録として読める", () => {
  const store = memoryStore();
  recordStars(store, "downtown", 2);
  assert.equal(bestStars(store, "downtown"), 2);
});

test("星の保存: あとで少ない星で終えても、最高記録は下がらない", () => {
  const store = memoryStore();
  recordStars(store, "downtown", 3);
  recordStars(store, "downtown", 1);
  assert.equal(bestStars(store, "downtown"), 3);
});

test("星の保存: 記録のないステージと、壊れた値や範囲外の値は 0(まだ星なし)", () => {
  const store = memoryStore();
  assert.equal(bestStars(store, "residential"), 0);
  for (const bad of ["abc", "7", "-1", "2.5"]) {
    store.setItem("dijkstra-delivery:stars:downtown", bad);
    assert.equal(bestStars(store, "downtown"), 0, bad);
  }
});

test("星の保存: 入れ物が読み書きで例外を投げても、入れ物がなくても、遊びは止まらない", () => {
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  for (const store of [broken, null]) {
    assert.doesNotThrow(() => recordStars(store, "downtown", 3));
    assert.equal(bestStars(store, "downtown"), 0);
  }
});

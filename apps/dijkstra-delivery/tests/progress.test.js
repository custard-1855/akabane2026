import { test } from "node:test";
import assert from "node:assert/strict";

import { PROGRESS_KEY, loadProgress, recordStars } from "../static/progress.js";

function memoryStorage(initial) {
  const m = new Map(initial === undefined ? [] : [[PROGRESS_KEY, initial]]);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    raw: () => m.get(PROGRESS_KEY),
  };
}

test("空・壊れた JSON・未知の version を読んでも例外にならない", () => {
  const empty = { version: 1, stages: {} };
  for (const raw of [undefined, "", "{", "null", "[]", '{"version":2,"stages":{}}', '{"version":1,"stages":null}']) {
    assert.deepEqual(loadProgress(memoryStorage(raw)), empty, String(raw));
  }
  assert.deepEqual(loadProgress(null), empty);
  const throwing = { getItem() { throw new Error("SecurityError"); } };
  assert.deepEqual(loadProgress(throwing), empty);
});

test("範囲外の星は捨てる", () => {
  const s = memoryStorage(JSON.stringify({ version: 1, stages: { a: { A: 5, B: 2 }, b: "x" } }));
  assert.deepEqual(loadProgress(s).stages, { a: { B: 2 }, b: {} });
});

test("最高記録だけを残す", () => {
  const s = memoryStorage();
  assert.deepEqual(recordStars("downtown", "A", 2, s), { best: 2, improved: true });
  assert.deepEqual(recordStars("downtown", "A", 1, s), { best: 2, improved: false });
  assert.deepEqual(recordStars("downtown", "B", 3, s), { best: 3, improved: true });
  assert.deepEqual(JSON.parse(s.raw()), { version: 1, stages: { downtown: { A: 2, B: 3 } } });
});

test("書き込みに失敗しても例外にならない", () => {
  const s = { getItem: () => null, setItem() { throw new Error("QuotaExceededError"); } };
  assert.deepEqual(recordStars("downtown", "A", 3, s), { best: 3, improved: true });
});

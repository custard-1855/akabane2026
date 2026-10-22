// 試作のステージの条件(docs/games.md 6.6)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRound, fordFulkersonSteps, lineKey, maxFlow, minCut, sentTotal, starsFor, tap } from "../../static/ford/logic.js";
import { STAGE } from "../../static/ford/stages.js";

/** 層Aで、ルートを順にタップする */
function play(routes) {
  let r = createRound(STAGE);
  for (const route of routes) for (const n of route.slice(1)) r = tap(STAGE, r, n).round;
  return r;
}

/** 順方向に S から T へ行くルートを全部数える(通った地点は通らない) */
function forwardRoutes() {
  /** @type {string[][]} */
  const out = [];
  const walk = (/** @type {string[]} */ route) => {
    const here = /** @type {string} */ (route.at(-1));
    if (here === STAGE.goal) return void out.push(route);
    for (const e of STAGE.edges) if (e.u === here && !route.includes(e.v)) walk([...route, e.v]);
  };
  walk([STAGE.start]);
  return out;
}

test("ステージ: 地点は6〜8個", () => {
  const n = Object.keys(STAGE.nodes).length;
  assert.ok(n >= 6 && n <= 8, `地点 ${n}個`);
});

test("ステージ: いちばん短いルートは1本だけで、そこから送ると最大より少ない量で行き詰まる", () => {
  const routes = forwardRoutes();
  const shortest = Math.min(...routes.map((r) => r.length));
  const first = routes.filter((r) => r.length === shortest);
  assert.equal(first.length, 1);
  const r = play(first);
  assert.equal(r.done, true, "まだ順方向のルートが残っている");
  assert.ok(sentTotal(r) < maxFlow(STAGE));
  assert.equal(starsFor(sentTotal(r), STAGE), 1);
});

test("ステージ: 層Bの最初の手も、そのいちばん短いルート(付け替えの前振り)", () => {
  const steps = fordFulkersonSteps(STAGE);
  assert.deepEqual(steps[0].route, ["S", "A", "F", "T"]);
  assert.ok(steps.some((s) => s.hops.some((h) => !h.forward)), "付け替えが起きない");
});

test("ステージ: 別の順番で送れば、付け替えなしでも最大に届く", () => {
  // 3本以上のルートを順に試し、どれかの順番で最大に届けばよい
  const routes = forwardRoutes();
  const max = maxFlow(STAGE);
  const orders = routes.flatMap((a) => routes.flatMap((b) => routes.map((c) => [a, b, c])));
  assert.ok(orders.some((o) => sentTotal(play(o)) === max));
});

test("ステージ: いちばん細い切れ目は1か所で、その帯域の合計が最大と等しい", () => {
  const max = maxFlow(STAGE);
  const cut = minCut(STAGE);
  assert.equal(cut.total, max);
  // データセンター側に入れる地点の組を全部試し、合計が最大と等しい切れ目を数える
  const middle = Object.keys(STAGE.nodes).filter((n) => n !== STAGE.start && n !== STAGE.goal);
  let count = 0;
  for (let mask = 0; mask < 1 << middle.length; mask++) {
    const side = new Set([STAGE.start, ...middle.filter((_, i) => mask & (1 << i))]);
    const total = STAGE.edges.filter((e) => side.has(e.u) && !side.has(e.v)).reduce((s, e) => s + e.cap, 0);
    if (total === max) count += 1;
  }
  assert.equal(count, 1);
  assert.deepEqual(cut.lines.map(lineKey).sort(), ["C-E", "F-T"]);
});

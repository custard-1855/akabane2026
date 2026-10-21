// 回線係フォードの計算。DOM に依存せず、Node 上で直接テストする

/**
 * @typedef {{ u: string, v: string, cap: number }} Line 回線。u から v へだけ送れる。cap は帯域
 * @typedef {{
 *   id: string,
 *   name: string,
 *   nodes: Record<string, [number, number]>, // 地点の座標(viewBox 1600×900)
 *   edges: Line[],
 *   start: string,                           // データセンター
 *   goal: string,                            // 利用者
 *   star2: number,                           // 送れた量がこれ以上なら★2
 * }} Stage
 * @typedef {Record<string, number>} Flow 回線の key → 送る量。送っていない回線は持たなくてよい
 * @typedef {{ key: string, forward: boolean }} Hop 層Bのルートの1区間。forward が false なら付け替え(逆向きの取り消し)
 * @typedef {{ route: string[], hops: Hop[], amount: number }} FordStep 層Bの1手
 * @typedef {{ flow: Flow, sent: { route: string[], amount: number }[], route: string[], done: boolean }} Round
 *   層Aの手番。sent は送ったルート、route は作りかけのルート(データセンターから)
 */

/** @param {Line} e */
export const lineKey = (e) => `${e.u}-${e.v}`;

/**
 * 回線の残り(帯域 − 送る量)
 * @param {Line} e
 * @param {Flow} flow
 */
export const residual = (e, flow) => e.cap - (flow[lineKey(e)] ?? 0);

/**
 * @param {Stage} stage
 * @param {string} u
 * @param {string} v
 */
const lineOf = (stage, u, v) => stage.edges.find((e) => e.u === u && e.v === v);

/**
 * 地点を順にたどるルートで、順方向だけを使って送れる量(途中の回線の残りのうち、いちばん少ない量)。
 * 向きに逆らう区間や、つながっていない区間があれば 0
 * @param {Stage} stage
 * @param {Flow} flow
 * @param {string[]} route
 */
export function routeAmount(stage, flow, route) {
  if (route.length < 2) return 0;
  let amount = Infinity;
  for (let i = 0; i + 1 < route.length; i++) {
    const e = lineOf(stage, route[i], route[i + 1]);
    if (!e) return 0;
    amount = Math.min(amount, residual(e, flow));
  }
  return Math.max(0, amount);
}

/**
 * 順方向だけで、データセンターから利用者へ、残りのある回線をたどって行けるか
 * @param {Stage} stage
 * @param {Flow} flow
 */
export function hasForwardRoute(stage, flow) {
  const seen = new Set([stage.start]);
  const queue = [stage.start];
  while (queue.length > 0) {
    const n = /** @type {string} */ (queue.shift());
    if (n === stage.goal) return true;
    for (const e of stage.edges) {
      if (e.u !== n || seen.has(e.v) || residual(e, flow) <= 0) continue;
      seen.add(e.v);
      queue.push(e.v);
    }
  }
  return false;
}

/**
 * 残余グラフで、データセンターから行ける地点。付け替え(送っている回線を逆向きにたどる)も使う
 * @param {Stage} stage
 * @param {Flow} flow
 * @returns {Map<string, Hop & { from: string }>} 地点 → そこへ来た区間
 */
function residualReach(stage, flow) {
  /** @type {Map<string, Hop & { from: string }>} */
  const came = new Map();
  const seen = new Set([stage.start]);
  const queue = [stage.start];
  while (queue.length > 0) {
    const n = /** @type {string} */ (queue.shift());
    for (const e of stage.edges) {
      // 順方向は残りがあれば、逆方向は送っている量があればたどれる
      if (e.u === n && !seen.has(e.v) && residual(e, flow) > 0) {
        seen.add(e.v);
        came.set(e.v, { key: lineKey(e), forward: true, from: n });
        queue.push(e.v);
      } else if (e.v === n && !seen.has(e.u) && (flow[lineKey(e)] ?? 0) > 0) {
        seen.add(e.u);
        came.set(e.u, { key: lineKey(e), forward: false, from: n });
        queue.push(e.u);
      }
    }
  }
  return came;
}

/**
 * フォード–ファルカーソン法。通る回線のいちばん少ないルートから順に送り、
 * 順方向のルートがなくなったら付け替え(逆向きの取り消し)を使って送る量を増やす。
 * ルートは幅優先で探す(エドモンズ–カープ法の選び方)ので、いちばん短いルートが最初に選ばれる
 * @param {Stage} stage
 * @returns {FordStep[]}
 */
export function fordFulkersonSteps(stage) {
  /** @type {Flow} */
  const flow = {};
  /** @type {FordStep[]} */
  const steps = [];
  for (;;) {
    const came = residualReach(stage, flow);
    if (!came.has(stage.goal)) return steps;
    /** @type {Hop[]} */
    const hops = [];
    const route = [stage.goal];
    for (let n = stage.goal; n !== stage.start; ) {
      const h = /** @type {Hop & { from: string }} */ (came.get(n));
      hops.unshift({ key: h.key, forward: h.forward });
      route.unshift(h.from);
      n = h.from;
    }
    const amount = Math.min(
      ...hops.map((h) => {
        const e = /** @type {Line} */ (stage.edges.find((x) => lineKey(x) === h.key));
        return h.forward ? residual(e, flow) : (flow[h.key] ?? 0);
      }),
    );
    for (const h of hops) flow[h.key] = (flow[h.key] ?? 0) + (h.forward ? amount : -amount);
    steps.push({ route, hops, amount });
  }
}

/**
 * 層Bの手を最後まで進めた送る量
 * @param {FordStep[]} steps
 * @returns {Flow}
 */
export function flowAfter(steps) {
  /** @type {Flow} */
  const flow = {};
  for (const s of steps) for (const h of s.hops) flow[h.key] = (flow[h.key] ?? 0) + (h.forward ? s.amount : -s.amount);
  return flow;
}

/** @param {Flow} flow @param {Stage} stage 利用者に届く量 */
export const totalSent = (stage, flow) =>
  stage.edges.filter((e) => e.v === stage.goal).reduce((sum, e) => sum + (flow[lineKey(e)] ?? 0), 0) -
  stage.edges.filter((e) => e.u === stage.goal).reduce((sum, e) => sum + (flow[lineKey(e)] ?? 0), 0);

/** 送れる量の最大 @param {Stage} stage */
export const maxFlow = (stage) => totalSent(stage, flowAfter(fordFulkersonSteps(stage)));

/**
 * いちばん細い切れ目。最大まで送った後、付け替えも使ってデータセンターから行ける地点と、
 * 行けない地点の間をまたぐ回線
 * @param {Stage} stage
 * @returns {{ side: Set<string>, lines: Line[], total: number }} side はデータセンター側の地点
 */
export function minCut(stage) {
  const flow = flowAfter(fordFulkersonSteps(stage));
  const side = new Set([stage.start, ...residualReach(stage, flow).keys()]);
  const lines = stage.edges.filter((e) => side.has(e.u) && !side.has(e.v));
  return { side, lines, total: lines.reduce((sum, e) => sum + e.cap, 0) };
}

/**
 * 星。★3 は最大と同じ、★2 は star2 以上、★1 はそれ以外
 * @param {number} sent
 * @param {Stage} stage
 * @returns {1 | 2 | 3}
 */
export function starsFor(sent, stage) {
  if (sent >= maxFlow(stage)) return 3;
  if (sent >= stage.star2) return 2;
  return 1;
}

/** @param {Stage} stage @returns {Round} */
export const createRound = (stage) => ({ flow: {}, sent: [], route: [stage.start], done: false });

/**
 * 層Aで地点をタップする。今いる地点から、向きに沿って残りのある回線で行ける地点だけを受け付ける。
 * 利用者に着いたら、そのルートで送れるだけ送り、データセンターからルートを作り直す。
 * 順方向のルートがもうなければ完成にする
 * @param {Stage} stage
 * @param {Round} round
 * @param {string} node
 * @returns {{ round: Round, result: "moved" | "sent" | "blocked" | "visited" | "not_next" }}
 */
export function tap(stage, round, node) {
  if (round.done) return { round, result: "not_next" };
  const here = /** @type {string} */ (round.route.at(-1));
  const e = lineOf(stage, here, node);
  if (!e) return { round, result: "not_next" };
  if (round.route.includes(node)) return { round, result: "visited" };
  if (residual(e, round.flow) <= 0) return { round, result: "blocked" };
  const route = [...round.route, node];
  if (node !== stage.goal) return { round: { ...round, route }, result: "moved" };

  const amount = routeAmount(stage, round.flow, route);
  /** @type {Flow} */
  const flow = { ...round.flow };
  for (let i = 0; i + 1 < route.length; i++) {
    const k = lineKey(/** @type {Line} */ (lineOf(stage, route[i], route[i + 1])));
    flow[k] = (flow[k] ?? 0) + amount;
  }
  return {
    round: {
      flow,
      sent: [...round.sent, { route, amount }],
      route: [stage.start],
      done: !hasForwardRoute(stage, flow),
    },
    result: "sent",
  };
}

/**
 * 送った量の合計
 * @param {Round} round
 */
export const sentTotal = (round) => round.sent.reduce((sum, s) => sum + s.amount, 0);

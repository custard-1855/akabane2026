// 電波技師ウェルシュの計算。DOM に依存せず、Node 上で直接テストする

/**
 * @typedef {{ u: string, v: string }} Pair 隣どうし(電波が届き合う2つの基地局)
 * @typedef {{
 *   id: string,
 *   name: string,
 *   nodes: Record<string, [number, number]>, // 基地局の座標(viewBox 1600×900)
 *   edges: Pair[],
 *   naturalOrder: string[],                  // 層Bの1回目に塗る、自然に見える順番
 *   star2: number,                           // 使ったチャンネルの数がこれ以下なら★2
 * }} Stage
 * @typedef {Record<string, number>} Assign 基地局 → チャンネルの番号(1から)。まだ割り当てていない基地局は持たない
 * @typedef {{ node: string, channel: number }} GreedyStep 層Bの1手
 */

/** @param {Pair} p */
export const pairKey = (p) => `${p.u}-${p.v}`;

/**
 * 混信している隣どうしの key。両方にチャンネルがあり、同じ番号のもの
 * @param {Stage} stage
 * @param {Assign} assign
 * @returns {Set<string>}
 */
export function conflicts(stage, assign) {
  return new Set(
    stage.edges.filter((p) => assign[p.u] !== undefined && assign[p.u] === assign[p.v]).map(pairKey),
  );
}

/**
 * @param {Stage} stage
 * @param {string} n
 */
const neighbors = (stage, n) => stage.edges.flatMap((p) => (p.u === n ? [p.v] : p.v === n ? [p.u] : []));

/**
 * 貪欲法。渡された順番で基地局を1つずつ見て、隣が使っていない中でいちばん小さい番号を付ける
 * @param {Stage} stage
 * @param {string[]} order
 * @returns {GreedyStep[]}
 */
export function greedySteps(stage, order) {
  /** @type {Assign} */
  const assign = {};
  return order.map((node) => {
    const used = new Set(neighbors(stage, node).map((m) => assign[m]));
    let channel = 1;
    while (used.has(channel)) channel += 1;
    assign[node] = channel;
    return { node, channel };
  });
}

/**
 * 貪欲法で使ったチャンネルの数
 * @param {GreedyStep[]} steps
 */
export const channelCount = (steps) => new Set(steps.map((s) => s.channel)).size;

/**
 * 隣どうしの多い順(ウェルシュ–パウエル法の並べ方)。同じ数なら nodes の記述順
 * @param {Stage} stage
 */
export function welshPowellOrder(stage) {
  const names = Object.keys(stage.nodes);
  const degree = (/** @type {string} */ n) => neighbors(stage, n).length;
  return names.map((n, i) => ({ n, i })).sort((a, b) => degree(b.n) - degree(a.n) || a.i - b.i).map((x) => x.n);
}

/**
 * 総当たりで、混信のない割り当てに要るチャンネルの最小の数と、そのときの割り当てを求める。
 * 小さい地図だけで使う(基地局が増えると急に遅くなる。それ自体が学習目標3)
 * @param {Stage} stage
 * @returns {{ count: number, assign: Assign }}
 */
export function minColoring(stage) {
  const names = Object.keys(stage.nodes);
  for (let k = 1; k <= names.length; k++) {
    /** @type {Assign} */
    const assign = {};
    const place = (/** @type {number} */ i) => {
      if (i === names.length) return true;
      const n = names[i];
      for (let c = 1; c <= k; c++) {
        if (neighbors(stage, n).some((m) => assign[m] === c)) continue;
        assign[n] = c;
        if (place(i + 1)) return true;
        delete assign[n];
      }
      return false;
    };
    if (place(0)) return { count: k, assign };
  }
  return { count: 0, assign: {} };
}

/**
 * 星。★3 は最小の数と同じ、★2 は star2 以下、★1 はそれ以外
 * @param {number} count 使ったチャンネルの数
 * @param {Stage} stage
 * @returns {1 | 2 | 3}
 */
export function starsFor(count, stage) {
  if (count <= minColoring(stage).count) return 3;
  if (count <= stage.star2) return 2;
  return 1;
}

/**
 * 使ったチャンネルの数
 * @param {Assign} assign
 */
export const usedChannels = (assign) => new Set(Object.values(assign)).size;

/**
 * 層Aで基地局をタップする。チャンネルが 1 → 2 → … → max → 1 と巡る
 * @param {Assign} assign
 * @param {string} node
 * @param {number} max タップで巡るチャンネルの数の上限
 * @returns {Assign}
 */
export function tap(assign, node, max) {
  const next = ((assign[node] ?? 0) % max) + 1;
  return { ...assign, [node]: next };
}

/**
 * 全部の基地局にチャンネルがあり、混信がなければ完成にできる
 * @param {Stage} stage
 * @param {Assign} assign
 */
export const canComplete = (stage, assign) =>
  Object.keys(stage.nodes).every((n) => assign[n] !== undefined) && conflicts(stage, assign).size === 0;

/**
 * 層Bの1手の字幕。それまでに使っていない番号を使う手では、隣が使っている番号を添える
 * @param {GreedyStep[]} steps
 * @param {number} i
 */
export function captionFor(steps, i) {
  const { node, channel } = steps[i];
  const before = Math.max(0, ...steps.slice(0, i).map((s) => s.channel));
  if (channel <= before) return `${node}: 隣が使っていない中でいちばん小さい ${channel} にする`;
  if (channel === 1) return `${node}: 隣が使っていない中でいちばん小さい 1 にする`;
  const used = Array.from({ length: channel - 1 }, (_, k) => k + 1).join("・");
  return `${node}: 隣が ${used} を使っているので、新しいチャンネル ${channel} を使う`;
}

// 工事士クラスカルの計算。DOM に依存せず、Node 上で直接テストする

/**
 * @typedef {{ u: string, v: string, w: number }} Road 道。w は工事費(万円)
 * @typedef {{
 *   id: string,
 *   name: string,
 *   nodes: Record<string, [number, number]>, // 局舎の座標(viewBox 1600×900)
 *   edges: Road[],
 *   star2: number,                          // 工事費の合計がこれ以下なら★2
 *   trunk?: string,                         // 見た目は幹線だが工事費の高い道(テストで使う)
 * }} Stage
 * @typedef {{ road: Road, action: "lay" | "skip" }} KruskalStep 層Bの1手。敷くか、輪になるので飛ばすか
 * @typedef {{ laid: string[], history: string[], done: boolean }} Round 層Aの手番。laid は敷いた道の key
 */

/** @param {Road} r */
export const roadKey = (r) => `${r.u}-${r.v}`;

/**
 * 局舎ごとの組の代表を返す(素集合)。つながっている局舎は同じ代表になる
 * @param {string[]} nodes
 * @param {Road[]} roads
 */
function groups(nodes, roads) {
  /** @type {Map<string, string>} */
  const parent = new Map(nodes.map((n) => [n, n]));
  const find = (/** @type {string} */ n) => {
    let r = n;
    while (parent.get(r) !== r) r = /** @type {string} */ (parent.get(r));
    return r;
  };
  for (const { u, v } of roads) parent.set(find(u), find(v));
  return find;
}

/**
 * 敷いた道だけで、全部の局舎が通信できるか
 * @param {string[]} nodes
 * @param {Road[]} roads 敷いた道
 */
export function isConnected(nodes, roads) {
  const find = groups(nodes, roads);
  return new Set(nodes.map(find)).size <= 1;
}

/**
 * 敷いた道のうち、輪の一部になっている道の key。
 * 外しても両端がつながったままの道は、輪の一部である
 * @param {Road[]} roads 敷いた道
 * @returns {Set<string>}
 */
export function cycleRoads(roads) {
  const nodes = [...new Set(roads.flatMap((r) => [r.u, r.v]))];
  const out = new Set();
  roads.forEach((r, i) => {
    const find = groups(nodes, roads.filter((_, j) => j !== i));
    if (find(r.u) === find(r.v)) out.add(roadKey(r));
  });
  return out;
}

/**
 * クラスカル法。道を工事費の安い順に見て、輪にならなければ敷き、輪になるなら飛ばす。
 * 同じ工事費の道は edges の記述順に見る
 * @param {Stage} stage
 * @returns {KruskalStep[]}
 */
export function kruskalSteps(stage) {
  const sorted = stage.edges.map((road, i) => ({ road, i })).sort((a, b) => a.road.w - b.road.w || a.i - b.i);
  const parent = new Map(Object.keys(stage.nodes).map((n) => [n, n]));
  const find = (/** @type {string} */ n) => {
    let r = n;
    while (parent.get(r) !== r) r = /** @type {string} */ (parent.get(r));
    return r;
  };
  return sorted.map(({ road }) => {
    const [a, b] = [find(road.u), find(road.v)];
    if (a === b) return { road, action: /** @type {const} */ ("skip") };
    parent.set(a, b);
    return { road, action: /** @type {const} */ ("lay") };
  });
}

/**
 * 工事費が最小の敷き方
 * @param {Stage} stage
 */
export function minimumRoads(stage) {
  return kruskalSteps(stage).filter((s) => s.action === "lay").map((s) => s.road);
}

/** @param {Road[]} roads */
export const totalCost = (roads) => roads.reduce((sum, r) => sum + r.w, 0);

/**
 * 星。★3 は最小と同じ、★2 は star2 以下、★1 はそれ以外
 * @param {number} total
 * @param {Stage} stage
 * @returns {1 | 2 | 3}
 */
export function starsFor(total, stage) {
  if (total <= totalCost(minimumRoads(stage))) return 3;
  if (total <= stage.star2) return 2;
  return 1;
}

/** @returns {Round} */
export const createRound = () => ({ laid: [], history: [], done: false });

/**
 * 敷いた道の key から道を引く
 * @param {Stage} stage
 * @param {Round} round
 */
export const laidRoads = (stage, round) => stage.edges.filter((r) => round.laid.includes(roadKey(r)));

/**
 * 道を敷く。敷いてある道なら外す。完成の後は受け付けない
 * @param {Round} round
 * @param {string} key
 * @returns {Round}
 */
export function toggle(round, key) {
  if (round.done) return round;
  const laid = round.laid.includes(key) ? round.laid.filter((k) => k !== key) : [...round.laid, key];
  return { laid, history: [...round.history, key], done: false };
}

/**
 * 「完成」を押す。全部の局舎がつながっていなければ何もしない
 * @param {Stage} stage
 * @param {Round} round
 * @returns {Round}
 */
export function complete(stage, round) {
  if (!isConnected(Object.keys(stage.nodes), laidRoads(stage, round))) return round;
  return { ...round, done: true };
}

/**
 * 1手戻る。最後に敷いた道か外した道を元に戻す。完成の後なら完成も取り消す。
 * リセットは createRound() で最初の状態に戻す
 * @param {Round} round
 * @returns {Round}
 */
export function undo(round) {
  const key = round.history.at(-1);
  if (key === undefined) return round;
  const laid = round.laid.includes(key) ? round.laid.filter((k) => k !== key) : [...round.laid, key];
  return { laid, history: round.history.slice(0, -1), done: false };
}

/**
 * 敷いた道で u から v へ行く道筋の道の key。層Bで、飛ばす道が閉じる輪を見せるのに使う
 * @param {Road[]} roads 敷いた道(輪のない形)
 * @param {string} u
 * @param {string} v
 * @returns {string[]}
 */
export function cyclePath(roads, u, v) {
  /** @type {Map<string, Road>} 局舎 → そこへ来た道 */
  const came = new Map();
  const seen = new Set([u]);
  const queue = [u];
  while (queue.length > 0) {
    const n = /** @type {string} */ (queue.shift());
    if (n === v) break;
    for (const r of roads) {
      const m = r.u === n ? r.v : r.v === n ? r.u : null;
      if (m === null || seen.has(m)) continue;
      seen.add(m);
      came.set(m, r);
      queue.push(m);
    }
  }
  if (!seen.has(v)) return [];
  const out = [];
  for (let n = v; n !== u; ) {
    const r = /** @type {Road} */ (came.get(n));
    out.push(roadKey(r));
    n = r.u === n ? r.v : r.u;
  }
  return out;
}

/** @param {Road} r 字幕に出す道の名前 */
const roadName = (r) => `${r.u}–${r.v}(${r.w}万円)`;

/**
 * 層Bの1手の字幕(docs/games.md 4.4)
 * @param {KruskalStep} step
 */
export function captionFor(step) {
  return step.action === "lay"
    ? `いちばん安い道 ${roadName(step.road)}を敷く`
    : `${roadName(step.road)}を敷くと輪になるので飛ばす`;
}

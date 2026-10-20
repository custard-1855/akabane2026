// グラフ・最短経路・ラウンド状態。DOM に依存させず、Node で直接テストする

/**
 * @typedef {import("./stages.js").Stage} Stage
 * @typedef {Map<string, Map<string, number>>} Adj
 */

export const INF = Infinity;

/**
 * 隣接表を作る。無向辺は両方向を登録する
 * @param {Stage} stage
 * @param {{ reverse?: boolean, undirected?: boolean }} [opts]
 * @returns {Adj}
 */
export function buildAdj(stage, { reverse = false, undirected = false } = {}) {
  const adj = new Map(Object.keys(stage.nodes).map((n) => [n, new Map()]));
  for (const e of stage.edges) {
    const [u, v] = reverse ? [e.v, e.u] : [e.u, e.v];
    adj.get(u).set(v, e.w);
    if (!e.directed || undirected) adj.get(v).set(u, e.w);
  }
  return adj;
}

/**
 * 確定集合を持つ O(V²) 版。数百頂点(Stage 3 大都市)まではこれで足りる。
 * 同じ距離の候補は隣接表(= nodes の記述順)で先のものを選び、結果を決定的にする
 * @param {Adj} adj
 * @param {string} s
 */
export function dijkstra(adj, s) {
  /** @type {Map<string, number>} */
  const dist = new Map([...adj.keys()].map((n) => [n, INF]));
  /** @type {Map<string, string>} */
  const prev = new Map();
  const done = new Set();
  dist.set(s, 0);
  for (;;) {
    let u = null;
    for (const [n, d] of dist) {
      if (!done.has(n) && d < INF && (u === null || d < dist.get(u))) u = n;
    }
    if (u === null) break;
    done.add(u);
    for (const [v, w] of adj.get(u)) {
      const nd = dist.get(u) + w;
      if (!done.has(v) && nd < dist.get(v)) {
        dist.set(v, nd);
        prev.set(v, u);
      }
    }
  }
  return { dist, prev };
}

/**
 * s から g への経路。到達不能なら null
 * @param {Map<string, string>} prev
 * @param {string} s
 * @param {string} g
 */
export function pathTo(prev, s, g) {
  if (g !== s && !prev.has(g)) return null;
  const path = [g];
  while (path.at(-1) !== s) path.push(prev.get(path.at(-1)));
  return path.reverse();
}

/**
 * 最短経路木の辺 [親, 子]。全地点への最短ルートを重ねると、S から枝分かれした木になる
 * @param {Map<string, string>} prev
 * @returns {[string, string][]}
 */
export function treeEdges(prev) {
  return [...prev].map(([v, u]) => [u, v]);
}

/**
 * 各ノードから goal への最短距離(層Aヒント②用)。辺を逆向きにして goal から解く
 * @param {Stage} stage
 */
export function distToGoal(stage) {
  return dijkstra(buildAdj(stage, { reverse: true }), stage.goal ?? "G").dist;
}

/**
 * from から、visited を通らずに goal へ行けるか(層Aの行き止まり判定用)
 * @param {Adj} adj
 * @param {string} from
 * @param {string} goal
 * @param {Iterable<string>} visited
 */
export function canReach(adj, from, goal, visited) {
  const seen = new Set(visited);
  const stack = [from];
  seen.add(from);
  while (stack.length > 0) {
    const u = stack.pop();
    if (u === goal) return true;
    for (const v of adj.get(u).keys()) {
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return false;
}

/** 層A(配達)のラウンド。プレイヤーがタップでルートを作る */
export class DeliveryRound {
  /** @param {Stage} stage */
  constructor(stage) {
    this.adj = buildAdj(stage);
    this.goal = stage.goal ?? "G";
    /** @type {string[]} */
    this.route = [stage.start ?? "S"];
    this.finished = false;
    this.opt = dijkstra(this.adj, this.route[0]);
    this.optCost = this.opt.dist.get(this.goal);
    this.star2 = stage.star2;
  }

  /** @param {string} n */
  tap(n) {
    // クリア後に画面がタップを渡してきても、結果を崩さない
    if (this.finished) return { kind: "invalid" };
    if (this.route.length >= 2 && n === this.route.at(-2)) {
      this.undo();
      return { kind: "undone" };
    }
    const here = this.route.at(-1);
    if (!this.adj.get(here).has(n) || this.route.includes(n)) {
      return { kind: "invalid" };
    }
    this.route.push(n);
    if (n === this.goal) {
      this.finished = true;
      return { kind: "finished" };
    }
    // 隣に未訪問の交差点があっても G へ抜けられない袋小路があるので、到達可能性で判定する
    if (!canReach(this.adj, n, this.goal, this.route)) return { kind: "stuck" };
    return { kind: "added" };
  }

  /** 1手戻る(ボタン用)。S より前には戻らない */
  undo() {
    if (!this.finished && this.route.length > 1) this.route.pop();
  }

  /** ルートの所要時間の合計 */
  cost() {
    let sum = 0;
    for (let i = 1; i < this.route.length; i++) {
      sum += this.adj.get(this.route[i - 1]).get(this.route[i]);
    }
    return sum;
  }

  /**
   * クリア後に重ねる最短ルート。プレイヤーのルートが最短ならそれを示す。
   * tie は、同じ時間のルートがほかにもあるか
   */
  ghost() {
    const start = this.route[0];
    const path =
      this.finished && this.cost() === this.optCost
        ? [...this.route]
        : pathTo(this.opt.prev, start, this.goal);
    return { path, tie: this.#countShortest(start, new Map()) > 1 };
  }

  /**
   * u から goal への最短ルートの本数。札がちょうど一致する辺(dist[u] + w == dist[v])だけをたどる
   * @param {string} u
   * @param {Map<string, number>} memo
   */
  #countShortest(u, memo) {
    if (u === this.goal) return 1;
    if (memo.has(u)) return memo.get(u);
    const { dist } = this.opt;
    let count = 0;
    for (const [v, w] of this.adj.get(u)) {
      if (dist.get(u) + w === dist.get(v)) count += this.#countShortest(v, memo);
    }
    memo.set(u, count);
    return count;
  }

  /** 経路ではなくコストで判定する。同点の最短ルートはどれでも★3 */
  stars() {
    const c = this.cost();
    if (c === this.optCost) return 3;
    if (c <= this.star2) return 2;
    return 1;
  }
}

/**
 * 層B(管制室)のラウンド。札が最小の候補を確定し、隣の札を書き換えるのを繰り返す。
 * 管制室ではこれを自動で1手ずつ進めて見せ、大都市では一気に回す
 */
export class ControlRound {
  /** @param {Stage} stage */
  constructor(stage) {
    this.adj = buildAdj(stage);
    this.start = stage.start ?? "S";
    this.goal = stage.goal ?? "G";
    /** 札。S から、今わかっている中でいちばん早い時間 */
    this.dist = new Map([...this.adj.keys()].map((n) => [n, INF]));
    this.dist.set(this.start, 0);
    /** @type {Map<string, string>} */
    this.prev = new Map();
    /** @type {Set<string>} */
    this.done = new Set();
  }

  /** 未確定かつ札が有限のノード(nodes の記述順) */
  candidates() {
    return [...this.dist].filter(([n, d]) => !this.done.has(n) && d < INF).map(([n]) => n);
  }

  /** 次に確定する交差点。札が最小の候補で、同値なら nodes の記述順で先のもの(dijkstra() と同じ) */
  next() {
    const cands = this.candidates();
    if (cands.length === 0) return null;
    return cands.reduce((a, b) => (this.dist.get(b) < this.dist.get(a) ? b : a));
  }

  /** 行ける交差点をすべて確定し終えたか */
  get finished() {
    return this.next() === null;
  }

  /** 札が最小の候補を1つ確定し、隣の札を書き換える。確定し終えていたら null */
  step() {
    const n = this.next();
    if (n === null) return null;
    this.done.add(n);
    const relaxations = [];
    for (const [v, w] of this.adj.get(n)) {
      if (this.done.has(v)) continue;
      const from = this.dist.get(v);
      const cand = this.dist.get(n) + w;
      const updated = cand < from;
      if (updated) {
        this.dist.set(v, cand);
        this.prev.set(v, n);
      }
      relaxations.push({ node: v, via: n, from, cand, updated });
    }
    return { node: n, relaxations };
  }
}

/**
 * start から全地点を自動で解く(Stage 3 大都市)。管制室と同じ手順を一気に回す。
 * order は確定した順で、波紋の演出にそのまま使う。prev は、お届け先までのルートを出すのに使う
 * @param {Stage} stage
 * @param {string} start
 */
export function solveFrom(stage, start) {
  const round = new ControlRound({ ...stage, start });
  /** @type {string[]} */
  const order = [];
  for (let r = round.step(); r !== null; r = round.step()) order.push(r.node);
  return { order, dist: round.dist, prev: round.prev };
}

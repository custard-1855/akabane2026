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
 * 確定集合を持つ O(V²) 版。数百頂点(Stage 7)まではこれで足りる。
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
 * 層B(管制室)のラウンド。プレイヤーが確定する交差点を選び、緩和はゲームが行う。
 * 確定集合を持つ教科書どおりのダイクストラ法なので、自動実行にもそのまま使える
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
    this.mistakes = 0;
    this.finished = false;
    /** 正解。not_min の理由を求めるのに使う */
    this.opt = dijkstra(this.adj, this.start);
  }

  /** 未確定かつ札が有限のノード(nodes の記述順) */
  candidates() {
    return [...this.dist].filter(([n, d]) => !this.done.has(n) && d < INF).map(([n]) => n);
  }

  /** @param {string} n */
  settle(n) {
    // already と unreached は押し間違いの可能性が高いので、ミスに数えない
    if (this.done.has(n)) return { kind: "already" };
    if (this.dist.get(n) === INF) return { kind: "unreached" };
    // 値が後で実際に覆るかではなく、規則(札が最小か)で判定する。
    // 結果で判定すると「最小を選べば必ず正しい」という保証を教えられない
    const m = Math.min(...this.candidates().map((c) => this.dist.get(c)));
    if (this.dist.get(n) > m) {
      this.mistakes++;
      return { kind: "not_min", reason: this.#whyNotMin(n, m) };
    }
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
    if (n === this.goal) this.finished = true;
    return { kind: "settled", relaxations };
  }

  stars() {
    if (this.mistakes === 0) return 3;
    if (this.mistakes <= 2) return 2;
    return 1;
  }

  /**
   * 札が最小でない n を選べない理由。札がたまたま正しい場合と、後で覆る場合に分ける
   * @param {string} n
   * @param {number} m 候補の札の最小値
   */
  #whyNotMin(n, m) {
    const best = this.opt.dist.get(n);
    if (this.dist.get(n) === best) {
      const minNodes = this.candidates().filter((c) => this.dist.get(c) === m);
      return { kind: "lucky", minNodes };
    }
    // 最短ルート上で最初の未確定ノード c は、1つ手前が確定済みなのですでに候補で、
    // 札は本当の最短に等しい。よって dist[c] <= best < dist[n] となる
    const route = pathTo(this.opt.prev, this.start, n);
    const i = route.findIndex((v) => !this.done.has(v));
    const via = route[i];
    return { kind: "overturn", via, viaDist: this.dist.get(via), best, path: route.slice(i) };
  }
}

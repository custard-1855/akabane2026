// グラフ・最短経路・ラウンド状態。DOM に依存しない(設計書 3.4〜3.6)

/**
 * @typedef {{ u: string, v: string, w: number, directed?: boolean, kind?: "road" | "highway" }} Edge
 * @typedef {{
 *   id: string,                            // 進捗保存のキー。並べ替えや追加で変えない
 *   name: string, desc: string,
 *   nodes: Record<string, [number, number]>, // 名前 → 座標(viewBox 800×500 基準)
 *   edges: Edge[],
 *   expectedCost: number,                  // 設計値。テストで dijkstra() と照合する
 *   star2: number,                         // 層Aで★2となるコストの上限
 *   start?: string, goal?: string,         // 既定は "S" と "G"
 * }} Stage
 * @typedef {Map<string, Map<string, number>>} Adj
 */

export const INF = Infinity;

export const startOf = (stage) => stage.start ?? "S";
export const goalOf = (stage) => stage.goal ?? "G";

/** 隣接表: Map<u, Map<v, weight>>(無向辺は両方向を登録) */
export function buildAdj(stage, { reverse = false, undirected = false } = {}) {
  const adj = new Map(Object.keys(stage.nodes).map((n) => [n, new Map()]));
  for (const e of stage.edges) {
    const [u, v] = reverse ? [e.v, e.u] : [e.u, e.v];
    adj.get(u).set(v, e.w);
    if (!e.directed || undirected) adj.get(v).set(u, e.w);
  }
  return adj;
}

// 確定集合を持つ O(V²) 版。数百頂点(Stage 7)まではこれで足りる
export function dijkstra(adj, s) {
  const dist = new Map([...adj.keys()].map((n) => [n, INF]));
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

/** s から g への経路。到達不能なら null */
export function pathTo(prev, s, g) {
  if (g !== s && !prev.has(g)) return null;
  const path = [g];
  while (path.at(-1) !== s) path.push(prev.get(path.at(-1)));
  return path.reverse();
}

/**
 * 各ノードから goal への最短距離(層Aヒント②用)。辺を逆向きにして goal から解く。
 * exclude のノードは通れないものとして扱う(層Aで通過済みの交差点)。
 */
export function distToGoal(stage, { exclude = [] } = {}) {
  const adj = buildAdj(stage, { reverse: true });
  for (const n of exclude) {
    adj.delete(n);
    for (const m of adj.values()) m.delete(n);
  }
  const dist = dijkstra(adj, goalOf(stage)).dist;
  for (const n of exclude) dist.set(n, INF);
  return dist;
}

/**
 * ステージの正解。ステージ読込時に1回だけ計算する。
 * @param {Stage} stage
 */
export function solveStage(stage) {
  const adj = buildAdj(stage);
  const { dist, prev } = dijkstra(adj, startOf(stage));
  const path = pathTo(prev, startOf(stage), goalOf(stage));
  return { adj, dist, prev, path, cost: dist.get(goalOf(stage)) };
}

/** 層Aの星(設計書 2.5)。ヒント③を使ったら★1が上限 */
export function deliveryStars(cost, opt, star2, usedAnswer = false) {
  if (usedAnswer) return 1;
  if (cost === opt) return 3;
  if (cost <= star2) return 2;
  return 1;
}

/** 層Bの星(設計書 2.5) */
export function controlStars(mistakes, usedAnswer = false) {
  if (usedAnswer) return 1;
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

/** 層A: 配達モード */
export class DeliveryRound {
  /** @param {Stage} stage */
  constructor(stage, solved = solveStage(stage)) {
    this.stage = stage;
    this.adj = solved.adj;
    this.opt = solved;
    this.start = startOf(stage);
    this.goal = goalOf(stage);
    /** @type {string[]} */
    this.route = [this.start];
    this.finished = false;
    this.hintLevelUsed = 0;
  }

  current() {
    return this.route.at(-1);
  }

  /** n から進める未訪問の交差点 */
  nextOptions(n = this.current()) {
    return [...this.adj.get(n).keys()].filter((v) => !this.route.includes(v));
  }

  /**
   * @returns {{ kind: "added" | "undone" | "invalid" | "stuck" | "finished" | "ignored",
   *             node: string, reason?: "no_edge" | "oneway" | "visited" | "current" }}
   */
  tap(n) {
    if (this.finished) return { kind: "ignored", node: n };
    const cur = this.current();
    if (this.route.length >= 2 && n === this.route.at(-2)) {
      this.route.pop();
      return { kind: "undone", node: n };
    }
    if (this.adj.get(cur).has(n) && !this.route.includes(n)) {
      this.route.push(n);
      if (n === this.goal) {
        this.finished = true;
        return { kind: "finished", node: n };
      }
      if (this.nextOptions(n).length === 0) return { kind: "stuck", node: n };
      return { kind: "added", node: n };
    }
    let reason = "no_edge";
    if (n === cur) reason = "current";
    else if (this.route.includes(n)) reason = "visited";
    else if (this.adj.get(n).has(cur)) reason = "oneway";
    return { kind: "invalid", node: n, reason };
  }

  /** 1手戻る。戻れたら true */
  undo() {
    if (this.finished || this.route.length < 2) return false;
    this.route.pop();
    return true;
  }

  cost() {
    let c = 0;
    for (let i = 1; i < this.route.length; i++) c += this.adj.get(this.route[i - 1]).get(this.route[i]);
    return c;
  }

  stars() {
    if (!this.finished) return null;
    return deliveryStars(this.cost(), this.opt.cost, this.stage.star2, this.hintLevelUsed >= 3);
  }

  /**
   * 段階ヒント(設計書 2.6)。光らせるノードを返す。
   * ① 進める交差点 ② 現在地からGへの最短で次に進む交差点 ③ 最短ルート(★1上限)
   * @returns {{ nodes: string[], path?: string[] }}
   */
  hint(level) {
    if (this.finished) return { nodes: [] };
    this.hintLevelUsed = Math.max(this.hintLevelUsed, level);
    const options = this.nextOptions();
    if (level === 1) return { nodes: options };
    if (level === 2) {
      const toGoal = distToGoal(this.stage, { exclude: this.route.slice(0, -1) });
      const cur = this.current();
      const score = (v) => this.adj.get(cur).get(v) + toGoal.get(v);
      const best = Math.min(...options.map(score));
      if (best === INF) return { nodes: [] };
      return { nodes: options.filter((v) => score(v) === best) };
    }
    return { nodes: this.opt.path, path: this.opt.path };
  }
}

/** 層B: 管制室モード。確定集合を持つ教科書どおりのダイクストラ法 */
export class ControlRound {
  /** @param {Stage} stage */
  constructor(stage, solved = solveStage(stage)) {
    this.stage = stage;
    this.adj = solved.adj;
    this.start = startOf(stage);
    this.goal = goalOf(stage);
    this.dist = new Map([...this.adj.keys()].map((n) => [n, INF]));
    this.dist.set(this.start, 0);
    this.prev = new Map();
    this.done = new Set();
    this.mistakes = 0;
    this.finished = false;
    this.hintLevelUsed = 0;
    /** 確定済みノードの札が後から改善された記録(負の辺があるときだけ起きる。Phase 2 の失敗デモ用) */
    this.violations = [];
  }

  /** 未確定かつ札が有限のノード(ノードの記述順) */
  candidates() {
    return [...this.dist].filter(([n, d]) => !this.done.has(n) && d < INF).map(([n]) => n);
  }

  /** 候補のうち札が最小のもの(同値なら全部) */
  minCandidates() {
    const c = this.candidates();
    const m = Math.min(...c.map((n) => this.dist.get(n)));
    return c.filter((n) => this.dist.get(n) === m);
  }

  allDone() {
    return this.candidates().length === 0;
  }

  /**
   * @returns {{ kind: "settled" | "already" | "unreached" | "not_min", node: string,
   *             updates?: { node: string, from: number, to: number }[], min?: number, goalReached?: boolean }}
   */
  settle(n) {
    if (this.done.has(n)) return { kind: "already", node: n };
    const dn = this.dist.get(n);
    if (dn === INF) return { kind: "unreached", node: n };
    const m = Math.min(...this.candidates().map((c) => this.dist.get(c)));
    if (dn > m) {
      // クリア後の「続けて全地点を確定」は採点対象外
      if (!this.finished) this.mistakes++;
      return { kind: "not_min", node: n, min: m };
    }
    this.done.add(n);
    const updates = [];
    for (const [v, w] of this.adj.get(n)) {
      const nd = dn + w;
      if (nd >= this.dist.get(v)) continue;
      if (this.done.has(v)) {
        this.violations.push({ node: v, from: this.dist.get(v), to: nd, via: n });
        continue;
      }
      updates.push({ node: v, from: this.dist.get(v), to: nd });
      this.dist.set(v, nd);
      this.prev.set(v, n);
    }
    // 表示はノードの記述順にそろえる
    const order = [...this.dist.keys()];
    updates.sort((a, b) => order.indexOf(a.node) - order.indexOf(b.node));
    const goalReached = n === this.goal && !this.finished;
    if (goalReached) this.finished = true;
    return { kind: "settled", node: n, updates, goalReached };
  }

  stars() {
    if (!this.finished) return null;
    return controlStars(this.mistakes, this.hintLevelUsed >= 3);
  }

  /**
   * 段階ヒント(設計書 2.6)。
   * ① 候補を光らせる ② 候補のうち札が最小のもの ③ 正解を1手自動で確定(★1上限)
   * @returns {{ nodes: string[], result?: ReturnType<ControlRound["settle"]> }}
   */
  hint(level) {
    if (this.allDone()) return { nodes: [] };
    if (!this.finished) this.hintLevelUsed = Math.max(this.hintLevelUsed, level);
    if (level === 1) return { nodes: this.candidates() };
    const best = this.minCandidates();
    if (level === 2) return { nodes: best };
    return { nodes: [best[0]], result: this.settle(best[0]) };
  }
}

/** 札の更新を1行にまとめる(例: "A: ∞→4, B: ∞→3") */
export function formatUpdates(updates) {
  const f = (d) => (d === INF ? "∞" : String(d));
  return updates.map((u) => `${u.node}: ${f(u.from)}→${f(u.to)}`).join(", ");
}

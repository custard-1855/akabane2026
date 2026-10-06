// 回転するグラフと、その上を伝わる信号の状態。時間を進める(update)が、描き方と DOM は知らない
import { ALGOS, type Algo, type AlgoId, type SceneEvent } from "./algorithms";
import { BASE_TILT, CFG } from "./config";
import { fullerene, geodesic, hypercube, toGraph, torus, type Shape } from "./graphs";
import { clamp, type Vec3 } from "./math";
import { PAL } from "./palette";

/** 見せる形と、クリックで実行する処理 */
export type ShowcaseShape = Shape & { algo: AlgoId };

/** 形ごとに、その形の特徴がよく見える処理を割り当てる */
export function showcase(): ShowcaseShape[] {
  return [
    { ...fullerene(), algo: "edges" }, // 辺がちょうど3色で塗り分けられる
    { ...torus(), algo: "bfs" }, // 波が輪を回り込み、反対側でぶつかる
    { ...hypercube(), algo: "bipartite" }, // 4つの中で唯一、2色で塗れる
    { ...geodesic(), algo: "three" }, // 3色では塗れず、4色で塗り直す
  ];
}

/** 辺 a→b を伝わる常時の信号 */
export type Pulse = {
  a: number;
  b: number;
  t: number;
  dur: number;
  ci: number;
  ttl: number;
  id: number;
};
/** クリックで起こした処理の再生 */
export type Wave = {
  src: number;
  events: SceneEvent[];
  last: number;
  t: number;
  end: number;
  c0: number;
};
export type NodeState = { p: Vec3; ci: number; heat: number; flash: number; last: number };
/** 画面に投影した頂点。k は遠近の倍率、d は手前ほど 1 に近い奥行き */
export type Projected = { x: number; y: number; k: number; d: number };

export type SceneHooks = {
  /** 形を読み込んだ */
  onShapeLoad(shape: ShowcaseShape): void;
  /** クリックで処理を始めた */
  onAlgoStart(algo: Algo): void;
  /** 処理の再生が終わっている(毎フレーム呼ぶ) */
  onAlgoIdle(): void;
};

export class Scene {
  list = showcase();
  si = 0;
  /** 検証用に固定した形の番号(null は自動の切り替え) */
  lock: number | null = null;
  rot = 0;
  tilt = BASE_TILT;
  vRot = 0;
  vTilt = 0;
  cid = 0;
  shapeT = 0;
  fade = 1;
  dragging = false;
  idle = 99;
  hover = -1;
  hoverA = 0;
  hoverOn = false;
  ptr = { x: 0, y: 0, inside: false, mouse: false };

  shape!: ShowcaseShape;
  n = 0;
  nbrs: number[][] = [];
  len = new Map<number, number>();
  pulses: Pulse[] = [];
  waves: Wave[] = [];
  timer = 0;
  nodes: NodeState[] = [];
  proj: Projected[] = [];

  constructor(
    private readonly hooks: SceneHooks,
    private readonly reduceMotion: boolean,
  ) {
    this.load(this.list[0]);
  }

  load(shape: ShowcaseShape) {
    const { n, nbrs, len } = toGraph(shape);
    Object.assign(this, {
      shape,
      n,
      nbrs,
      len,
      pulses: [],
      waves: [],
      timer: 0,
      hover: -1,
      hoverA: 0,
    });
    this.nodes = shape.nodes.map((p) => ({ p, ci: 0, heat: 0, flash: 0, last: -1 }));
    this.proj = this.nodes.map(() => ({ x: 0, y: 0, k: 1, d: 0 }));
    this.hooks.onShapeLoad(shape);
    for (let i = 0; i < 3; i++) this.emit((Math.random() * n) | 0);
  }

  pulse(a: number, b: number, ci: number, ttl: number, id: number): Pulse {
    return { a, b, t: 0, dur: 0.3 + this.len.get(a * this.n + b)! * CFG.pace, ci, ttl, id };
  }

  // 環境の信号: ランダムに枝分かれしながら伝わる
  emit(i: number) {
    const ci = PAL.AMB,
      id = ++this.cid;
    Object.assign(this.nodes[i], { ci, heat: 1, flash: 1.4, last: id });
    for (const j of this.nbrs[i]) this.pulses.push(this.pulse(i, j, ci, CFG.ttl, id));
  }

  // クリック: 選んだ処理を実際に実行し、出来事の列を起きた順に再生する
  start(src: number, algo: Algo) {
    const { ev } = algo.run(this, src);
    const events = ev.sort((x, y) => x.t - y.t);
    const last = Math.max(...events.map((e) => e.t + (e.dur || 0)));
    const wave: Wave = {
      src,
      events,
      last,
      t: 0,
      end: last + 3,
      c0: events[0] ? Math.max(0, events[0].c) : 1,
    };
    this.waves = [wave];
    return wave;
  }

  update(dt: number) {
    this.idle += dt;
    if (!this.dragging) {
      // 手を離したあとは慣性で回り、やがて自動回転に戻る
      const decay = Math.exp(-dt * 2.5);
      this.vRot *= decay;
      this.vTilt *= decay;
      this.rot += dt * (CFG.spin + this.vRot);
      this.tilt = clamp(this.tilt + dt * this.vTilt, -1.2, 1.2);
      if (this.idle > 2) this.tilt += (BASE_TILT - this.tilt) * Math.min(1, dt * 0.5);
    }
    this.timer += dt;
    if (this.timer > CFG.interval) {
      this.timer = 0;
      if (!this.waves.length) this.emit((Math.random() * this.n) | 0);
    }
    // 触っている間と探索の波が出ている間は、形を切り替えない
    if (this.lock === null && !this.dragging && !this.waves.length && this.idle > 4)
      this.shapeT += dt;
    if (this.shapeT > CFG.hold) {
      this.fade = Math.max(0, this.fade - dt * 1.5);
      if (this.fade === 0) {
        this.si = (this.si + 1) % this.list.length;
        this.load(this.list[this.si]);
        this.shapeT = 0;
      }
    } else {
      this.fade = Math.min(1, this.fade + dt * 1.5);
    }
    for (const w of this.waves) w.t += dt;
    this.waves = this.waves.filter((w) => w.t < w.end);
    if (!this.waves.length) this.hooks.onAlgoIdle();
    const next: Pulse[] = [];
    for (const q of this.pulses) {
      q.t += dt;
      if (q.t < q.dur) {
        next.push(q);
        continue;
      }
      const node = this.nodes[q.b];
      if (node.last === q.id) continue;
      Object.assign(node, { ci: q.ci, heat: 1, flash: 1, last: q.id });
      if (q.ttl <= 0) continue;
      for (const k of this.nbrs[q.b]) {
        if (k === q.a || Math.random() > CFG.branch || next.length > CFG.maxPulses) continue;
        next.push(this.pulse(q.b, k, q.ci, q.ttl - 1, q.id));
      }
    }
    this.pulses = next;
    const cool = Math.exp(-dt * 0.15),
      fl = Math.exp(-dt * 2.4);
    for (const nd of this.nodes) {
      nd.heat *= cool;
      nd.flash *= fl;
    }
    this.hoverA += ((this.hoverOn ? 1 : 0) - this.hoverA) * Math.min(1, dt * 8);
  }

  // 検証用: 形を選んで固定する(null で自動の切り替えに戻す)
  setShape(i: number | null) {
    this.lock = i;
    if (i === null) {
      this.shapeT = 0;
      return;
    }
    this.si = i;
    this.load(this.list[i]);
    this.shapeT = 0;
    this.fade = 0;
  }

  // 信号を3秒ぶん進める(形は切り替えない)
  settle() {
    for (let i = 0; i < 90; i++) {
      this.shapeT = 0;
      this.update(1 / 30);
    }
    this.fade = 1;
  }

  nearest(x: number, y: number, radius: number) {
    let best = -1,
      bd = radius * radius;
    this.proj.forEach((q, i) => {
      const d = (q.x - x) ** 2 + (q.y - y) ** 2 - q.d * 300;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  click(x: number, y: number) {
    this.idle = 0;
    const i = this.nearest(x, y, 80);
    if (i < 0) return;
    const algo = ALGOS[this.shape.algo];
    this.hooks.onAlgoStart(algo);
    const w = this.start(i, algo);
    if (this.reduceMotion) w.t = w.last;
  }
}

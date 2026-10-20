// 輻輳デモ(設計書 2.4)。配達車は出発時点の所要時間で最短ルートを決める。DOM に依存させず、Node で直接テストする

import { buildAdj, dijkstra, pathTo } from "./logic.js";

/**
 * @typedef {import("./stages.js").Stage} Stage
 * @typedef {{ route: string[], leg: number, elapsed: number, duration: number }} Car
 *   leg は route の何本目の道にいるか、elapsed と duration はその道に入ってからの ms と抜けるまでの ms
 */

/** 道の名前。混雑は向きによらず道ごとに数える */
const road = (u, v) => (u < v ? `${u}-${v}` : `${v}-${u}`);

export class Traffic {
  /**
   * @param {Stage} stage
   * @param {{ slowdown?: number, msPerMinute?: number }} [opts]
   *   slowdown は1台ごとに所要時間が延びる割合、msPerMinute は所要時間 1分を走る ms
   */
  constructor(stage, { slowdown = 0.5, msPerMinute = 60 } = {}) {
    this.stage = stage;
    this.slowdown = slowdown;
    this.msPerMinute = msPerMinute;
    /** @type {Map<string, number>} もとの所要時間 */
    this.base = new Map(stage.edges.map((e) => [road(e.u, e.v), e.w]));
    /** @type {Map<string, number>} 道にいる配達車の数 */
    this.load = new Map();
    /** @type {Car[]} */
    this.cars = [];
  }

  /**
   * いまの所要時間。もとの所要時間 × (1 + slowdown × 道にいる台数)
   * @param {string} u
   * @param {string} v
   */
  travelTime(u, v) {
    const r = road(u, v);
    return this.base.get(r) * (1 + this.slowdown * (this.load.get(r) ?? 0));
  }

  /**
   * from から to へ配達車を出す
   * @param {string} from
   * @param {string} to
   */
  dispatch(from, to) {
    const now = { ...this.stage, edges: this.stage.edges.map((e) => ({ ...e, w: this.travelTime(e.u, e.v) })) };
    const { prev } = dijkstra(buildAdj(now), from);
    /** @type {Car} */
    const car = { route: pathTo(prev, from, to), leg: 0, elapsed: 0, duration: 0 };
    this.#enter(car);
    this.cars.push(car);
    return car;
  }

  /**
   * 時間を進める。道を抜けた配達車は次の道に入り、お届け先に着いたら消える
   * @param {number} ms
   */
  advance(ms) {
    for (const car of this.cars) {
      car.elapsed += ms;
      while (car.elapsed >= car.duration && !this.#arrived(car)) {
        car.elapsed -= car.duration;
        this.#leave(car);
        car.leg += 1;
        if (!this.#arrived(car)) this.#enter(car);
      }
    }
    this.cars = this.cars.filter((car) => !this.#arrived(car));
  }

  #arrived(car) {
    return car.leg === car.route.length - 1;
  }

  /** 道に入る。入ったときの所要時間で走りきる */
  #enter(car) {
    const [u, v] = [car.route[car.leg], car.route[car.leg + 1]];
    car.duration = this.travelTime(u, v) * this.msPerMinute;
    const r = road(u, v);
    this.load.set(r, (this.load.get(r) ?? 0) + 1);
  }

  #leave(car) {
    const r = road(car.route[car.leg], car.route[car.leg + 1]);
    this.load.set(r, this.load.get(r) - 1);
  }
}

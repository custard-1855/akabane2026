// 管制室の緩和の1本ずつの表示。確定した交差点から出る道ごとに、計算と書き換えたかを文にする。
// DOM に依存させず、Node で直接テストする

import { AUTO_SETTLE_MS, RELAX_EDGE_MS } from "./config.js";

/**
 * @typedef {{ node: string, via: string, from: number, cand: number, updated: boolean }} Relaxation
 * @typedef {{ via: string, node: string, updated: boolean, text: string }} RelaxLine
 */

const fmt = (/** @type {number} */ d) => (Number.isFinite(d) ? String(d) : "∞");

/**
 * step() の結果を、道1本ずつの文にする。「そのまま」の道も含める(書き換えるのは早くなるときだけ、を見せるため)
 * @param {{ node: string, relaxations: Relaxation[] }} r
 * @param {number} base 確定した交差点の札
 * @returns {RelaxLine[]}
 */
export function relaxLines(r, base) {
  return r.relaxations.map((x) => {
    const calc = `${x.node}: ${base}+${x.cand - base}=${x.cand}、今の札は ${fmt(x.from)}`;
    return {
      via: x.via,
      node: x.node,
      updated: x.updated,
      text: x.updated ? `${calc} → ${x.cand} に書き換え` : `${calc} → そのまま`,
    };
  });
}

/**
 * 1手の間隔。道を1本ずつ見せ終えるまで次の確定を待つ
 * @param {number} edges その手で見せる道の本数
 */
export function stepInterval(edges) {
  return Math.max(AUTO_SETTLE_MS, edges * RELAX_EDGE_MS);
}

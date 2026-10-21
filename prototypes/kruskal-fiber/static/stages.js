// 試作の1ステージ(docs/games.md 4.6)。条件は tests/stage.test.js で確かめる

/** @typedef {import("./logic.js").Stage} Stage */

const road = (/** @type {string} */ u, /** @type {string} */ v, /** @type {number} */ w) => ({ u, v, w });

/**
 * 工事費は道の長さに比例させない。最小は 40万円(次に安い敷き方は 42万円)。
 * A-B-E は安い道だけでできる輪で、クラスカル法は B-E を飛ばす。
 * E-G は真ん中を横切る長い道(幹線)で、使うと最良でも 43万円になり★1
 * @type {Stage}
 */
export const STAGE = {
  id: "hills",
  name: "丘の街",
  nodes: {
    A: [200, 220],
    B: [580, 130],
    C: [1030, 130],
    D: [1400, 230],
    E: [230, 540],
    F: [800, 340],
    G: [1370, 540],
    H: [560, 790],
    I: [1040, 790],
  },
  edges: [
    road("A", "B", 3),
    road("B", "C", 15),
    road("C", "D", 4),
    road("A", "E", 2),
    road("B", "E", 5),
    road("B", "F", 6),
    road("C", "F", 8),
    road("F", "E", 13),
    road("F", "G", 10),
    road("C", "G", 7),
    road("D", "G", 14),
    road("E", "H", 1),
    road("H", "I", 9),
    road("I", "G", 12),
    road("E", "G", 11),
  ],
  star2: 42,
  trunk: "E-G",
};

// 試作の1ステージ(docs/games.md 5.6)。条件は tests/stage.test.js で確かめる

/** @typedef {import("./logic.js").Stage} Stage */

const pair = (/** @type {string} */ u, /** @type {string} */ v) => ({ u, v });

/**
 * 最小のチャンネル数は3。基地局の名前は左から順に A〜J とし、
 * その順(自然に見える順番)で貪欲法を進めると E で4つ目を使う。隣どうしの多い順なら3つで済む
 * @type {Stage}
 */
export const STAGE = {
  id: "harbor",
  name: "港の街",
  nodes: {
    A: [150, 755],
    B: [330, 254],
    C: [377, 746],
    D: [647, 206],
    E: [658, 683],
    F: [865, 504],
    G: [1086, 502],
    H: [1127, 150],
    I: [1345, 355],
    J: [1450, 770],
  },
  edges: [
    pair("A", "B"),
    pair("A", "C"),
    pair("B", "C"),
    pair("B", "D"),
    pair("B", "E"),
    pair("C", "E"),
    pair("D", "E"),
    pair("D", "F"),
    pair("E", "F"),
    pair("F", "G"),
    pair("F", "H"),
    pair("G", "H"),
    pair("G", "I"),
    pair("G", "J"),
    pair("H", "I"),
    pair("I", "J"),
  ],
  naturalOrder: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  star2: 4,
};

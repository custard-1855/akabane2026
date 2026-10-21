// 試作の1ステージ(docs/games.md 6.6)。条件は tests/stage.test.js で確かめる

/** @typedef {import("./logic.js").Stage} Stage */

const line = (/** @type {string} */ u, /** @type {string} */ v, /** @type {number} */ cap) => ({ u, v, cap });

/**
 * 上の列 S→A→C→E→T と下の列 S→B→D→F→T の間に、近道 A→F を置く。
 * いちばん短いルート S→A→F→T(回線3本)で先に送ると、S→A と F→T が両方埋まって 5 で行き詰まる。
 * 上の列から送れば付け替えなしで最大の 8 に届く。いちばん細い切れ目は C→E と F→T(3 + 5 = 8)
 * @type {Stage}
 */
export const STAGE = {
  id: "bay",
  name: "湾岸の街",
  nodes: {
    S: [240, 450],
    A: [520, 230],
    C: [800, 230],
    E: [1080, 230],
    B: [520, 670],
    D: [800, 670],
    F: [1080, 670],
    T: [1360, 450],
  },
  edges: [
    line("S", "A", 5),
    line("A", "C", 5),
    line("C", "E", 3),
    line("E", "T", 5),
    line("S", "B", 5),
    line("B", "D", 5),
    line("D", "F", 5),
    line("F", "T", 5),
    line("A", "F", 5),
  ],
  start: "S",
  goal: "T",
  star2: 7,
};

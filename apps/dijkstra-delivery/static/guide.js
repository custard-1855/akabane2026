// Stage 1 の配達の案内。最初の1手だけ、光らせる交差点と字幕で一緒に進める。DOM に依存させず、Node で直接テストする

/**
 * @typedef {import("./stages.js").Stage} Stage
 * @typedef {import("./logic.js").DeliveryRound} DeliveryRound
 * @typedef {{ nodes: string[], caption: string }} GuideStep
 */

/**
 * 今の盤面での案内。案内しない盤面では null。
 * 管制室は自動で進み、確定するたびに字幕で説明するので、案内は配達だけにする
 * @param {Stage} stage
 * @param {DeliveryRound} d
 * @returns {GuideStep | null}
 */
export function guideStep(stage, d) {
  // 字幕が Stage 1 の地図を前提にしているので、ほかのステージには出さない
  if (stage.id !== "downtown") return null;
  if (d.route.length === 1) {
    // どれか1つを勧めると、目先で選ぶ癖を試す機会がなくなるので、隣を全部同じように光らせる
    return {
      nodes: [...d.adj.get(d.route[0]).keys()],
      caption: "S の隣の交差点をタップして進もう。道の数字は所要時間",
    };
  }
  if (d.route.length === 2) {
    return {
      nodes: [],
      caption: "通った道の時間が足されていく。戻りたいときは、1つ前の交差点か「1手戻る」",
    };
  }
  return null;
}

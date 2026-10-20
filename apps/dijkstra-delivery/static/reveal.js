// 種明かし。層を終えるたびに、ゲームの言葉を正式な用語と結びつける。DOM に依存させず、Node で直接テストする
// 文面は仮(設計書 2.8。10/26 までに仕上げる)

/**
 * @typedef {import("./stages.js").Stage} Stage
 * @typedef {{ game: string, term: string, note: string }} RevealItem
 */

/** @type {Record<string, Partial<Record<"A" | "B" | "C", RevealItem[]>>>} */
const REVEALS = {
  downtown: {
    A: [
      { game: "交差点", term: "頂点(ノード)", note: "点と線でつながりを表したものを「グラフ」と呼ぶ" },
      { game: "道", term: "辺(エッジ)", note: "2つの頂点を結ぶ線" },
      { game: "所要時間", term: "重み", note: "時間でなくても、料金や距離でもよい" },
    ],
    B: [
      { game: "札", term: "暫定距離(ラベル)", note: "今わかっている中でいちばん短い距離のメモ" },
      { game: "札の書き換え", term: "緩和", note: "早く着ける行き方が見つかったときだけ書き換える" },
      {
        game: "管制室が進めた手順",
        term: "ダイクストラ法(1959年)",
        note: "札がいちばん小さい頂点から確定していく。カーナビやインターネットの経路選びにも使われる",
      },
      {
        game: "全地点への最短ルートを重ねたもの",
        term: "最短経路木",
        note: "S から枝分かれして、輪にならない「木」の形になる",
      },
    ],
  },
  residential: {
    A: [
      {
        game: "最初にいちばん近い道を選ぶやり方",
        term: "貪欲法",
        note: "目先の一手だけで選ぶと損をすることがある。ダイクストラ法は、道1本の近さではなく、S からの合計で近い順に決める",
      },
    ],
  },
};

/**
 * その層を終えたあとに出す種明かし。出す用語のない層では null
 * @param {Stage} stage
 * @param {"A" | "B" | "C"} mode
 * @returns {RevealItem[] | null}
 */
export function revealFor(stage, mode) {
  return REVEALS[stage.id]?.[mode] ?? null;
}

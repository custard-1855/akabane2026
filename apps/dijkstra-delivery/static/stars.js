// 星の保存(設計書 2.5、3.8)。保存先は端末内(localStorage)。Django に決まったら、ここを差し替える。
// 入れ物は引数で受け取り、Node ではメモリ上の偽物でテストする。保存できない端末でも遊べるよう、読み書きの失敗は握りつぶす

const key = (stageId) => `dijkstra-delivery:stars:${stageId}`;

/**
 * そのステージの最高記録。記録がない、読めない、壊れているときは 0
 * @param {Pick<Storage, "getItem"> | null} store
 * @param {string} stageId
 */
export function bestStars(store, stageId) {
  let n;
  try {
    n = Number(store?.getItem(key(stageId)));
  } catch {
    return 0;
  }
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : 0;
}

/**
 * 最高記録を上回ったときだけ書き込む
 * @param {Pick<Storage, "getItem" | "setItem"> | null} store
 * @param {string} stageId
 * @param {number} stars
 */
export function recordStars(store, stageId, stars) {
  if (stars <= bestStars(store, stageId)) return;
  try {
    store?.setItem(key(stageId), String(stars));
  } catch {
    // 保存できなくても遊べればよい
  }
}

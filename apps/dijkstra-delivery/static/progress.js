// 星の記録(設計書 3.8)。保存できない環境でも遊べるよう、読み書きの失敗は無視する

export const PROGRESS_KEY = "dijkstra-delivery:progress";
const VERSION = 1;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ version: 1, stages: Record<string, { A?: number, B?: number }> }}
 */
export function loadProgress(storage = defaultStorage()) {
  const empty = { version: VERSION, stages: {} };
  try {
    const raw = storage?.getItem(PROGRESS_KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw);
    if (data?.version !== VERSION || typeof data.stages !== "object" || data.stages === null) return empty;
    const stages = {};
    for (const [id, rec] of Object.entries(data.stages)) {
      const clean = {};
      for (const layer of ["A", "B"]) {
        const s = rec?.[layer];
        if (Number.isInteger(s) && s >= 1 && s <= 3) clean[layer] = s;
      }
      stages[id] = clean;
    }
    return { version: VERSION, stages };
  } catch {
    return empty;
  }
}

/**
 * ステージ・層の星を記録する。最高記録だけを残す。
 * @param {"A" | "B"} layer
 * @returns {{ best: number, improved: boolean }}
 */
export function recordStars(stageId, layer, stars, storage = defaultStorage()) {
  const progress = loadProgress(storage);
  const rec = (progress.stages[stageId] ??= {});
  const prevBest = rec[layer] ?? 0;
  const improved = stars > prevBest;
  if (improved) {
    rec[layer] = stars;
    try {
      storage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // 容量超過やプライベートブラウズでは保存しない
    }
  }
  return { best: Math.max(prevBest, stars), improved };
}

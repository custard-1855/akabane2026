// 基盤の sdk.js(/core/sdk.js)との接続。sdk の API は未確定なので、影響をこのファイルに閉じ込める(設計書 3.8)。
// sdk がない(基盤なしの開発時・読込失敗)ときは何もしない。

function sdk() {
  const core = globalThis.core;
  return core && typeof core === "object" ? core : null;
}

export function hasSdk() {
  return sdk() !== null;
}

/**
 * 利用を終える。sdk があればその終了処理(アンケート表示 → ランチャーへ戻る)に任せ、
 * なければランチャーへ移動する。
 */
export async function finish() {
  const core = sdk();
  if (typeof core?.finish === "function") {
    try {
      await core.finish();
      return;
    } catch (e) {
      console.warn("sdk の終了処理に失敗しました", e);
    }
  }
  location.assign("/");
}

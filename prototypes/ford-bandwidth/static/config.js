// 調整用の値。大きさは viewBox 単位の仮の値で、配達員ダイクストラに揃えている

export const VIEW_W = 1600;
export const VIEW_H = 900;

/** 地点の円の半径 */
export const NODE_R = 30;
/** タップ判定の透明な円の半径 */
export const HIT_R = 64;
/** 送る量を表す線の太さの最大(帯域いっぱいに送ったとき) */
export const FLOW_MAX_W = 20;

/** 層Bで、ルートを光らせてから送る量を変えるまで、送ってから次のルートへ移るまでの間(ミリ秒) */
export const AUTO_STEP_MS = 2600;
/** 付け替えの矢印を、回線からずらす幅。回線と重ならずに逆向きと分かるようにする */
export const BACK_OFFSET = 26;

// 調整用の値。大きさは viewBox 単位の仮の値で、配達員ダイクストラに揃えている

export const VIEW_W = 1600;
export const VIEW_H = 900;

/** 基地局の円の半径。中にチャンネルの番号を書くので、配達員ダイクストラの交差点より少し大きくする */
export const NODE_R = 38;
/** タップ判定の透明な円の半径 */
export const HIT_R = 64;
/**
 * タップで巡るチャンネルの数の上限(docs/games.md 7章)。最小は3、自然な順番の貪欲法は4なので、
 * それより1つ多い5にして、減らす余地があることを手で確かめられるようにする
 */
export const MAX_CHANNELS = 5;

// 調整用の値。大きさは viewBox 単位の仮の値で、C425 の実機で押しやすさを確かめて直す

export const VIEW_W = 1600;
export const VIEW_H = 900;

/** ノードの円の半径 */
export const NODE_R = 30;
/** タップ判定の透明な円の半径 */
export const HIT_R = 60;
/** viewBox の端からノード中心までの余白 */
export const MARGIN = 60;
/** ノード間の距離の下限。タップ判定の円が重ならないようにする */
export const MIN_NODE_GAP = 150;
/** ノード中心と、そのノードを端点としない辺との距離の下限 */
export const MIN_EDGE_GAP = 60;

/** 層Bのクリア後、「続けて全地点を確定」で1つ確定する間隔(ミリ秒) */
export const AUTO_SETTLE_MS = 500;

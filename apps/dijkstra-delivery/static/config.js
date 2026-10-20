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

/** 大都市の街を生成する乱数の種。見た目のよい街になる種を選んで固定する */
export const CITY_SEED = 1;
/** 大都市の交差点の点の半径 */
export const CITY_DOT_R = 7;
/** 大都市で、確定した順に色を付ける演出の長さ(ミリ秒) */
export const CITY_WAVE_MS = 3000;

/** 管制室で、自動で1つ確定する間隔(ミリ秒)。確定ごとの字幕2行を読める長さにする */
export const AUTO_SETTLE_MS = 1800;
/** 管制室で、確定した交差点から出る道を1本ずつ見せる間隔(ミリ秒)。1手に収まらなければ1手の間隔を延ばす */
export const RELAX_EDGE_MS = 600;

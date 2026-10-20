// テスト用のグラフ。ステージにない形(有向辺、同点の最短ルート)を確かめるのに使う

/**
 * 有向辺だけのグラフ(旧 Stage 3「一方通行」のデータ)。
 * 一方通行を守ると 14 で、最短ルートは S-A-C-E-G と S-B-C-E-G の同点2本。逆走を許すと 12
 */
export const oneway = {
  id: "oneway",
  name: "一方通行",
  desc: "",
  nodes: {
    S: [224, 450], A: [512, 234], B: [512, 666], C: [836, 450], D: [1160, 234],
    E: [1160, 666], G: [1412, 450],
  },
  edges: "S-A 3, S-B 5, A-C 4, B-C 2, C-D 3, C-E 5, D-G 6, E-G 2, A-D 9, B-A 1, E-D 1"
    .split(", ")
    .map((s) => {
      const [uv, w] = s.split(" ");
      const [u, v] = uv.split("-");
      return { u, v, w: Number(w), directed: true };
    }),
  expectedCost: 14,
  star2: 17,
};

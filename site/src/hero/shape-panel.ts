// 研究室サイト(kawahara-lab-site 2231987 の src/hero/dev-panel.ts)を元にした。
// 研究室サイトでは検証用で ?dev のときだけ出すが、特設サイトでは公開ページにも出し、形ごとの説明を足した
// 図形の切り替えと、いま見えている形の説明。「自動」で16秒ごとの切り替えに戻る
import type { Scene, ShowcaseShape } from "./scene";

/** パネルをヒーローの直後に置く。戻り値は、形が変わったときに説明を差し替える関数 */
export function setupShapePanel(after: HTMLElement, scene: Scene, redraw: () => void) {
  const panel = document.createElement("div");
  panel.className = "shape-panel";
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "図形の切り替え");
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = "図形";
  nav.append(tag);
  const desc = document.createElement("p");
  desc.className = "shape-desc";
  const descName = document.createElement("strong");
  const descText = document.createElement("span");
  desc.append(descName, descText);
  panel.append(nav, desc);
  after.after(panel);

  const choices: [string, number | null][] = [
    ["自動", null],
    ...scene.list.map((sh, i): [string, number] => [sh.name, i]),
  ];
  const btns = choices.map(([label, i]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => {
      scene.setShape(i);
      btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      redraw();
    });
    nav.appendChild(b);
    return b;
  });
  btns[0].setAttribute("aria-pressed", "true");

  const show = (shape: ShowcaseShape) => {
    descName.textContent = shape.name;
    descText.textContent = shape.desc;
  };
  show(scene.shape);
  return show;
}

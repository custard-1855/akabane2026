// 検証用: 図形の切り替え。「自動」で16秒ごとの切り替えに戻る。
// 開発サーバーか、URL に ?dev を付けたときだけ出す(公開ページの見た目には出さない)
import type { Scene } from "./scene";

export const devPanelEnabled = () =>
  import.meta.env.DEV || new URLSearchParams(location.search).has("dev");

export function setupDevPanel(after: HTMLElement, scene: Scene, redraw: () => void) {
  const nav = document.createElement("nav");
  nav.className = "dev";
  nav.id = "dev";
  nav.setAttribute("aria-label", "検証用の図形切り替え");
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = "検証用 · 図形";
  nav.append(tag);
  after.after(nav);

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
}

// テーマ: 自動(端末の設定に従う)/ ライト / ダーク を手動でも切り替えられる。選択は端末に保存

const THEMES = [
  ["auto", "自動"],
  ["light", "ライト"],
  ["dark", "ダーク"],
] as const;
const STORAGE_KEY = "hero-theme";

export function setupThemeButton(btn: HTMLButtonElement) {
  let themeIdx = 0;
  function applyTheme(i: number) {
    themeIdx = i;
    const [id, label] = THEMES[i];
    if (id === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", id);
    btn.textContent = `テーマ: ${label}`;
    btn.setAttribute("aria-label", `テーマを切り替える(いまは${label})`);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* 保存できなくても動く */
    }
  }
  btn.addEventListener("click", () => applyTheme((themeIdx + 1) % THEMES.length));
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const i = THEMES.findIndex(([id]) => id === saved);
    applyTheme(i >= 0 ? i : 0);
  } catch {
    applyTheme(0);
  }
}

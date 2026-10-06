// ヒーローを決まった状態で動かすための道具。
// 乱数と requestAnimationFrame を差し替え、時間は advance() で1コマ(1/30秒)ずつ進める
import { test as base, expect, type Page } from "@playwright/test";

export const FRAME = 1 / 30;
export const seconds = (s: number) => Math.round(s / FRAME);

class Hero {
  readonly errors: string[] = [];
  constructor(readonly page: Page) {}

  async open({ seed = 12345, path = "./?dev" } = {}) {
    const { page } = this;
    page.on("pageerror", (e) => this.errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && this.errors.push(m.text()));
    // Web フォントは canvas の絵に関係しない。ネットワークに左右されないよう読み込まない
    await page.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: "text/css", body: "" }));
    await page.addInitScript((seed) => {
      let s = seed | 0;
      Math.random = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let queue: FrameRequestCallback[] = [];
      let now = 0;
      window.requestAnimationFrame = (cb) => queue.push(cb);
      (window as any).__advance = (frames: number) => {
        for (let i = 0; i < frames; i++) {
          now += 1000 / 30;
          const q = queue;
          queue = [];
          q.forEach((f) => f(now));
        }
      };
    }, seed);
    await page.goto(path);
    await page.locator("#cv").waitFor();
  }

  advance(frames: number) {
    return this.page.evaluate((n) => (window as any).__advance(n), frames);
  }

  /**
   * canvas の中身だけを PNG で取る(文字や枠は含まない)。
   * ベースライン画像をリポジトリに置くので、半分の大きさに縮めて容量を抑える
   */
  async canvasPng() {
    const url = await this.page.evaluate(() => {
      const cv = document.getElementById("cv") as HTMLCanvasElement;
      const small = document.createElement("canvas");
      small.width = Math.round(cv.width / 2);
      small.height = Math.round(cv.height / 2);
      const g = small.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(cv, 0, 0, small.width, small.height);
      return small.toDataURL();
    });
    return Buffer.from(url.split(",")[1], "base64");
  }

  /** 背景のグラデーションと明らかに違う(線や点が描かれた)画素の数 */
  drawnPixels() {
    return this.page.evaluate(() => {
      const cv = document.getElementById("cv") as HTMLCanvasElement;
      const data = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
      const [r0, g0, b0] = data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.max(Math.abs(data[i] - r0), Math.abs(data[i + 1] - g0), Math.abs(data[i + 2] - b0)) > 40) count++;
      }
      return count;
    });
  }

  shapeName() {
    return this.page.locator("#shape-name").textContent();
  }

  algoName() {
    return this.page.locator("#algo-name").textContent();
  }

  devButton(label: string) {
    return this.page.locator("#dev button", { hasText: label });
  }

  /** 形の中央付近(どの形でも頂点がある所)をクリックする */
  clickShape() {
    const { width, height } = this.page.viewportSize()!;
    const heroH = Math.min(820, Math.max(440, height * 0.8));
    const wide = width > heroH * 1.3;
    return this.page.mouse.click(wide ? width * 0.63 : width / 2, wide ? heroH / 2 + 80 : heroH * 0.6);
  }
}

export const test = base.extend<{ hero: Hero }>({
  hero: async ({ page }, use) => {
    const hero = new Hero(page);
    await use(hero);
    expect(hero.errors, "ページでエラーが出ていない").toEqual([]);
  },
});
export { expect };

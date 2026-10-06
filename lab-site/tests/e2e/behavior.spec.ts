// 操作と表示の挙動(検討メモ 5章・9章・10章)
import { test, expect, seconds } from "./fixtures";

test.describe("形の切り替え", () => {
  test("16秒ごとに次の形へ切り替わり、最後の形の次は最初に戻る", async ({ hero }) => {
    await hero.open();
    expect(await hero.shapeName()).toBe("C60 フラーレン");
    await hero.advance(seconds(15.5));
    expect(await hero.shapeName()).toBe("C60 フラーレン");
    await hero.advance(seconds(1.5));
    expect(await hero.shapeName()).toBe("トーラス");
    await hero.advance(seconds(17));
    expect(await hero.shapeName()).toBe("6次元超立方体");
    await hero.advance(seconds(17));
    expect(await hero.shapeName()).toBe("ジオデシック球");
    await hero.advance(seconds(17));
    expect(await hero.shapeName()).toBe("C60 フラーレン");
  });

  test("クリックした処理が動いている間は切り替えない", async ({ hero }) => {
    await hero.open();
    await hero.advance(seconds(14));
    await hero.clickShape();
    await hero.advance(seconds(5));
    expect(await hero.shapeName()).toBe("C60 フラーレン");
  });
});

test.describe("クリック", () => {
  // 形ごとに割り当てた処理(検討メモ 9章)
  const ASSIGNED = [
    ["C60 フラーレン", "辺の塗り分け"],
    ["トーラス", "幅優先探索"],
    ["6次元超立方体", "2色の塗り分け"],
    ["ジオデシック球", "3色の塗り分け"],
  ];
  for (const [shape, algo] of ASSIGNED) {
    test(`${shape}: 頂点をクリックすると「${algo}」を実行し、名前を出して、終わると消す`, async ({
      hero,
    }) => {
      await hero.open();
      await hero.devButton(shape).click();
      expect(await hero.algoName()).toBe("");
      await hero.clickShape();
      await hero.advance(1);
      expect(await hero.algoName()).toBe(algo);
      await hero.advance(seconds(15));
      expect(await hero.algoName()).toBe("");
    });
  }

  test("頂点から離れた所をクリックしても何も起きない", async ({ hero, page }) => {
    await hero.open();
    await hero.advance(seconds(1));
    await page.mouse.click(20, 620);
    await hero.advance(1);
    expect(await hero.algoName()).toBe("");
  });

  test("ドラッグは回転だけで、処理は実行しない", async ({ hero, page }) => {
    await hero.open();
    await hero.advance(seconds(1));
    const before = await hero.canvasPng();
    await page.mouse.move(800, 400);
    await page.mouse.down();
    await page.mouse.move(900, 380, { steps: 5 });
    await page.mouse.up();
    await hero.advance(1);
    expect(await hero.algoName()).toBe("");
    expect((await hero.canvasPng()).equals(before)).toBe(false);
  });
});

test.describe("テーマ", () => {
  test("ボタンで 自動 → ライト → ダーク → 自動 と切り替わり、data-theme に反映される", async ({
    hero,
    page,
  }) => {
    await hero.open();
    const btn = page.locator("#theme-btn");
    const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await expect(btn).toHaveText("テーマ: 自動");
    expect(await theme()).toBeNull();
    await btn.click();
    await expect(btn).toHaveText("テーマ: ライト");
    expect(await theme()).toBe("light");
    await btn.click();
    await expect(btn).toHaveText("テーマ: ダーク");
    expect(await theme()).toBe("dark");
    await btn.click();
    await expect(btn).toHaveText("テーマ: 自動");
    expect(await theme()).toBeNull();
  });

  test("選んだテーマは端末に保存され、開き直しても使われる", async ({ hero, page }) => {
    await hero.open();
    await page.locator("#theme-btn").click();
    await page.reload();
    await expect(page.locator("#theme-btn")).toHaveText("テーマ: ライト");
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "light",
    );
  });

  test("ボタンに今のテーマを含む読み上げ用の名前が付く", async ({ hero, page }) => {
    await hero.open();
    await expect(page.locator("#theme-btn")).toHaveAttribute(
      "aria-label",
      "テーマを切り替える(いまは自動)",
    );
  });

  test("テーマを切り替えると canvas の色も変わる", async ({ hero, page }) => {
    // 端末は暗い設定にしておき、自動(暗い)→ ライト で色が変わることを見る
    await page.emulateMedia({ colorScheme: "dark" });
    await hero.open();
    await hero.advance(seconds(1));
    const dark = await hero.canvasPng();
    await page.locator("#theme-btn").click();
    expect((await hero.canvasPng()).equals(dark)).toBe(false);
  });
});

test.describe("検証用の図形切り替え", () => {
  test("公開版では、URL に ?dev を付けたときだけ出す", async ({ hero, page }) => {
    await hero.open({ path: "./" });
    await expect(page.locator("#dev")).toHaveCount(0);
    await page.goto("./?dev");
    await expect(page.locator("#dev button")).toHaveCount(5);
  });

  test("自動と4つの形のボタンがあり、押した1つだけが押された状態になる", async ({ hero, page }) => {
    await hero.open();
    const btns = page.locator("#dev button");
    await expect(btns).toHaveText([
      "自動",
      "C60 フラーレン",
      "トーラス",
      "6次元超立方体",
      "ジオデシック球",
    ]);
    await expect(btns.first()).toHaveAttribute("aria-pressed", "true");
    await hero.devButton("トーラス").click();
    expect(await btns.evaluateAll((l) => l.map((b) => b.getAttribute("aria-pressed")))).toEqual([
      "false",
      "false",
      "true",
      "false",
      "false",
    ]);
  });

  test("形を選ぶとその形で固定され、「自動」で切り替えが再開する", async ({ hero }) => {
    await hero.open();
    await hero.devButton("6次元超立方体").click();
    expect(await hero.shapeName()).toBe("6次元超立方体");
    await hero.advance(seconds(40));
    expect(await hero.shapeName()).toBe("6次元超立方体");
    await hero.devButton("自動").click();
    await hero.advance(seconds(17));
    expect(await hero.shapeName()).toBe("ジオデシック球");
  });
});

test.describe("動きを減らす設定", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("信号が広がった状態の1枚で止まる", async ({ hero }) => {
    await hero.open();
    expect(await hero.drawnPixels()).toBeGreaterThan(2000);
    const still = await hero.canvasPng();
    await hero.advance(seconds(5));
    expect((await hero.canvasPng()).equals(still)).toBe(true);
  });

  test("クリックすると、処理の結果をすぐにまとめて表示する", async ({ hero }) => {
    await hero.open();
    const still = await hero.canvasPng();
    await hero.clickShape();
    expect(await hero.algoName()).toBe("辺の塗り分け");
    expect((await hero.canvasPng()).equals(still)).toBe(false);
  });

  // 既知の不具合: setShape() が fade = 0 にするが、動きを減らす設定ではフェードインが進まず、何も描かれない。
  // 直したら test.fail を外す
  test.fail("検証用のボタンで形を選んでも、その形が表示される", async ({ hero }) => {
    await hero.open();
    await hero.devButton("トーラス").click();
    expect(await hero.drawnPixels()).toBeGreaterThan(2000);
  });
});

test.describe("レイアウト", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`${viewport.width}×${viewport.height}: 横にはみ出さない`, async ({ hero, page }) => {
      await page.setViewportSize(viewport);
      await hero.open();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

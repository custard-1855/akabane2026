// 見た目の回帰テスト: 乱数と時間を固定し、同じ操作をしたときの canvas の絵をベースライン画像と比べる。
// 作り直しの前後でこのテストが通れば、描画は変わっていない。
// 意図して見た目を変えたときは `npm run test:e2e:update` でベースラインを更新する
import { test, expect, seconds } from "./fixtures";

const SHAPES = ["C60 フラーレン", "トーラス", "6次元超立方体", "ジオデシック球"];

for (const scheme of ["dark", "light"] as const) {
  test.describe(`${scheme} テーマ`, () => {
    test.use({ colorScheme: scheme });

    test("開いて2秒後", async ({ hero }) => {
      await hero.open();
      await hero.advance(seconds(2));
      expect(await hero.canvasPng()).toMatchSnapshot(`${scheme}-initial.png`);
    });

    SHAPES.forEach((shape, i) => {
      test(`${shape}: 表示とクリック後の処理`, async ({ hero }) => {
        await hero.open();
        await hero.devButton(shape).click();
        await hero.advance(seconds(2));
        expect(await hero.canvasPng()).toMatchSnapshot(`${scheme}-${i + 1}-shape.png`);
        await hero.clickShape();
        await hero.advance(seconds(1.5));
        expect(await hero.canvasPng()).toMatchSnapshot(`${scheme}-${i + 1}-click-mid.png`);
        await hero.advance(seconds(6));
        expect(await hero.canvasPng()).toMatchSnapshot(`${scheme}-${i + 1}-click-end.png`);
      });
    });
  });
}

test.describe("縦長の画面(スマホ)", () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });

  test("開いて2秒後", async ({ hero }) => {
    await hero.open();
    await hero.advance(seconds(2));
    expect(await hero.canvasPng()).toMatchSnapshot("portrait-initial.png");
  });
});

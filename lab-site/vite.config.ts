import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages のサブパス(/akabane2026/)でも独自ドメインでも動くよう、相対パスで出力する
  base: "./",
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});

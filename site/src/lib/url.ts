// 研究室サイト(kawahara-lab-site 2231987 の src/lib/url.ts)からコピーし、英語のパスと記事用の関数を外した。
// 内部リンクの組み立て。リンクはすべてここを通し、絶対パスを直接書かない
// (公開先が "/" でも "/<repo>/" でも動くように、base を必ず付ける)

/** base とサイト内のパスをつなぐ。ページへのパスには末尾の "/" を補う */
export function joinBase(base: string, path: string): string {
  const b = base.endsWith("/") ? base : base + "/";
  const m = path.match(/^([^?#]*)(.*)$/)!;
  let p = m[1].replace(/^\/+/, "");
  const isFile = /\.[a-z0-9]+$/i.test(p);
  if (p !== "" && !isFile && !p.endsWith("/")) p += "/";
  return b + p + m[2];
}

/** サイト内リンクの href */
export function href(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}

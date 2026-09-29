// 基盤のサンプル。計算の呼び出し口を compute() に集約し、最初から async にしておく(要件 5章 規約5)。

const LOCAL_LIMIT = 200_000;
const $ = (id) => document.getElementById(id);

function countLocally(n) {
  const sieve = new Uint8Array(n + 1).fill(1);
  sieve[0] = sieve[1] = 0;
  for (let i = 2; i * i <= n; i++) if (sieve[i]) for (let j = i * i; j <= n; j += i) sieve[j] = 0;
  let count = 0, largest = 0;
  for (let i = 2; i <= n; i++) if (sieve[i]) { count++; largest = i; }
  return { limit: n, count, largest };
}

/** 小さい N は端末内、大きい N は Mac の計算API */
async function compute(n) {
  if (n <= LOCAL_LIMIT) return { ...countLocally(n), where: "端末" };
  const r = await core.api("/api/sample-primes/primes", { method: "POST", body: { limit: n }, timeout: 30000 });
  return { ...r, where: "Mac" };
}

function show(r) {
  return `N=${r.limit.toLocaleString()} → ${r.count.toLocaleString()}個(最大 ${r.largest.toLocaleString()}、${r.where}で計算)`;
}

$("form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const n = Number($("limit").value);
  const out = $("result");
  out.className = "";
  out.textContent = "計算中…";
  const started = performance.now();
  try {
    const r = await compute(n);
    out.textContent = `${show(r)} ${(performance.now() - started).toFixed(0)}ms`;
    $("last").textContent = show(r);
    await core.storage.set("last", r).catch(() => {});
  } catch (e) {
    // API 失敗時の挙動(要件 5章 規約7): メッセージを出し、端末内で計算できる範囲を案内する
    out.className = "error";
    out.textContent = e.kind === "http"
      ? `計算できませんでした(${e.status})`
      : `Mac に接続できません。N を ${LOCAL_LIMIT.toLocaleString()} 以下にすると端末内で計算できます`;
  }
});

$("finish").addEventListener("click", () => core.finish());

core.storage.get("last").then((r) => { if (r) $("last").textContent = show(r); }).catch(() => {});

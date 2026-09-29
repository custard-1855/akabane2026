"use strict";

const REFRESH_MS = 10000;
const minutesSel = document.getElementById("minutes");

function ms(v) { return v.toFixed(1); }

function shortId(id) { return id ? id.slice(0, 8) : ""; }

async function refresh() {
  let data;
  try {
    data = await getJson(`/api/overview?minutes=${minutesSel.value}`);
  } catch (e) {
    document.getElementById("updated").textContent = `取得失敗: ${e.message}`;
    return;
  }
  document.getElementById("updated").textContent = `更新 ${fmtTime(data.now)}`;
  document.getElementById("connected-count").textContent = `${data.connected.length}台(直近5分)`;

  document.getElementById("connected").replaceChildren(table([
    { label: "名前", value: (r) => r.name || "(未設定)" },
    { label: "端末ID", value: (r) => h("code", { title: r.deviceId, text: shortId(r.deviceId) }) },
    { label: "最後のアプリ", value: (r) => r.lastApp || "-" },
    { label: "最終アクセス", value: (r) => fmtTime(r.lastSeen) },
    { label: "リクエスト数(5分)", num: true, value: (r) => r.requests },
    { label: "User-Agent", value: (r) => r.userAgent || "", cls: () => "wrap" },
  ], data.connected, "接続中の端末はありません"));

  document.getElementById("apps").replaceChildren(table([
    { label: "アプリ", value: (r) => r.app },
    { label: "呼び出し数", num: true, value: (r) => r.count },
    { label: "平均 ms", num: true, value: (r) => ms(r.avgMs) },
    { label: "p95 ms", num: true, value: (r) => ms(r.p95Ms) },
    { label: "最大 ms", num: true, value: (r) => ms(r.maxMs) },
    { label: "5xx", num: true, value: (r) => r.errors5xx, cls: (r) => (r.errors5xx ? "bad" : "") },
  ], data.apps, "この期間のリクエストはありません"));

  document.getElementById("routes").replaceChildren(table([
    { label: "アプリ", value: (r) => r.app },
    { label: "API", value: (r) => h("code", { text: `${r.method} ${r.route}` }) },
    { label: "呼び出し数", num: true, value: (r) => r.count },
    { label: "平均 ms", num: true, value: (r) => ms(r.avgMs) },
    { label: "p95 ms", num: true, value: (r) => ms(r.p95Ms) },
    { label: "最大 ms", num: true, value: (r) => ms(r.maxMs) },
  ], data.routes, "この期間のAPI呼び出しはありません"));

  document.getElementById("errors").replaceChildren(table([
    { label: "時刻", value: (r) => fmtTime(r.ts) },
    { label: "状態", num: true, value: (r) => r.status, cls: (r) => (r.status >= 500 ? "bad" : "warn") },
    { label: "アプリ", value: (r) => r.app },
    { label: "リクエスト", value: (r) => h("code", { text: `${r.method} ${r.path}` }), cls: () => "wrap" },
    { label: "端末ID", value: (r) => h("code", { title: r.device_id || "", text: shortId(r.device_id) || "-" }) },
    { label: "ms", num: true, value: (r) => ms(r.duration_ms) },
  ], data.errors, "この期間のエラーはありません"));
}

minutesSel.addEventListener("change", refresh);
refresh();
setInterval(refresh, REFRESH_MS);

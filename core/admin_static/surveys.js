"use strict";

const TYPE_LABELS = { single: "単一選択", multi: "複数選択", scale: "段階評価", text: "自由記述", unknown: "定義なし(旧版)" };

async function showDetail(app, version) {
  const data = await getJson(`/api/surveys/${encodeURIComponent(app)}/${version}`);
  document.getElementById("detail").hidden = false;
  document.getElementById("detail-title").textContent = `${data.title} v${data.version}(${data.count}件)`;
  document.getElementById("csv").href = `/api/surveys/${encodeURIComponent(app)}/${version}/csv`;
  document.getElementById("questions").replaceChildren(...data.questions.map((q) => {
    const sub = [`${TYPE_LABELS[q.type] ?? q.type}`, `回答 ${q.answered}件`];
    if (q.mean != null) sub.push(`平均 ${q.mean}`);
    if (q.minLabel || q.maxLabel) sub.push(`${q.minLabel ?? ""} 〜 ${q.maxLabel ?? ""}`);
    return h("div", { class: "question" },
      h("h3", { text: q.text }),
      h("div", { class: "sub", text: sub.join(" / ") }),
      q.texts
        ? (q.texts.length ? h("ol", { class: "texts" }, ...q.texts.map((t) => h("li", { text: t }))) : h("p", { class: "empty", text: "回答なし" }))
        : bars(q.counts));
  }));
}

(async () => {
  const list = await getJson("/api/surveys");
  document.getElementById("list").replaceChildren(table([
    { label: "アプリ", value: (r) => r.title },
    { label: "版", num: true, value: (r) => `v${r.version}${r.isCurrent ? "" : "(旧)"}` },
    { label: "回答数", num: true, value: (r) => r.count },
    { label: "最終回答", value: (r) => fmtTime(r.lastSubmittedAt) },
    { label: "", value: (r) => {
      const b = h("button", { type: "button", text: "集計を見る" });
      b.addEventListener("click", () => showDetail(r.app, r.version));
      return b;
    } },
  ], list, "回答はまだありません"));
})();

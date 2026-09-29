"use strict";

// 管理画面の共通処理。表示はすべて textContent で行い、端末から送られた文字列を HTML として解釈しない。

function h(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  e.append(...children.filter((c) => c != null));
  return e;
}

async function getJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function fmtTime(value) {
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function table(columns, rows, emptyText) {
  if (!rows.length) return h("p", { class: "empty", text: emptyText });
  return h("table", {},
    h("thead", {}, h("tr", {}, ...columns.map((c) => h("th", { class: c.num ? "num" : null, text: c.label })))),
    h("tbody", {}, ...rows.map((r) => h("tr", {}, ...columns.map((c) => {
      const v = c.value(r);
      const cell = h("td", { class: [c.num ? "num" : "", c.cls ? c.cls(r) : ""].join(" ").trim() || null });
      if (v instanceof Node) cell.append(v);
      else cell.textContent = v ?? "";
      return cell;
    })))));
}

function bars(items) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return h("div", {}, ...items.map((i) =>
    h("div", { class: "bar-row" },
      h("span", { class: "label", title: i.label, text: i.label }),
      h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: `width:${(i.count / max) * 100}%` })),
      h("span", { class: "n", text: String(i.count) }))));
}

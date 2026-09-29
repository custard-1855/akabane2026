"use strict";

(async () => {
  const list = document.getElementById("apps");
  const core = globalThis.core;

  const nameInput = document.getElementById("device-name");
  const status = document.getElementById("device-status");
  document.getElementById("device-id").textContent = core.deviceId();
  nameInput.value = core.deviceName() || "";
  document.getElementById("device-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await core.setDeviceName(nameInput.value);
    status.textContent = "保存しました";
  });

  let apps;
  try {
    apps = await core.api("/api/core/apps");
  } catch (e) {
    list.replaceChildren(Object.assign(document.createElement("li"), {
      className: "note error",
      textContent: "サーバに接続できません。Wi-Fi とサーバの状態を確認して、再読み込みしてください。",
    }));
    return;
  }
  if (!apps.length) {
    list.replaceChildren(Object.assign(document.createElement("li"), { className: "note", textContent: "アプリがありません" }));
    return;
  }
  list.replaceChildren(...apps.map((a) => {
    const link = document.createElement("a");
    link.href = `/apps/${a.name}/`;
    const title = Object.assign(document.createElement("span"), { className: "title", textContent: a.title });
    const desc = Object.assign(document.createElement("span"), { className: "desc", textContent: a.description });
    link.append(title, desc);
    const li = document.createElement("li");
    li.append(link);
    return li;
  }));
})();

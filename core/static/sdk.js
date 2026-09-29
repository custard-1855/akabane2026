// 基盤のクライアントSDK(要件 4.5)。
// <script src="/core/sdk.js" defer></script> で読み込むと globalThis.core が使える。
//
//   core.deviceId()                 端末ID
//   core.api(path, opts)            X-Device-Id 付き・タイムアウト付きの fetch。失敗は CoreError に統一
//   core.storage.get/set/remove     保存API(このアプリ・この端末のデータ)
//   core.session                    今回の利用(id, startedAt)。アプリの画面でのみ
//   core.finish()                   利用を終える。アンケートがあれば表示し、ランチャーへ戻る
//   core.setDeviceName(name)        監視画面に出す端末名
(() => {
  "use strict";
  if (globalThis.core) return;

  const DEVICE_KEY = "core:deviceId";
  const NAME_KEY = "core:deviceName";
  const PENDING_KEY = "core:pendingSurveys";
  const DEFAULT_TIMEOUT_MS = 10000;
  const HEARTBEAT_MS = 60000;

  // Safari のプライベートモードなどで localStorage が使えない場合もあるので、失敗しても止めない
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても続ける */ } },
    remove(k) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
  };

  // LAN 内の http では crypto.randomUUID() が使えない(セキュアコンテキストでない)ため getRandomValues を使う
  function randomId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  let cachedDeviceId = null;
  function deviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    let id = ls.get(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = randomId();
      ls.set(DEVICE_KEY, id);
    }
    return (cachedDeviceId = id);
  }

  const appName = (location.pathname.match(/^\/apps\/([a-z0-9-]+)(?:\/|$)/) || [])[1] || null;

  class CoreError extends Error {
    /** kind: "timeout" | "network" | "http" */
    constructor(kind, message, { status = null, detail = null } = {}) {
      super(message);
      this.name = "CoreError";
      this.kind = kind;
      this.status = status;
      this.detail = detail;
    }
  }

  async function api(path, { method = "GET", body, timeout = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      let res;
      try {
        res = await fetch(path, {
          method,
          headers: {
            "X-Device-Id": deviceId(),
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
          cache: "no-store",
        });
      } catch (e) {
        if (ctrl.signal.aborted) throw new CoreError("timeout", `タイムアウトしました(${timeout}ms)`);
        throw new CoreError("network", "サーバに接続できません");
      }
      const text = await res.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (!res.ok) {
        throw new CoreError("http", `HTTP ${res.status}`, { status: res.status, detail: data?.detail ?? data });
      }
      return data;
    } catch (e) {
      if (e instanceof CoreError) throw e;
      if (ctrl.signal.aborted) throw new CoreError("timeout", `タイムアウトしました(${timeout}ms)`);
      throw new CoreError("network", String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  // --- 保存API ---

  function storageUrl(key) {
    if (!appName) throw new Error("core.storage はアプリの画面(/apps/<app>/)でのみ使えます");
    return `/api/core/storage/${appName}/${encodeURIComponent(key)}`;
  }

  const storage = {
    /** 値がなければ null */
    async get(key) {
      try {
        return await api(storageUrl(key));
      } catch (e) {
        if (e.kind === "http" && e.status === 404) return null;
        throw e;
      }
    },
    async set(key, value) {
      await api(storageUrl(key), { method: "PUT", body: value });
    },
    async remove(key) {
      await api(storageUrl(key), { method: "DELETE" });
    },
  };

  // --- 端末登録・ハートビート ---

  function register() {
    const name = ls.get(NAME_KEY) || undefined;
    return api("/api/core/devices", { method: "POST", body: { userAgent: navigator.userAgent, name } }).catch(() => {});
  }

  function setDeviceName(name) {
    const v = String(name ?? "").trim().slice(0, 64);
    if (v) ls.set(NAME_KEY, v);
    else ls.remove(NAME_KEY);
    return register();
  }

  function heartbeat() {
    if (document.visibilityState !== "visible") return;
    api("/api/core/devices/heartbeat", { method: "POST", timeout: 5000 }).catch(() => {});
  }

  // --- アンケートの再送 ---

  function loadPending() {
    try { return JSON.parse(ls.get(PENDING_KEY) || "[]"); } catch { return []; }
  }

  function savePending(list) {
    if (list.length) ls.set(PENDING_KEY, JSON.stringify(list));
    else ls.remove(PENDING_KEY);
  }

  // 4xx(版違い・不正な回答)は再送しても通らないので捨てる。通信失敗と 5xx は残す
  function shouldRetry(e) {
    return !(e instanceof CoreError && e.kind === "http" && e.status >= 400 && e.status < 500);
  }

  async function postSurvey(item) {
    await api(`/api/core/surveys/${item.app}`, { method: "POST", body: item.payload });
  }

  let flushing = null;
  function flushPending() {
    flushing ??= (async () => {
      const remaining = [];
      for (const item of loadPending()) {
        try {
          await postSurvey(item);
        } catch (e) {
          if (shouldRetry(e)) remaining.push(item);
        }
      }
      savePending(remaining);
    })().finally(() => { flushing = null; });
    return flushing;
  }

  // --- セッションと終了処理(要件 4.6) ---

  const session = appName ? Object.freeze({ id: randomId(), app: appName, startedAt: Date.now() }) : null;

  let finishing = false;
  async function finish({ returnTo = "/" } = {}) {
    if (finishing) return;
    finishing = true;
    try {
      if (session) {
        let survey = null;
        try {
          survey = await api(`/api/core/surveys/${appName}`, { timeout: 5000 });
        } catch {
          // アンケートなし(404)、またはサーバに届かない。どちらも表示せず戻る
        }
        if (survey) {
          const answers = await showSurvey(survey);
          if (answers) {
            const item = {
              app: appName,
              payload: {
                version: survey.version,
                sessionId: session.id,
                durationMs: Date.now() - session.startedAt,
                answers,
              },
            };
            try {
              await postSurvey(item);
            } catch (e) {
              if (shouldRetry(e)) savePending([...loadPending(), item]);
            }
          }
        }
      }
    } finally {
      location.assign(returnTo);
    }
  }

  // --- アンケート画面 ---

  const STYLE = `
.core-survey-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(20,22,26,.55);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px;font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif;-webkit-user-select:text;user-select:text}
.core-survey{background:#fff;color:#1f2328;border-radius:14px;max-width:560px;width:100%;padding:20px 20px 16px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
.core-survey h2{margin:0 0 4px;font-size:1.2rem}
.core-survey .core-lead{margin:0 0 16px;color:#5b616b;font-size:.9rem}
.core-survey fieldset{border:0;margin:0 0 18px;padding:0}
.core-survey legend{font-weight:600;margin-bottom:8px;padding:0}
.core-survey .core-req{color:#c0282d;font-size:.8rem;margin-left:6px;font-weight:500}
.core-survey .core-opts{display:flex;flex-wrap:wrap;gap:8px}
.core-survey .core-opt{display:flex;align-items:center;gap:6px;border:1px solid #c9c4b8;border-radius:10px;padding:8px 12px;min-height:44px;cursor:pointer}
.core-survey .core-opt:has(input:checked){border-color:#2563c9;background:#eaf1fd}
.core-survey .core-scale{display:flex;gap:6px}
.core-survey .core-scale .core-opt{flex:1;justify-content:center;padding:8px 0}
.core-survey .core-scale-labels{display:flex;justify-content:space-between;color:#5b616b;font-size:.8rem;margin-top:4px}
.core-survey textarea{width:100%;box-sizing:border-box;min-height:88px;font:inherit;padding:8px;border:1px solid #c9c4b8;border-radius:10px}
.core-survey .core-error{color:#c0282d;min-height:1.2em;margin:0 0 8px;font-size:.9rem}
.core-survey .core-actions{display:flex;justify-content:flex-end;gap:10px}
.core-survey button{font:inherit;min-height:44px;padding:0 18px;border-radius:10px;border:1px solid #c9c4b8;background:#fff;color:inherit;cursor:pointer}
.core-survey button[type=submit]{background:#2563c9;border-color:#2563c9;color:#fff;font-weight:600}
`;

  function el(tag, props = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else e.setAttribute(k, v);
    }
    e.append(...children);
    return e;
  }

  function renderQuestion(q, index) {
    const name = `core-q${index}`;
    const legend = el("legend", { text: q.text });
    if (q.required) legend.append(el("span", { class: "core-req", text: "必須" }));
    const fs = el("fieldset", {}, legend);

    const choice = (type, value, label) =>
      el("label", { class: "core-opt" }, el("input", { type, name, value: String(value) }), el("span", { text: label }));

    if (q.type === "single" || q.type === "multi") {
      const type = q.type === "single" ? "radio" : "checkbox";
      fs.append(el("div", { class: "core-opts" }, ...q.options.map((o) => choice(type, o, o))));
    } else if (q.type === "scale") {
      const opts = [];
      for (let i = q.min; i <= q.max; i++) opts.push(choice("radio", i, String(i)));
      fs.append(el("div", { class: "core-scale" }, ...opts));
      if (q.minLabel || q.maxLabel) {
        fs.append(el("div", { class: "core-scale-labels" },
          el("span", { text: q.minLabel || "" }), el("span", { text: q.maxLabel || "" })));
      }
    } else if (q.type === "text") {
      fs.append(el("textarea", { name, maxlength: String(q.maxLength ?? 1000) }));
    }

    const read = () => {
      if (q.type === "text") return fs.querySelector("textarea").value.trim() || null;
      const checked = [...fs.querySelectorAll("input:checked")].map((i) => i.value);
      if (q.type === "multi") return checked.length ? checked : null;
      if (!checked.length) return null;
      return q.type === "scale" ? Number(checked[0]) : checked[0];
    };
    return { fs, read };
  }

  /** 回答を集めて返す。スキップなら null */
  function showSurvey(survey) {
    return new Promise((resolve) => {
      if (!document.getElementById("core-survey-style")) {
        document.head.append(el("style", { id: "core-survey-style", text: STYLE }));
      }
      const items = survey.questions.map(renderQuestion);
      const error = el("p", { class: "core-error", role: "alert" });
      const skip = el("button", { type: "button", text: "スキップ" });
      const submit = el("button", { type: "submit", text: "送信する" });
      const form = el("form", { class: "core-survey", novalidate: "" },
        el("h2", { text: survey.title || "アンケート" }),
        el("p", { class: "core-lead", text: "よければ回答してください。スキップもできます。" }),
        ...items.map((i) => i.fs),
        error,
        el("div", { class: "core-actions" }, skip, submit));
      const backdrop = el("div", { class: "core-survey-backdrop", role: "dialog", "aria-modal": "true" }, form);
      document.body.append(backdrop);

      const close = (result) => { backdrop.remove(); resolve(result); };
      skip.addEventListener("click", () => close(null));
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const answers = {};
        const missing = [];
        survey.questions.forEach((q, i) => {
          const v = items[i].read();
          if (v !== null) answers[q.id] = v;
          else if (q.required) missing.push(q.text);
        });
        if (missing.length) {
          error.textContent = `未回答の必須項目があります: ${missing.join("、")}`;
          return;
        }
        submit.disabled = skip.disabled = true;
        close(answers);
      });
    });
  }

  // --- 起動時の処理 ---

  globalThis.core = Object.freeze({
    version: 1,
    appName,
    session,
    deviceId,
    deviceName: () => ls.get(NAME_KEY),
    setDeviceName,
    api,
    CoreError,
    storage,
    finish,
    flushPending,
  });

  register().then(flushPending);
  setInterval(heartbeat, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", heartbeat);
})();

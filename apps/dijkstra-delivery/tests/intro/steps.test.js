import { test } from "node:test";
import assert from "node:assert/strict";
import { STEPS, begin, sequence, tap } from "../../static/intro/steps.js";

/** 段の部分(閉路と木・連結は1つの段の2つの部分)を id で取り出す */
const part = (id) => sequence(STEPS).find((p) => p.step.id === id).step;

/**
 * 段を始め、タップを順に渡した後の状態を返す。
 * "A" は点、"A-B" は線、"theme:radio" は読みかえのボタン
 */
function play(id, taps) {
  const step = part(id);
  const st = begin(step);
  for (const t of taps) {
    if (t.startsWith("theme:")) tap(step, st, "theme", t.slice(6));
    else tap(step, st, t.includes("-") ? "edge" : "vertex", t);
  }
  return st;
}

const said = (st) => st.bubble && { kind: st.bubble.kind, title: st.bubble.title, text: st.bubble.text };

test("隣接: B とつながっていない点を選ぶと、理由を吹き出しで出す", () => {
  const st = play("adjacent", ["E"]);
  assert.equal(st.ready, false);
  assert.deepEqual(said(st), { kind: "hint", title: null, text: "B とは線で直接つながっていない" });
});

test("隣接: B の隣の A・C・D を全部選ぶと正解になり、「隣接」の吹き出しを出す", () => {
  const partway = play("adjacent", ["A", "C"]);
  assert.equal(partway.ready, false);
  const st = play("adjacent", ["A", "C", "D"]);
  assert.equal(st.ready, true);
  assert.equal(said(st).title, "隣接");
});

test("経路: A から始まり、前の点と線でつながっていない点は選べない", () => {
  const st = play("path", ["E"]);
  assert.deepEqual(st.path, ["A"]);
  assert.deepEqual(said(st), { kind: "hint", title: null, text: "A と線でつながった点を選ぼう" });
});

test("経路: 同じ点は2回通れない", () => {
  const st = play("path", ["B", "C", "A"]);
  assert.deepEqual(st.path, ["A", "B", "C"]);
  assert.equal(said(st).text, "同じ点は2回通らない");
});

test("経路: 1つ前の点を選ぶと1手戻る", () => {
  assert.deepEqual(play("path", ["B", "C", "B"]).path, ["A", "B"]);
});

test("経路: F に着くと正解になり、「経路」の吹き出しを出す", () => {
  const partway = play("path", ["B", "D"]);
  assert.equal(partway.ready, false);
  const st = play("path", ["B", "D", "F"]);
  assert.equal(st.ready, true);
  assert.equal(said(st).title, "経路");
});

test("閉路: 好きな点から出発し、3点を回って出発した点に戻ると正解になる", () => {
  const partway = play("cycle", ["B", "C", "E", "D"]);
  assert.equal(partway.ready, false);
  const st = play("cycle", ["B", "C", "E", "D", "B"]);
  assert.equal(st.ready, true);
  assert.equal(said(st).title, "閉路");
});

test("閉路: 2点を行って戻るだけでは輪にならず、1手戻る", () => {
  const st = play("cycle", ["A", "B", "A"]);
  assert.equal(st.ready, false);
  assert.deepEqual(st.path, ["A"]);
});

test("閉路: 出発した点以外に戻ろうとすると、理由を吹き出しで出す", () => {
  const st = play("cycle", ["A", "B", "C", "E", "D", "B"]);
  assert.equal(st.ready, false);
  assert.equal(said(st).text, "同じ点は1回だけ。出発した点に戻ろう");
});

test("木・連結: 消すと、ほかとつながらない点ができる線は消せない", () => {
  // A-B を消した後の A-C は、A につながる最後の線
  const st = play("tree", ["A-B", "A-C"]);
  assert.deepEqual([...st.removed], ["A-B"]);
  assert.deepEqual(said(st), { kind: "hint", title: null, text: "これを消すと、ほかとつながらない点ができる" });
});

test("木・連結: 消した線をもう一度タップすると戻す", () => {
  assert.deepEqual([...play("tree", ["A-B", "D-E", "A-B"]).removed], ["D-E"]);
});

test("木・連結: 線が点の数より1少ない5本になると輪がなくなり、正解になる", () => {
  const partway = play("tree", ["A-B", "D-E"]);
  assert.equal(partway.ready, false);
  const st = play("tree", ["A-B", "D-E", "B-C"]);
  assert.equal(st.ready, true);
  assert.equal(said(st).title, "木・連結");
});

test("向き: 矢印と逆向きの線へは進めない", () => {
  // C-B は C から B への矢印なので、B から C へは行けない
  const st = play("direction", ["B", "C"]);
  assert.deepEqual(st.path, ["A", "B"]);
  assert.deepEqual(said(st), { kind: "hint", title: null, text: "この線は逆向き。一方通行" });
});

test("向き: 行き止まりの点に入ると、戻るよう吹き出しで知らせる", () => {
  const st = play("direction", ["B"]);
  assert.deepEqual(st.path, ["A", "B"]);
  assert.equal(said(st).text, "B からはどこへも出られない。1つ前の点をタップして戻ろう");
});

test("向き: 矢印の向きに A → C → E → D → F と進むと正解になる", () => {
  const st = play("direction", ["B", "A", "C", "E", "D", "F"]);
  assert.deepEqual(st.path, ["A", "C", "E", "D", "F"]);
  assert.equal(st.ready, true);
  assert.equal(said(st).title, "向き");
});

test("重み: 進むたびに線の数字を合計し、1手戻ると引く", () => {
  assert.equal(play("weight", ["B", "C"]).sum, 3);
  assert.equal(play("weight", ["B", "C", "B"]).sum, 2);
});

test("重み: いちばん小さくない合計で F に着くと、合計を見せて A からやり直す", () => {
  // A-C-E-F は 4 + 3 + 6 = 13
  const st = play("weight", ["C", "E", "F"]);
  assert.equal(st.ready, false);
  assert.deepEqual(st.path, ["A"]);
  assert.equal(st.sum, 0);
  assert.equal(said(st).text, "合計 13。もっと小さくできる。A からやり直そう");
});

test("重み: いちばん小さい合計 9(A-B-C-E-D-F)で F に着くと正解になる", () => {
  const st = play("weight", ["B", "C", "E", "D", "F"]);
  assert.equal(st.sum, 9);
  assert.equal(st.ready, true);
  assert.equal(said(st).title, "重み");
});

test("読みかえ: 題材のボタンを押すと、点・線・数字の読みかえを吹き出しで出す", () => {
  const st = play("yomikae", ["theme:fiber"]);
  assert.deepEqual(said(st), { kind: "term", title: "工事として見ると", text: "頂点 = 局舎、辺 = 道、重み = 工事費(万円)" });
});

test("読みかえ: 同じボタンを何度押しても、4つの題材を全部見るまでは正解にならない", () => {
  const partway = play("yomikae", ["theme:delivery", "theme:fiber", "theme:radio", "theme:radio"]);
  assert.equal(partway.ready, false);
  const st = play("yomikae", ["theme:delivery", "theme:fiber", "theme:radio", "theme:data"]);
  assert.equal(st.ready, true);
});

test("読みかえ: 全部見た後も、ボタンを押して見比べられる", () => {
  const st = play("yomikae", ["theme:delivery", "theme:fiber", "theme:radio", "theme:data", "theme:delivery"]);
  assert.equal(said(st).title, "配達として見ると");
});

test("頂点・辺: 点を選ぶと「頂点」、次に線を選ぶと「辺」の吹き出しを出して正解になる", () => {
  const step = part("vertex");
  const st = begin(step);
  assert.equal(step.prompt(st), "点をどれか1つタップしよう");
  tap(step, st, "vertex", "C");
  assert.equal(said(st).title, "頂点");
  assert.equal(step.prompt(st), "次は、線を1本タップしよう");
  tap(step, st, "edge", "C-E");
  assert.equal(said(st).title, "辺");
  assert.equal(st.ready, true);
});

test("頂点・辺: 点より先に線を選ぶと、点を選ぶよう吹き出しで知らせる", () => {
  const st = play("vertex", ["A-B"]);
  assert.equal(st.ready, false);
  assert.equal(said(st).text, "まずは点のほうをタップしよう");
});

test("正解した後は、点や線をタップしても何も変わらない", () => {
  const st = play("path", ["B", "D", "F", "D"]);
  assert.deepEqual(st.path, ["A", "B", "D", "F"]);
  assert.equal(said(st).title, "経路");
});

test("進み具合: 7つの段に順に番号を振り、閉路と木・連結は同じ4番にする", () => {
  const labels = sequence(STEPS).map(({ step, n, total }) => `${n} / ${total} ${step.label}`);
  assert.deepEqual(labels, [
    "1 / 7 頂点・辺",
    "2 / 7 隣接",
    "3 / 7 経路",
    "4 / 7 閉路",
    "4 / 7 木・連結",
    "5 / 7 向き",
    "6 / 7 重み",
    "7 / 7 読みかえ",
  ]);
});

test("進み具合: 段を1つ外すと、その段を飛ばして番号を詰める", () => {
  const without = STEPS.filter((s) => s !== part("adjacent"));
  const labels = sequence(without).map(({ step, n, total }) => `${n} / ${total} ${step.label}`);
  assert.deepEqual(labels.slice(0, 3), ["1 / 6 頂点・辺", "2 / 6 経路", "3 / 6 閉路"]);
});

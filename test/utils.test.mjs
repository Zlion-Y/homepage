import { test } from "node:test";
import assert from "node:assert/strict";
import { songIdOf, neteasePic, hdCover, smallCover, memoSet } from "../src/utils/netease.js";
import { parseLRC } from "../src/composables/useLyrics.js";

// ── netease 工具 ──────────────────────────────────────────────

test("songIdOf：优先 id 字段，其次 ?id= 参数，最后网易 CDN 文件名", () => {
  assert.equal(songIdOf({ id: 186016 }), "186016");
  assert.equal(songIdOf({ id: "186016" }), "186016");
  assert.equal(
    songIdOf({ url: "https://music.163.com/song?id=406895568&foo=1" }),
    "406895568"
  );
  assert.equal(
    songIdOf({ url: "https://m704.music.126.net/20260930/000000/md5/254634.mp3" }),
    "254634"
  );
  assert.equal(songIdOf({ url: "https://example.com/a.mp3" }), "");
  assert.equal(songIdOf(null), "");
  assert.equal(songIdOf({}), "");
});

test("neteasePic：网易 CDN 加尺寸参数并去除旧参数；非网易原样返回（仅升 https）", () => {
  assert.equal(
    neteasePic("http://p1.music.126.net/abc/cover.jpg?param=120y120", "300y300"),
    "https://p1.music.126.net/abc/cover.jpg?param=300y300"
  );
  assert.equal(
    neteasePic("https://p2.music.126.net/abc/cover.jpg", "64y64"),
    "https://p2.music.126.net/abc/cover.jpg?param=64y64"
  );
  assert.equal(
    neteasePic("https://example.com/cover.png?x=1", "300y300"),
    "https://example.com/cover.png?x=1"
  );
  assert.equal(neteasePic("", "300y300"), "");
});

test("hdCover：网易 CDN 升 1024，已有 param 不重复加；http 统一升 https", () => {
  assert.equal(
    hdCover("http://p1.music.126.net/abc/cover.jpg"),
    "https://p1.music.126.net/abc/cover.jpg?param=1024y1024"
  );
  assert.equal(
    hdCover("https://p1.music.126.net/abc/cover.jpg?param=120y120"),
    "https://p1.music.126.net/abc/cover.jpg?param=120y120"
  );
  assert.equal(hdCover(""), "");
});

test("smallCover：剥掉旧 param 换 64y64 采样图", () => {
  assert.equal(
    smallCover("https://p1.music.126.net/abc/cover.jpg?param=1024y1024"),
    "https://p1.music.126.net/abc/cover.jpg?param=64y64"
  );
  assert.equal(
    smallCover("https://example.com/cover.png?param=512y512"),
    "https://example.com/cover.png"
  );
});

test("memoSet：LRU 语义，超限删最旧", () => {
  const m = new Map();
  memoSet(m, "a", 1, 2);
  memoSet(m, "b", 2, 2);
  assert.deepEqual([...m.keys()], ["a", "b"]);
  memoSet(m, "c", 3, 2); // 挤掉 a
  assert.deepEqual([...m.keys()], ["b", "c"]);
  memoSet(m, "b", 9, 2); // 重复写入刷新位置，不挤元素
  assert.deepEqual([...m.keys()], ["c", "b"]);
  assert.equal(m.get("b"), 9);
});

// ── LRC 解析 ─────────────────────────────────────────────────

test("parseLRC：多时间标签展开、小数位精度、无小数格式、按时间排序", () => {
  const lines = parseLRC(
    ["[00:01.20]第一句", "[01:30]无小数格式", "[00:05.5]十分秒", "[00:01.20]重复时间戳", "没有标签的行会被丢掉"].join("\n")
  );
  assert.deepEqual(
    lines.map((l) => [l.time, l.text]),
    [
      [1.2, "第一句"],
      [1.2, "重复时间戳"],
      [5.5, "十分秒"],
      [90, "无小数格式"],
    ]
  );
});

test("parseLRC：空输入与纯空行返回空数组", () => {
  assert.deepEqual(parseLRC(""), []);
  assert.deepEqual(parseLRC(null), []);
  assert.deepEqual(parseLRC("\n\n[00:01.00]"), []);
});

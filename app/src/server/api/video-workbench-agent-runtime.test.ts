import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync(
  new URL("./video-workbench-agent-runtime.ts", import.meta.url),
  "utf8",
);

test("video workbench runtime registers only set_video_script as the script canvas tool", () => {
  assert.match(runtimeSource, /name: "set_video_script"/);
  assert.match(runtimeSource, /覆盖当前视频工作台右侧脚本画布/);
  assert.match(runtimeSource, /不创建视频任务，不触发视频 workflow/);
  assert.doesNotMatch(runtimeSource, /modify_script/);
});

test("video workbench runtime keeps chat natural-language first", () => {
  assert.match(runtimeSource, /默认用自然语言回复/);
  assert.match(runtimeSource, /信息不足时只追问 1 到 2 个最关键问题/);
  assert.match(runtimeSource, /不要把工具参数、JSON schema、内部状态/);
});

test("set_video_script schema requires script and scene fields", () => {
  assert.match(runtimeSource, /mode: z\.enum\(\["create", "revise"\]\)/);
  assert.match(runtimeSource, /title: z\.string\(\)\.trim\(\)\.min\(1\)/);
  assert.match(runtimeSource, /ctaText: z\.string\(\)\.trim\(\)\.min\(1\)/);
  assert.match(runtimeSource, /targetDurationSeconds: z\.number\(\)\.int\(\)\.min\(5\)\.max\(180\)/);
  assert.match(runtimeSource, /scenes: z\.array/);
  assert.match(runtimeSource, /\)\.min\(3\)/);
  assert.match(runtimeSource, /scriptText: z\.string\(\)\.trim\(\)\.min\(1\)/);
});

test("video workbench runtime defaults to full-length multi-scene scripts", () => {
  assert.match(runtimeSource, /默认生成 45 到 60 秒的完整短视频脚本/);
  assert.match(runtimeSource, /通常包含 5 到 8 个镜头/);
  assert.match(runtimeSource, /脚本太短、只有 5 秒、想要一分钟、想多生成一点/);
  assert.match(runtimeSource, /默认输出 45 到 60 秒完整短视频脚本，5 到 8 个镜头/);
});

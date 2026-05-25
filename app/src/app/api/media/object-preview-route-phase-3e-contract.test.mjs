import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const objectPreviewRouteSource = readFileSync(new URL("./object-preview/route.ts", import.meta.url), "utf8");
const cosPreviewRouteSource = readFileSync(new URL("./cos-preview/route.ts", import.meta.url), "utf8");

test("object-preview route contains the primary object storage preview implementation", () => {
  assert.match(objectPreviewRouteSource, /export const runtime = "nodejs"/);
  assert.match(objectPreviewRouteSource, /export async function GET\(request: Request\)/);
  assert.match(objectPreviewRouteSource, /function parseDifyStoragePath\(rawPath: string\)/);
  assert.match(objectPreviewRouteSource, /getObjectStorageProvider\(parsedPath\.provider\)\.createSignedReadUrl\(parsedPath\)/);
  assert.match(objectPreviewRouteSource, /\^https\?:\\\/\\\//);
  assert.doesNotMatch(objectPreviewRouteSource, /export \{ GET, runtime \} from "\.\.\/cos-preview\/route"/);
});

test("cos-preview route is only the legacy alias to object-preview", () => {
  assert.match(cosPreviewRouteSource, /Legacy alias for old Dify\/COS payloads/);
  assert.match(cosPreviewRouteSource, /export \{ GET, runtime \} from "\.\.\/object-preview\/route";/);
  assert.doesNotMatch(cosPreviewRouteSource, /export async function GET/);
  assert.doesNotMatch(cosPreviewRouteSource, /function parseDifyStoragePath/);
  assert.doesNotMatch(cosPreviewRouteSource, /getObjectStorageProvider/);
});

test("object-preview keeps Dify OSS, COS, and raw storage key parsing branches", () => {
  assert.ok(objectPreviewRouteSource.includes("/^oss:\\/\\//i.test(rawPath)"));
  assert.match(objectPreviewRouteSource, /"aliyun_oss"/);
  assert.ok(objectPreviewRouteSource.includes("/^cos:\\/\\//i.test(rawPath)"));
  assert.match(objectPreviewRouteSource, /"tencent_cos"/);
  assert.ok(objectPreviewRouteSource.includes('replace(/^(cos|oss):\\/\\//i, "")'));
  assert.match(objectPreviewRouteSource, /return \{ provider, storageKey: value \};/);
});

test("object-preview no longer describes the primary implementation as the legacy route", () => {
  assert.doesNotMatch(
    objectPreviewRouteSource,
    /Legacy route name retained for old Dify payloads; new callers should use/,
  );
  assert.doesNotMatch(objectPreviewRouteSource, /COS 主实现|COS primary implementation/i);
  assert.match(objectPreviewRouteSource, /对象预览路径/);
});

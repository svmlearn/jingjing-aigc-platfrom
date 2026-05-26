import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./content-generation-batch-service.ts", import.meta.url),
  "utf8",
);

test("Dify batch save preserves member upload policy and production scene upload signal", () => {
  assert.match(
    source,
    /memberUploadPolicy:\s*videoPackage\.scenes\.some\(\(scene\) => scene\.required\)[\s\S]*?"talking_head_required_only"/,
  );
  assert.match(source, /requiresUserUpload:\s*scene\.requiresUserUpload/);
});

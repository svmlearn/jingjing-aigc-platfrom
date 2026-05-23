import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const apiDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(apiDir, "../..");

function readSource(relativePath: string) {
  return readFileSync(resolve(srcDir, relativePath), "utf8");
}

test("video script and workbench agent routes allow long-running generation", () => {
  const routes = [
    "app/api/content/video-scripts/route.ts",
    "app/api/content/video-scripts/revisions/route.ts",
    "app/api/content/video-workbench-agent/route.ts",
  ];

  for (const route of routes) {
    const source = readSource(route);

    assert.match(source, /export const runtime = "nodejs";/, route);
    assert.match(source, /export const maxDuration = 600;/, route);
    assert.doesNotMatch(source, /export const maxDuration = 60;/, route);
  }
});

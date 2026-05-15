import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(
  new URL("./content-generation-service.ts", import.meta.url),
  "utf8",
);

test("content generation service wires Dify mainline before the existing article fallback path", () => {
  assert.match(serviceSource, /tryCreateDifyMainlineDraft/);
  assert.match(serviceSource, /isDifyMainlineEnabled\(process\.env\)/);
  assert.match(serviceSource, /readDifyFinalResultFixtureFromEnv\(process\.env\)/);
  assert.match(serviceSource, /buildDifyMainlineDraftInput/);
  assert.match(serviceSource, /if \(difyDraftBundle\) \{\s*return difyDraftBundle;\s*\}/);
  assert.ok(
    serviceSource.indexOf("tryCreateDifyMainlineDraft") <
      serviceSource.indexOf("generateArticleVariantsWithLlm"),
  );
});

test("Dify mainline writes through existing source item and draft variant repositories", () => {
  assert.match(serviceSource, /createManualSourceItem\(\{/);
  assert.match(serviceSource, /createDraftWithVariants\(\{/);
  assert.match(serviceSource, /variants: built\.draft\.variants/);
  assert.doesNotMatch(serviceSource, /video_edit_jobs\.input_payload\s*=\s*final_result_json/);
});

test("Dify schema or provider failure keeps the documented existing fallback path", () => {
  assert.match(serviceSource, /return null;/);
  assert.match(serviceSource, /catch \{\s*return null;\s*\}/);
  assert.match(serviceSource, /DIFY_QUALITY_BLOCKED/);
  assert.match(serviceSource, /generateArticleVariantsWithLlm/);
});

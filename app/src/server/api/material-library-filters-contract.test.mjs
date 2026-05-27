import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemasSource = readFileSync(new URL("./schemas.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/materials/route.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("./material-library-service.ts", import.meta.url), "utf8");
const repositorySource = readFileSync(
  new URL("../../lib/db/material-library-repository.ts", import.meta.url),
  "utf8",
);
const contentCenterSource = readFileSync(
  new URL("../../components/merchant/content-center.tsx", import.meta.url),
  "utf8",
);

test("material list API accepts platform, type, and usage filters", () => {
  assert.match(schemasSource, /platform:\s*materialPlatformSchema\.optional\(\)/);
  assert.match(schemasSource, /materialType:\s*materialTypeSchema\.optional\(\)/);
  assert.match(schemasSource, /usageType:\s*materialUsageTypeSchema\.optional\(\)/);
  assert.match(schemasSource, /limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(500\)/);
  assert.match(routeSource, /platform:\s*payload\.platform/);
  assert.match(routeSource, /materialType:\s*payload\.materialType/);
  assert.match(routeSource, /usageType:\s*payload\.usageType/);
});

test("material repository applies filters before limiting source items", () => {
  assert.match(repositorySource, /platform = \$\$\{params\.length\}/);
  assert.match(repositorySource, /structure_summary->>'materialType'/);
  assert.match(repositorySource, /script_text is not null then 'video' else 'article'/);
  assert.match(repositorySource, /structure_summary->>'materialUsageType'/);
  assert.match(repositorySource, /trace_payload->>'materialUsageType'/);
  assert.match(repositorySource, /filterMaterialLibraryItems/);
});

test("social content center requests only viral references and exposes filter buttons", () => {
  assert.match(serviceSource, /input\.usageType !== "viral_reference"/);
  assert.match(contentCenterSource, /usageType:\s*"viral_reference"/);
  assert.match(contentCenterSource, /limit:\s*"100"/);
  assert.match(contentCenterSource, /platformFilterOptions/);
  assert.match(contentCenterSource, /materialTypeFilterOptions/);
  assert.match(contentCenterSource, /InlineFilterGroup/);
  assert.match(contentCenterSource, /materialTypeLabels/);
});

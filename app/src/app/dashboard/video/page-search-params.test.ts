import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDashboardVideoSearchParams } from "./page-search-params.ts";

test("normalizeDashboardVideoSearchParams ignores local test mode parameters", () => {
  const params = normalizeDashboardVideoSearchParams({
    sessionId: "session_1",
    materialId: "material_1",
    materialReferenceId: "reference_1",
    strategy: "trust",
    testMode: "video_chain",
  });

  assert.deepEqual(params, {
    sessionId: "session_1",
    materialId: "material_1",
    materialReferenceId: "reference_1",
    strategyTag: "trust",
  });
  assert.equal("testMode" in params, false);
});

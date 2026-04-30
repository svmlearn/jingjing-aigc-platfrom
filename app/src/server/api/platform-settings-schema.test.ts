import assert from "node:assert/strict";
import test from "node:test";

import { platformSettingsUpdateSchema } from "./schemas.ts";

test("platformSettingsUpdateSchema keeps script production prompt out of settings updates", () => {
  const parsed = platformSettingsUpdateSchema.parse({
    scriptProductionAgent: {
      systemPrompt: "custom prompt should not be accepted as settings",
      model: "gpt-4.1-mini",
      temperature: 0.65,
      retrievalTopK: 4,
      revisionEnabled: true,
    },
  });

  assert.deepEqual(parsed.scriptProductionAgent, {
    model: "gpt-4.1-mini",
    temperature: 0.65,
    retrievalTopK: 4,
    revisionEnabled: true,
  });
});

test("platformSettingsUpdateSchema allows script production settings without prompt", () => {
  const parsed = platformSettingsUpdateSchema.parse({
    scriptProductionAgent: {
      model: "gpt-4.1-mini",
      temperature: 0.65,
      retrievalTopK: 4,
      revisionEnabled: true,
    },
  });

  assert.equal(parsed.scriptProductionAgent?.model, "gpt-4.1-mini");
});

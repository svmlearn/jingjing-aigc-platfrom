import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveVideoProgressModule,
  normalizeVideoProgressModules,
} from "./video-progress-modules.ts";

test("normalizeVideoProgressModules prefers top-level progress modules", () => {
  const modules = normalizeVideoProgressModules({
    status: "running",
    currentStage: "openstoryline_rendering",
    progressModules: [
      {
        key: "voiceover",
        label: "Voiceover",
        status: "running",
        progressPct: 64,
      },
    ],
    runtimePayload: {
      progressModules: [
        {
          key: "render",
          label: "Render",
          status: "running",
          progressPct: 30,
        },
      ],
    },
  });

  assert.equal(modules.length, 1);
  assert.equal(modules[0]?.key, "voiceover");
  assert.equal(modules[0]?.progressPct, 64);
});

test("normalizeVideoProgressModules falls back from invalid top-level modules", () => {
  const modules = normalizeVideoProgressModules({
    status: "running",
    progressModules: [
      {
        key: "voiceover",
        label: "Voiceover",
        progressPct: 64,
      },
    ],
    runtimePayload: {
      progressModules: [
        {
          key: "render",
          label: "Render",
          status: "running",
          progressPct: 30,
        },
      ],
    },
  });

  assert.equal(modules.length, 1);
  assert.equal(modules[0]?.key, "render");
});

test("normalizeVideoProgressModules maps openstoryline fallback stages to concrete modules", () => {
  const cases = [
    ["openstoryline_material_match", "material_match"],
    ["openstoryline_voiceover", "voiceover"],
    ["openstoryline_subtitles", "subtitles"],
    ["openstoryline_rendering", "render"],
    ["uploading_outputs", "output_delivery"],
    ["completed", "output_delivery"],
  ] as const;

  for (const [currentStage, expectedKey] of cases) {
    const modules = normalizeVideoProgressModules({
      status: "running",
      currentStage,
      progressPct: 55,
    });
    const active = getActiveVideoProgressModule(modules);

    assert.equal(active?.key, expectedKey, currentStage);
    assert.equal(active?.status, "running", currentStage);
  }
});

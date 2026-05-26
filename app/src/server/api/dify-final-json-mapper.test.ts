import assert from "node:assert/strict";
import test from "node:test";

import {
  mapDifyVideoToMemberPackage,
  parseDifyFinalJson,
  type DifyFinalJson,
} from "./dify-final-json-mapper.ts";

function makeFinalJson(): DifyFinalJson {
  return parseDifyFinalJson({
    status: "passed",
    article: {
      title: "Daily topic",
      coverCopy: "Cover",
      images: [],
      copyText: "Body #tag",
    },
    video: {
      storyOutline: "Two scene story",
      estimatedDuration: "12 seconds",
      bgm: "light",
      toneOfVoice: "warm",
      scenes: [
        {
          sceneNo: 1,
          timeRange: "00:00-00:05",
          durationSec: 5,
          sceneType: "opening",
          title: "Opening",
          requiresUserUpload: true,
          purpose: "hook",
          taskDescription: "Record the assigned opening scene",
          visualDescription: "Member records a clear vertical clip",
          voiceover: "Welcome to the project.",
          subtitle: "Welcome",
          shotLanguage: {
            framing: "medium",
            cameraMovement: "static",
            orientation: "vertical",
            composition: "center",
          },
          filmingGuide: {
            method: "phone vertical",
            location: "showroom",
            posture: "standing",
            tips: ["keep face clear"],
          },
          editGuide: {
            transition: "cut",
            pacing: "normal",
            minUsableSeconds: 3,
          },
          assetQuery: "member opening",
        },
        {
          sceneNo: 2,
          timeRange: "00:05-00:12",
          durationSec: 7,
          sceneType: "project_broll",
          title: "Project",
          requiresUserUpload: false,
          purpose: "show",
          taskDescription: "Use project material",
          visualDescription: "Project entrance and shops",
          voiceover: "The entrance is convenient.",
          subtitle: "Convenient entrance",
          shotLanguage: {
            framing: "wide",
            cameraMovement: "pan",
            orientation: "vertical",
            composition: "rule of thirds",
          },
          filmingGuide: {
            method: "b-roll",
            location: "entrance",
            posture: "",
            tips: ["steady movement"],
          },
          editGuide: {
            transition: "cut",
            pacing: "fast",
            minUsableSeconds: 3,
          },
          assetQuery: "project entrance",
        },
      ],
    },
    quality: {
      riskTerms: [],
    },
  });
}

test("mapDifyVideoToMemberPackage preserves requiresUserUpload as member upload scenes", () => {
  const videoPackage = mapDifyVideoToMemberPackage({
    finalJson: makeFinalJson(),
    generatedAt: "2026-05-23T00:00:00.000Z",
  });

  assert.equal(videoPackage.scenes[0]?.required, true);
  assert.equal(videoPackage.scenes[1]?.required, false);
  assert.deepEqual(videoPackage.materialChecklist, ["Record the assigned opening scene"]);
  assert.equal(videoPackage.targetDurationSeconds, 12);
});

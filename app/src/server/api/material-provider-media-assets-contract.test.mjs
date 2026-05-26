import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(new URL("./material-library-service.ts", import.meta.url), "utf8");
const mediaAssetSource = readFileSync(new URL("./material-provider-media-assets.ts", import.meta.url), "utf8");
const materialContractSource = readFileSync(new URL("../../contracts/material.ts", import.meta.url), "utf8");
const contentCenterSource = readFileSync(
  new URL("../../components/merchant/content-center.tsx", import.meta.url),
  "utf8",
);
const merchantMediaRepositorySource = readFileSync(
  new URL("../../lib/db/merchant-media-repository.ts", import.meta.url),
  "utf8",
);

test("TikHub material imports persist media under source item social-viral OSS assets", () => {
  assert.match(serviceSource, /persistMaterialProviderMediaAssets/);
  assert.match(serviceSource, /providerItems/);
  assert.match(mediaAssetSource, /createAssetObject/);
  assert.match(mediaAssetSource, /ownerType:\s*"source_item"/);
  assert.match(mediaAssetSource, /"source-assets"/);
  assert.match(mediaAssetSource, /socialViralAssetFolder\s*=\s*"social-viral"/);
  assert.match(mediaAssetSource, /assetType:\s*"cover"/);
  assert.match(mediaAssetSource, /assetType:\s*"video"/);
  assert.match(mediaAssetSource, /assetType:\s*"image"/);
  assert.doesNotMatch(mediaAssetSource, /merchant_media_assets/);
  assert.doesNotMatch(mediaAssetSource, /merchant-media\//);
});

test("material library API and page expose social media OSS assets for preview", () => {
  assert.match(materialContractSource, /mediaAssets\?: MediaAssetDto\[\]/);
  assert.match(serviceSource, /listAssetObjectsByOwner/);
  assert.match(serviceSource, /ownerType:\s*"source_item"/);
  assert.match(serviceSource, /attachMaterialMediaAssets/);
  assert.match(serviceSource, /\/api\/media\/object-preview\?path=/);
  assert.match(contentCenterSource, /getPrimaryPreviewAsset/);
  assert.match(contentCenterSource, /MaterialMediaPreview/);
  assert.match(contentCenterSource, /<video[\s\S]*controls/);
  assert.match(contentCenterSource, /<img/);
  assert.match(contentCenterSource, /signedPreviewUrl/);
});

test("source item media assets do not flow back into merchant uploaded video clips unless they are project media", () => {
  assert.match(
    merchantMediaRepositorySource,
    /si\.trace_payload #>> '\{materialAnalysis,materialCategory\}' = 'project_media_asset'/,
  );
  assert.match(
    merchantMediaRepositorySource,
    /si\.trace_payload #>> '\{materialAnalysis,assetType\}' = 'video'/,
  );
});

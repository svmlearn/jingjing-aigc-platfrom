import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const privateMediaDownloadRouteSource = readFileSync(
  new URL("../../app/api/private-media/download/[token]/route.ts", import.meta.url),
  "utf8",
);
const merchantMediaManifestServiceSource = readFileSync(
  new URL("./merchant-media-manifest-service.ts", import.meta.url),
  "utf8",
);
const legacyApiHelperUrl = new URL("./cos.ts", import.meta.url);
const tencentProviderUrl = new URL("../storage/tencent-cos-provider.ts", import.meta.url);

const legacyReadSignerName = "create" + "CosSignedReadUrl";
const legacyConfigGetterName = "get" + "CosConfig";
const legacyApiImport = "@/server/api/" + "cos";

test("private media download route signs through the object storage facade", () => {
  assert.doesNotMatch(privateMediaDownloadRouteSource, new RegExp(legacyReadSignerName));
  assert.doesNotMatch(privateMediaDownloadRouteSource, new RegExp(escapeRegExp(legacyApiImport)));
  assert.match(privateMediaDownloadRouteSource, /from "@\/server\/storage"/);
  assert.match(privateMediaDownloadRouteSource, /getObjectStorageProvider\(\)\.createSignedReadUrl\(/);
  assert.match(privateMediaDownloadRouteSource, /responseContentDisposition: input\.responseContentDisposition/);
  assert.match(privateMediaDownloadRouteSource, /responseContentType: input\.responseContentType/);
  assert.match(privateMediaDownloadRouteSource, /status: resolved\.status/);
  assert.match(privateMediaDownloadRouteSource, /location: resolved\.location/);
});

test("merchant media manifest service reads the default bucket from object storage config", () => {
  assert.doesNotMatch(merchantMediaManifestServiceSource, new RegExp(legacyConfigGetterName));
  assert.doesNotMatch(merchantMediaManifestServiceSource, new RegExp(escapeRegExp(legacyApiImport)));
  assert.match(merchantMediaManifestServiceSource, /from "@\/server\/storage"/);
  assert.match(
    merchantMediaManifestServiceSource,
    /defaultBucketName: getConfiguredObjectStorageProvider\(\)\.getConfig\(\)\.bucket/,
  );
  assert.match(merchantMediaManifestServiceSource, /receiveMerchantMediaManifest\(/);
});

test("legacy API helper is removed while Tencent COS runtime provider remains", () => {
  assert.equal(existsSync(legacyApiHelperUrl), false);
  assert.equal(existsSync(tencentProviderUrl), true);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

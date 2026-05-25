import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const removedProvider = "ten" + "cent" + "_cos";
const removedProviderFileName = `${"ten" + "cent"}-${"cos"}-provider.ts`;
const removedPreviewRouteName = `${"cos"}-preview`;
const removedServerPackageNames = ["cos" + "-nodejs-sdk-v5", "qcloud-" + "cos-sts"];
const removedRuntimeEnvPattern = `${"CO" + "S"}_`;

const appRoot = new URL("../../../", import.meta.url);
const srcRoot = new URL("../../", import.meta.url);
const packageJsonSource = readSource(new URL("../../../package.json", import.meta.url));
const lockfileSource = readSource(new URL("../../../pnpm-lock.yaml", import.meta.url));
const envExampleSource = readSource(new URL("../../../.env.example", import.meta.url));
const storageIndexSource = readSource(new URL("./index.ts", import.meta.url));
const objectStorageSource = readSource(new URL("./object-storage.ts", import.meta.url));
const mediaContractSource = readSource(new URL("../../contracts/media.ts", import.meta.url));
const knowledgeContractSource = readSource(new URL("../../contracts/knowledge.ts", import.meta.url));
const schemasSource = readSource(new URL("../api/schemas.ts", import.meta.url));
const objectPreviewRouteSource = readSource(new URL("../../app/api/media/object-preview/route.ts", import.meta.url));
const healthRouteSource = readSource(new URL("../../app/api/health/route.ts", import.meta.url));

test("app storage runtime only exposes Aliyun OSS provider", () => {
  assert.equal(existsSync(new URL(`./${removedProviderFileName}`, import.meta.url)), false);
  assert.doesNotMatch(storageIndexSource, new RegExp(removedProviderFileName));
  assert.match(storageIndexSource, /return aliyunOssProvider;/);
  assert.doesNotMatch(storageIndexSource, new RegExp(removedProvider));
  assert.match(objectStorageSource, /STORAGE_PROVIDER must be aliyun_oss/);
});

test("current app contracts and schemas only allow Aliyun OSS provider", () => {
  assert.match(mediaContractSource, /export type MediaStorageProvider = "aliyun_oss";/);
  assert.doesNotMatch(mediaContractSource, new RegExp(removedProvider));
  assert.doesNotMatch(knowledgeContractSource, new RegExp(removedProvider));
  assert.match(schemasSource, /storageProvider: z\.literal\("aliyun_oss"\)/);
});

test("app preview and health routes no longer expose legacy provider aliases", () => {
  assert.equal(existsSync(new URL(`../../app/api/media/${removedPreviewRouteName}/route.ts`, import.meta.url)), false);
  assert.match(objectPreviewRouteSource, /OBJECT_PREVIEW_PROVIDER_UNSUPPORTED/);
  assert.doesNotMatch(objectPreviewRouteSource, new RegExp(removedProvider));
  assert.doesNotMatch(objectPreviewRouteSource, new RegExp(removedPreviewRouteName));
  assert.doesNotMatch(healthRouteSource, /\bcos\b/);
});

test("app package and env examples no longer include removed runtime provider dependencies", () => {
  for (const packageName of removedServerPackageNames) {
    assert.doesNotMatch(packageJsonSource, new RegExp(escapeRegExp(packageName)));
    assert.doesNotMatch(lockfileSource, new RegExp(escapeRegExp(packageName)));
  }

  assert.doesNotMatch(envExampleSource, new RegExp(removedRuntimeEnvPattern));
});

test("app src no longer contains removed runtime provider markers", () => {
  const sources = collectTextSources(srcRoot);
  for (const [path, source] of sources) {
    assert.doesNotMatch(source, new RegExp(removedProvider), `${path} should not mention removed provider.`);
    assert.doesNotMatch(source, new RegExp(removedRuntimeEnvPattern), `${path} should not mention removed env prefix.`);
    assert.doesNotMatch(source, new RegExp(removedPreviewRouteName), `${path} should not mention removed preview route.`);
  }
});

function readSource(url) {
  return readFileSync(url, "utf8");
}

function collectTextSources(rootUrl) {
  const rootPath = rootUrl.pathname;
  const sources = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entryName of readdirSync(directory)) {
      const entryPath = `${directory}/${entryName}`;
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        if (entryName !== ".next" && entryName !== "node_modules") {
          stack.push(entryPath);
        }
        continue;
      }

      if (/\.(ts|tsx|mjs)$/.test(entryName)) {
        sources.push([entryPath.slice(appRoot.pathname.length), readFileSync(entryPath, "utf8")]);
      }
    }
  }

  return sources;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

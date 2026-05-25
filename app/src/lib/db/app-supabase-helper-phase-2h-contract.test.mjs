import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = fileURLToPath(new URL("../../../", import.meta.url));
const srcRoot = join(appRoot, "src");
const legacyLower = ["supa", "base"].join("");
const legacyTitle = ["Supa", "base"].join("");
const legacyUpperPrefix = ["SUPA", "BASE_"].join("");

const forbiddenRuntimeSnippets = [
  `@${legacyLower}`,
  ["lib", legacyLower].join("/"),
  legacyUpperPrefix,
  legacyTitle,
  `is${legacyTitle}`,
  `create${legacyTitle}`,
];

test("app runtime source no longer contains legacy backend helpers or env keys", () => {
  for (const filePath of listTextFiles(srcRoot)) {
    const source = readFileSync(filePath, "utf8");
    for (const snippet of forbiddenRuntimeSnippets) {
      assert.doesNotMatch(
        source,
        new RegExp(escapeRegExp(snippet)),
        `${relative(appRoot, filePath)} should not contain ${snippet}`,
      );
    }
  }
});

test("legacy helper files are removed from app source", () => {
  const helperDir = join(srcRoot, "lib", legacyLower);
  assert.equal(existsSync(join(helperDir, "admin.ts")), false);
  assert.equal(existsSync(join(helperDir, "browser.ts")), false);
  assert.equal(existsSync(join(helperDir, "server.ts")), false);
  assert.equal(existsSync(join(srcRoot, "lib", "db", ["cloud", legacyLower, "required.ts"].join("-"))), false);
});

test("package, lockfile, and env example no longer advertise legacy app dependencies", () => {
  const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
  assert.equal(packageJson.dependencies?.[`@${legacyLower}/ssr`], undefined);
  assert.equal(packageJson.dependencies?.[`@${legacyLower}/${legacyLower}-js`], undefined);

  for (const fileName of ["package.json", "pnpm-lock.yaml", ".env.example"]) {
    const source = readFileSync(join(appRoot, fileName), "utf8");
    for (const snippet of forbiddenRuntimeSnippets) {
      assert.doesNotMatch(source, new RegExp(escapeRegExp(snippet)), `${fileName} should not contain ${snippet}`);
    }
  }
});

test("local real-chain gate depends only on explicit local real-chain database config", () => {
  const source = readFileSync(join(srcRoot, "lib", "db", "local-real-chain-repository.ts"), "utf8");
  assert.match(
    source,
    /export function isLocalRealChainEnabled\(\) {\n\s+return Boolean\(process\.env\.LOCAL_REAL_CHAIN_DB_URL\?\.trim\(\)\);\n}/,
  );
  assert.doesNotMatch(source, new RegExp(escapeRegExp(`is${legacyTitle}AdminConfigured`)));
});

test("private media doctor keeps a generic server-only secret redline", () => {
  const source = readFileSync(join(srcRoot, "lib", "private-media-doctor.ts"), "utf8");
  assert.match(source, /envKey\.endsWith\("_SERVICE_ROLE_KEY"\)/);
  assert.doesNotMatch(source, new RegExp(`${"CO" + "S"}_${"SECRET_"}`));
  assert.doesNotMatch(source, new RegExp(escapeRegExp(`${legacyUpperPrefix}SERVICE_ROLE_KEY`)));
});

function listTextFiles(directory) {
  const files = [];
  for (const entryName of readdirSync(directory)) {
    const entryPath = join(directory, entryName);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      files.push(...listTextFiles(entryPath));
      continue;
    }

    if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css"].includes(extname(entryPath))) {
      files.push(entryPath);
    }
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

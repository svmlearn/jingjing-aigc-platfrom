#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import COS from "cos-nodejs-sdk-v5";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const requiredCosEnv = ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION"];

loadEnvFileFromArgs();

const missing = requiredCosEnv.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "missing_environment",
        missing,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(2);
}

const bucket = process.env.COS_BUCKET.trim();
const region = process.env.COS_REGION.trim();
const prefix = getArgValue("--prefix") || process.env.COS_SMOKE_PREFIX || "app-cos-smoke";
const key = `${prefix.trim().replace(/^\/+|\/+$/g, "") || "app-cos-smoke"}/${randomUUID()}.txt`;
const body = Buffer.from("jingjing domestic app cos smoke\n", "utf8");
const client = new COS({
  SecretId: process.env.COS_SECRET_ID.trim(),
  SecretKey: process.env.COS_SECRET_KEY.trim(),
});

let uploaded = false;
try {
  const putResult = await putObject({
    bucket,
    region,
    key,
    body,
    contentType: "text/plain",
  });
  uploaded = true;

  const signedUrl = client.getObjectUrl({
    Bucket: bucket,
    Region: region,
    Key: key,
    Sign: true,
    Method: "GET",
    Expires: 60,
    Protocol: "https:",
  });
  const response = await fetch(signedUrl);
  const downloaded = Buffer.from(await response.arrayBuffer());

  await deleteObject({ bucket, region, key });
  uploaded = false;

  process.stdout.write(
    `${JSON.stringify(
      {
        status: response.ok && downloaded.equals(body) ? "ok" : "failed",
        bucket,
        region,
        key,
        putEtag: putResult.etag,
        signedDownloadStatus: response.status,
        bytes: downloaded.length,
        signedDownloadMatched: downloaded.equals(body),
        deleted: true,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = response.ok && downloaded.equals(body) ? 0 : 1;
} catch (error) {
  if (uploaded) {
    await deleteObject({ bucket, region, key }).catch(() => undefined);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "error",
        bucket,
        region,
        key,
        message: error instanceof Error ? error.message : "COS roundtrip failed.",
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}

function putObject(input) {
  return new Promise((resolve, reject) => {
    client.putObject(
      {
        Bucket: input.bucket,
        Region: input.region,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      },
      (error, data) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ etag: data?.ETag ?? null });
      },
    );
  });
}

function deleteObject(input) {
  return new Promise((resolve, reject) => {
    client.deleteObject(
      {
        Bucket: input.bucket,
        Region: input.region,
        Key: input.key,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] ?? "";
}

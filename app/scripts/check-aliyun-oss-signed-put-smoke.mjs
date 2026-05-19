#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import OSS from "ali-oss";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

loadEnvFileFromArgs();

const requiredEnv = [
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_ENDPOINT",
];

const missing = requiredEnv.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  writeReport(
    {
      status: "missing_environment",
      provider: "aliyun_oss",
      code: "OSS_NOT_CONFIGURED",
      missing,
    },
    2,
  );
} else {
  await runSignedPutSmoke();
}

async function runSignedPutSmoke() {
  const bucket = process.env.ALIYUN_OSS_BUCKET.trim();
  const region = process.env.ALIYUN_OSS_REGION.trim();
  const endpoint = normalizeEndpoint(process.env.ALIYUN_OSS_ENDPOINT.trim());
  const origin = getArgValue("--origin") || "http://127.0.0.1:3000";
  const contentType = "text/plain";
  const key = `draft-inputs/signed-put-smoke/${randomUUID()}.txt`;
  const body = Buffer.from("jingjing aliyun signed put smoke\n", "utf8");
  const client = new OSS({
    region,
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID.trim(),
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET.trim(),
    bucket,
    endpoint,
    secure: true,
  });
  let uploaded = false;

  try {
    const uploadUrl = ensureHttpsUrl(
      client.signatureUrl(key, {
        expires: 120,
        method: "PUT",
        "Content-Type": contentType,
      }),
    );
    const preflight = await fetch(uploadUrl, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        Origin: origin,
      },
      body,
    });

    uploaded = putResponse.ok;

    const readUrl = ensureHttpsUrl(client.signatureUrl(key, { expires: 120, method: "GET" }));
    const readResponse = await fetch(readUrl, {
      headers: {
        Origin: origin,
      },
    });
    const downloaded = Buffer.from(await readResponse.arrayBuffer());

    await client.delete(key);
    uploaded = false;

    const ok = preflight.ok && putResponse.ok && readResponse.ok && downloaded.equals(body);
    writeReport(
      {
        status: ok ? "ok" : "failed",
        provider: "aliyun_oss",
        bucket,
        region,
        endpoint,
        key,
        origin,
        preflightStatus: preflight.status,
        preflightAllowOrigin: preflight.headers.get("access-control-allow-origin"),
        preflightAllowMethods: preflight.headers.get("access-control-allow-methods"),
        preflightAllowHeaders: preflight.headers.get("access-control-allow-headers"),
        putStatus: putResponse.status,
        putEtag: putResponse.headers.get("etag"),
        signedDownloadStatus: readResponse.status,
        bytes: downloaded.length,
        signedDownloadMatched: downloaded.equals(body),
        deleted: true,
      },
      ok ? 0 : 1,
    );
  } catch (error) {
    if (uploaded) {
      await client.delete(key).catch(() => undefined);
    }

    writeReport(
      {
        status: "error",
        provider: "aliyun_oss",
        bucket,
        region,
        endpoint,
        key,
        deleted: !uploaded,
        message: sanitizeErrorMessage(error),
      },
      1,
    );
  }
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] ?? "";
}

function normalizeEndpoint(endpoint) {
  return endpoint.replace(/^https?:\/\//i, "");
}

function ensureHttpsUrl(url) {
  return url.replace(/^http:\/\//i, "https://");
}

function sanitizeErrorMessage(error) {
  const raw = error instanceof Error ? error.message : "Aliyun OSS signed PUT smoke failed.";
  return raw
    .replace(/([?&](?:OSSAccessKeyId|Signature|security-token|x-oss-security-token)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/[A-Za-z0-9/+_-]{32,}={0,2}/g, "<redacted>");
}

function writeReport(report, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCode;
}

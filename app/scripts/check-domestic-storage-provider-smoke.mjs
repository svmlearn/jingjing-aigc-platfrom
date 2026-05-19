#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import OSS from "ali-oss";
import COS from "cos-nodejs-sdk-v5";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

loadEnvFileFromArgs();

const provider = getArgValue("--provider") || process.env.STORAGE_PROVIDER?.trim() || "aliyun_oss";
const runRoundtrip = process.argv.includes("--roundtrip");

if (provider === "tencent_cos") {
  await smokeTencentCos();
} else if (provider === "aliyun_oss") {
  await smokeAliyunOss();
} else {
  writeReport(
    {
      status: "failed",
      provider,
      code: "STORAGE_PROVIDER_UNSUPPORTED",
      message: "Provider must be tencent_cos or aliyun_oss.",
    },
    1,
  );
}

async function smokeTencentCos() {
  const required = ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION"];
  const missing = required.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    writeReport(
      {
        status: "missing_environment",
        provider: "tencent_cos",
        missing,
        expectedErrorCode: "COS_NOT_CONFIGURED",
      },
      2,
    );
    return;
  }

  const bucket = process.env.COS_BUCKET.trim();
  const region = process.env.COS_REGION.trim();
  const sample = buildSamples();
  const client = new COS({
    SecretId: process.env.COS_SECRET_ID.trim(),
    SecretKey: process.env.COS_SECRET_KEY.trim(),
  });
  const signedUrl = client.getObjectUrl({
    Bucket: bucket,
    Region: region,
    Key: sample.mediaStorageKey,
    Sign: true,
    Method: "GET",
    Expires: 60,
    Protocol: "https:",
  });

  if (!runRoundtrip) {
    writeReport({
      status: "ok",
      provider: "tencent_cos",
      bucket,
      region,
      storageProviderDefault: process.env.STORAGE_PROVIDER?.trim() || "aliyun_oss",
      keyPrefixCompatible: sample.mediaStorageKey.startsWith(`${sample.mediaPrefix}/`),
      signedReadUrlGenerated: /^https:\/\//.test(signedUrl),
      roundtrip: "skipped",
      aliyunOssRoundtrip: "pending_no_real_env",
      sample,
    });
    return;
  }

  const key = `app-storage-provider-smoke/${randomUUID()}.txt`;
  const body = Buffer.from("jingjing domestic storage provider smoke\n", "utf8");
  let uploaded = false;

  try {
    const putResult = await putCosObject({ client, bucket, region, key, body });
    uploaded = true;
    const readUrl = client.getObjectUrl({
      Bucket: bucket,
      Region: region,
      Key: key,
      Sign: true,
      Method: "GET",
      Expires: 60,
      Protocol: "https:",
    });
    const response = await fetch(readUrl);
    const downloaded = Buffer.from(await response.arrayBuffer());
    await deleteCosObject({ client, bucket, region, key });
    uploaded = false;

    writeReport(
      {
        status: response.ok && downloaded.equals(body) ? "ok" : "failed",
        provider: "tencent_cos",
        bucket,
        region,
        key,
        putEtag: putResult.etag,
        signedDownloadStatus: response.status,
        signedDownloadMatched: downloaded.equals(body),
        deleted: true,
        sample,
      },
      response.ok && downloaded.equals(body) ? 0 : 1,
    );
  } catch (error) {
    if (uploaded) {
      await deleteCosObject({ client, bucket, region, key }).catch(() => undefined);
    }
    writeReport(
      {
        status: "error",
        provider: "tencent_cos",
        bucket,
        region,
        key,
        message: error instanceof Error ? error.message : "Tencent COS roundtrip failed.",
      },
      1,
    );
  }
}

async function smokeAliyunOss() {
  const required = [
    "ALIYUN_OSS_ACCESS_KEY_ID",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "ALIYUN_OSS_BUCKET",
    "ALIYUN_OSS_REGION",
    "ALIYUN_OSS_ENDPOINT",
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());
  const sample = buildSamples();

  if (missing.length > 0) {
    writeReport(
      {
        status: runRoundtrip ? "missing_environment" : "pending",
        provider: "aliyun_oss",
        code: "OSS_NOT_CONFIGURED",
        reason: "aliyun_oss_env_missing",
        missing,
        keyPrefixCompatible: sample.mediaStorageKey.startsWith(`${sample.mediaPrefix}/`),
        roundtrip: "pending",
        sample,
      },
      runRoundtrip ? 2 : 0,
    );
    return;
  }

  const bucket = process.env.ALIYUN_OSS_BUCKET.trim();
  const region = process.env.ALIYUN_OSS_REGION.trim();
  const endpoint = normalizeEndpoint(process.env.ALIYUN_OSS_ENDPOINT.trim());
  const client = new OSS({
    region,
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID.trim(),
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET.trim(),
    bucket,
    endpoint,
    secure: true,
  });
  const signedReadUrl = ensureHttpsUrl(
    client.signatureUrl(sample.mediaStorageKey, { expires: 60, method: "GET" }),
  );
  const signedPutUrl = ensureHttpsUrl(
    client.signatureUrl(sample.mediaStorageKey, {
      expires: 60,
      method: "PUT",
      "Content-Type": "text/plain",
    }),
  );

  if (!runRoundtrip) {
    writeReport({
      status: "ok",
      provider: "aliyun_oss",
      bucket,
      region,
      endpoint,
      keyPrefixCompatible: sample.mediaStorageKey.startsWith(`${sample.mediaPrefix}/`),
      signedReadUrlGenerated: /^https:\/\//.test(signedReadUrl),
      signedPutUrlGenerated: /^https:\/\//.test(signedPutUrl),
      browserUploadMethod: "signed_put_url",
      roundtrip: "skipped",
      sample,
    });
    return;
  }

  const key = `app-storage-provider-smoke/${randomUUID()}.txt`;
  const body = Buffer.from("jingjing domestic aliyun oss smoke\n", "utf8");
  let uploaded = false;

  try {
    const putResult = await client.put(key, body, { mime: "text/plain" });
    uploaded = true;
    const readUrl = ensureHttpsUrl(client.signatureUrl(key, { expires: 60, method: "GET" }));
    const response = await fetch(readUrl);
    const downloaded = Buffer.from(await response.arrayBuffer());
    await client.delete(key);
    uploaded = false;

    writeReport(
      {
        status: response.ok && downloaded.equals(body) ? "ok" : "failed",
        provider: "aliyun_oss",
        bucket,
        region,
        endpoint,
        key,
        putEtag: readHeader(putResult.res.headers, "etag"),
        signedDownloadStatus: response.status,
        bytes: downloaded.length,
        signedDownloadMatched: downloaded.equals(body),
        deleted: true,
        browserUploadMethod: "signed_put_url",
        sample,
      },
      response.ok && downloaded.equals(body) ? 0 : 1,
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
        message: error instanceof Error ? error.message : "Aliyun OSS roundtrip failed.",
      },
      1,
    );
  }
}

function buildSamples() {
  const merchantId = getArgValue("--merchant-id") || "00000000-0000-4000-8000-000000000101";
  const ownerId = getArgValue("--owner-id") || "00000000-0000-4000-8000-000000000201";
  const documentId = getArgValue("--document-id") || "00000000-0000-4000-8000-000000000301";
  const mediaPrefix = `draft-inputs/${merchantId}/${ownerId}`;
  const mediaStorageKey = `${mediaPrefix}/${randomUUID()}-demo-video.mp4`;
  const knowledgeStorageKey = `knowledge/merchant/${merchantId}/${documentId}/demo.md`;

  return {
    mediaPrefix,
    mediaStorageKey,
    knowledgeStorageKey,
  };
}

function putCosObject(input) {
  return new Promise((resolve, reject) => {
    input.client.putObject(
      {
        Bucket: input.bucket,
        Region: input.region,
        Key: input.key,
        Body: input.body,
        ContentType: "text/plain",
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

function deleteCosObject(input) {
  return new Promise((resolve, reject) => {
    input.client.deleteObject(
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

function writeReport(report, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCode;
}

function normalizeEndpoint(endpoint) {
  return endpoint.replace(/^https?:\/\//i, "");
}

function ensureHttpsUrl(url) {
  return url.replace(/^http:\/\//i, "https://");
}

function readHeader(headers, name) {
  const normalizedName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === normalizedName && typeof value === "string") {
      return value;
    }
  }

  return null;
}

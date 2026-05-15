import { createHmac, timingSafeEqual } from "node:crypto";

import type { PrivateMediaDownloadKind } from "./private-media-pexels-adapter.ts";

export type PrivateMediaDownloadTokenPayload = {
  clipId: string;
  kind: PrivateMediaDownloadKind;
  expiresAt: string;
};

export type PrivateMediaDownloadTokenVerifyResult =
  | { ok: true; payload: PrivateMediaDownloadTokenPayload }
  | { ok: false; error: "malformed" | "bad_signature" | "expired" };

const TOKEN_VERSION = "v1";

export function createPrivateMediaDownloadToken(input: {
  payload: PrivateMediaDownloadTokenPayload;
  secret: string;
}) {
  const encodedPayload = base64UrlEncode(JSON.stringify(input.payload));
  const signature = sign(`${TOKEN_VERSION}.${encodedPayload}`, input.secret);

  return `${TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

export function verifyPrivateMediaDownloadToken(input: {
  token: string;
  secret: string;
  now: string;
}): PrivateMediaDownloadTokenVerifyResult {
  const parts = input.token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return { ok: false, error: "malformed" };
  }

  const signedPart = `${parts[0]}.${parts[1]}`;
  const expectedSignature = sign(signedPart, input.secret);
  if (!safeEqual(expectedSignature, parts[2] ?? "")) {
    return { ok: false, error: "bad_signature" };
  }

  const payload = parsePayload(parts[1] ?? "");
  if (!payload) {
    return { ok: false, error: "malformed" };
  }

  const nowMs = Date.parse(input.now);
  const expiresMs = Date.parse(payload.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return { ok: false, error: "expired" };
  }

  return { ok: true, payload };
}

function parsePayload(encodedPayload: string): PrivateMediaDownloadTokenPayload | null {
  try {
    const raw = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<PrivateMediaDownloadTokenPayload>;
    if (
      typeof raw.clipId !== "string" ||
      !raw.clipId.trim() ||
      typeof raw.kind !== "string" ||
      !isDownloadKind(raw.kind) ||
      typeof raw.expiresAt !== "string" ||
      !raw.expiresAt.trim()
    ) {
      return null;
    }

    return {
      clipId: raw.clipId,
      kind: raw.kind,
      expiresAt: raw.expiresAt,
    };
  } catch {
    return null;
  }
}

function isDownloadKind(value: string): value is PrivateMediaDownloadKind {
  return ["video", "thumb", "original", "large", "medium", "portrait", "landscape"].includes(value);
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

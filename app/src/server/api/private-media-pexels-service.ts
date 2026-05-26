import "server-only";

import {
  PrivateMediaPexelsQueryError,
  searchPrivateMediaPexels,
  type PrivateMediaPexelsSearchKind,
} from "@/lib/private-media-pexels-service-core";
import type { PrivateMediaClipRepository } from "@/lib/private-media-fixture-repository";
import { getOperationalMerchantWorkspaceByUserId } from "@/lib/db/merchant-repository";
import { ApiError } from "@/server/api/errors";

export { getPrivateMediaDownloadTokenSecret } from "@/lib/private-media-pexels-service-core";

export async function searchPrivateMediaPexelsForUser(input: {
  userId: string;
  requestUrl: string;
  kind: PrivateMediaPexelsSearchKind;
  repository?: PrivateMediaClipRepository;
  now?: string;
}) {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.userId);

  try {
    if (input.kind === "video") {
      return await searchPrivateMediaPexels({
        merchantId: workspace.merchantProfile.id,
        requestUrl: input.requestUrl,
        kind: "video",
        repository: input.repository,
        now: input.now,
      });
    }

    return await searchPrivateMediaPexels({
      merchantId: workspace.merchantProfile.id,
      requestUrl: input.requestUrl,
      kind: "photo",
      repository: input.repository,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof PrivateMediaPexelsQueryError) {
      throw new ApiError(400, error.code, error.message);
    }

    throw error;
  }
}

export async function searchPrivateMediaPexelsForMerchantService(input: {
  merchantId: string;
  requestUrl: string;
  kind: PrivateMediaPexelsSearchKind;
  authorizationHeader: string | null;
  repository?: PrivateMediaClipRepository;
  now?: string;
}) {
  assertPrivatePexelsServiceBearer(input.authorizationHeader);

  try {
    if (input.kind === "video") {
      return await searchPrivateMediaPexels({
        merchantId: input.merchantId,
        requestUrl: input.requestUrl,
        kind: "video",
        repository: input.repository,
        now: input.now,
      });
    }

    return await searchPrivateMediaPexels({
      merchantId: input.merchantId,
      requestUrl: input.requestUrl,
      kind: "photo",
      repository: input.repository,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof PrivateMediaPexelsQueryError) {
      throw new ApiError(400, error.code, error.message);
    }

    throw error;
  }
}

export function assertPrivatePexelsServiceBearer(
  authorizationHeader: string | null | undefined,
) {
  const configured = process.env.PRIVATE_PEXELS_API_KEY?.trim();
  if (!configured) {
    throw new ApiError(
      503,
      "PRIVATE_PEXELS_API_KEY_NOT_CONFIGURED",
      "PRIVATE_PEXELS_API_KEY is required for merchant private media search.",
    );
  }

  const prefix = "Bearer ";
  const actual = authorizationHeader?.startsWith(prefix)
    ? authorizationHeader.slice(prefix.length).trim()
    : "";
  if (!actual || actual !== configured) {
    throw new ApiError(
      401,
      "PRIVATE_PEXELS_UNAUTHORIZED",
      "Private media search requires a valid bearer token.",
    );
  }
}

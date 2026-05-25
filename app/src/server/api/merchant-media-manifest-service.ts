import "server-only";

import type { z } from "zod";

import { getMerchantMediaRepository } from "@/lib/db/merchant-media-repository";
import { getOperationalMerchantWorkspaceByUserId } from "@/lib/db/merchant-repository";
import {
  MerchantMediaManifestContractError,
  receiveMerchantMediaManifest,
  type MerchantMediaManifestResult,
} from "@/lib/merchant-media-manifest";
import type { MerchantMediaRepository } from "@/lib/merchant-media-repository-contract";
import { ApiError } from "@/server/api/errors";
import type { merchantMediaManifestSchema } from "@/server/api/schemas";
import { getConfiguredObjectStorageProvider } from "@/server/storage";

export type MerchantMediaManifestRequest = z.infer<typeof merchantMediaManifestSchema>;

export type { MerchantMediaManifestResult };

export async function receiveMerchantMediaManifestForUser(input: {
  userId: string;
  request: MerchantMediaManifestRequest;
  repository?: MerchantMediaRepository;
  now?: string;
}): Promise<MerchantMediaManifestResult> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.userId);

  try {
    return await receiveMerchantMediaManifest({
      userId: input.userId,
      merchantId: workspace.merchantProfile.id,
      request: input.request,
      repository: input.repository ?? getMerchantMediaRepository(),
      defaultBucketName: getConfiguredObjectStorageProvider().getConfig().bucket,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof MerchantMediaManifestContractError) {
      throw new ApiError(error.status, error.code, error.message, error.details);
    }

    throw error;
  }
}

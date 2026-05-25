import { getPrivateMediaRepository } from "@/lib/db/merchant-media-repository";
import { resolvePrivateMediaDownload } from "@/lib/private-media-download-service-core";
import { handleApiError, ApiError } from "@/server/api/errors";
import { getPrivateMediaDownloadTokenSecret } from "@/server/api/private-media-pexels-service";
import { getObjectStorageProvider } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const resolved = await resolvePrivateMediaDownload({
      token,
      secret: getPrivateMediaDownloadTokenSecret(),
      now: new Date().toISOString(),
      repository: getPrivateMediaRepository(),
      signReadUrl: (input) =>
        getObjectStorageProvider().createSignedReadUrl({
          bucketName: input.bucketName,
          storageKey: input.storageKey,
          responseContentDisposition: input.responseContentDisposition,
          responseContentType: input.responseContentType,
        }),
    });

    if (!resolved.ok) {
      throw new ApiError(
        resolved.status,
        resolved.code,
        resolved.message,
      );
    }

    return new Response(null, {
      status: resolved.status,
      headers: {
        location: resolved.location,
        "cache-control": "private, max-age=0, no-store",
        "content-type": resolved.contentType,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { handleApiError } from "@/server/api/errors";
import { searchPrivateMediaPexelsForMerchantService } from "@/server/api/private-media-pexels-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  try {
    const { merchantId } = await context.params;
    const response = await searchPrivateMediaPexelsForMerchantService({
      merchantId,
      requestUrl: request.url,
      kind: "photo",
      authorizationHeader: request.headers.get("authorization"),
    });

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

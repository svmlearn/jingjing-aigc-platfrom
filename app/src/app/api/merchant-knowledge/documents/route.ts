import { Buffer } from "node:buffer";

import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { ApiError, handleApiError } from "@/server/api/errors";
import {
  createMerchantMemoryForMerchant,
  listKnowledgeDocumentsForMerchant,
  uploadKnowledgeDocumentForMerchant,
} from "@/server/api/knowledge-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const merchant = await getOperationalMerchantProfileByOwnerUserId(user.id);
    const documents = await listKnowledgeDocumentsForMerchant(merchant.id);

    return Response.json({ documents });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const merchant = await getOperationalMerchantProfileByOwnerUserId(user.id);
    const formData = await request.formData();
    const action = getStringFormValue(formData, "action") ?? "document";

    if (action === "memory") {
      const document = await createMerchantMemoryForMerchant({
        merchantId: merchant.id,
        createdByUserId: user.id,
        title: getStringFormValue(formData, "title"),
        textContent: getStringFormValue(formData, "textContent"),
      });

      return Response.json({ document }, { status: 201 });
    }

    if (action !== "document") {
      throw new ApiError(
        400,
        "MERCHANT_KNOWLEDGE_ACTION_INVALID",
        "用户知识库操作类型无效。",
      );
    }

    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

    if (!file) {
      throw new ApiError(
        400,
        "MERCHANT_KNOWLEDGE_FILE_REQUIRED",
        "请选择要上传的 txt 或 md 文件。",
      );
    }

    const document = await uploadKnowledgeDocumentForMerchant({
      merchantId: merchant.id,
      createdByUserId: user.id,
      title: getStringFormValue(formData, "title"),
      file: {
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        body: Buffer.from(await file.arrayBuffer()),
      },
    });

    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

function getStringFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

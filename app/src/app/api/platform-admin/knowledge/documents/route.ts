import { Buffer } from "node:buffer";

import {
  listKnowledgeDocumentsForPlatformAdmin,
  uploadKnowledgeDocumentForPlatformAdmin,
} from "@/server/api/knowledge-service";
import { ApiError, assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertPlatformAdminAccess(request);
    const documents = await listKnowledgeDocumentsForPlatformAdmin();

    return Response.json({ documents });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertPlatformAdminAccess(request);
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    const scope = getStringFormValue(formData, "scope") ?? "platform";

    if (scope !== "platform" && scope !== "merchant") {
      throw new ApiError(400, "KNOWLEDGE_SCOPE_INVALID", "Knowledge document scope is invalid.");
    }

    const document = await uploadKnowledgeDocumentForPlatformAdmin({
      title: getStringFormValue(formData, "title"),
      scope,
      merchantId: getStringFormValue(formData, "merchantId"),
      sourceName: getStringFormValue(formData, "sourceName") ?? file?.name ?? null,
      textContent: getStringFormValue(formData, "textContent"),
      file: file
        ? {
            fileName: file.name,
            mimeType: file.type || null,
            sizeBytes: file.size,
            body: Buffer.from(await file.arrayBuffer()),
          }
        : null,
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

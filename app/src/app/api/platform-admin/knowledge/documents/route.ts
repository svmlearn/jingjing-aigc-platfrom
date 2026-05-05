import { Buffer } from "node:buffer";

import {
  listKnowledgeDocumentsForPlatformAdmin,
  uploadKnowledgeDocumentForPlatformAdmin,
} from "@/server/api/knowledge-service";
import { replaceKnowledgeDocumentSets } from "@/lib/db/agent-console-repository";
import { ApiError, assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { updateKnowledgeDocumentSetsSchema } from "@/server/api/schemas";

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
    const knowledgeSetIds = parseKnowledgeSetIds(formData);

    const document = await uploadKnowledgeDocumentForPlatformAdmin({
      title: getStringFormValue(formData, "title"),
      scope: "platform",
      merchantId: null,
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
    const memberships = await replaceKnowledgeDocumentSets({
      documentId: document.id,
      knowledgeSetIds,
    });

    return Response.json({ document, memberships }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

function parseKnowledgeSetIds(formData: FormData) {
  const rawValues = formData.getAll("knowledgeSetIds");
  const parsedValues = rawValues.flatMap((value) => {
    if (typeof value !== "string") {
      return [];
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        throw new ApiError(400, "KNOWLEDGE_SET_IDS_INVALID", "知识集参数格式不正确");
      }
      return Array.isArray(parsed) ? parsed : [];
    }

    return [trimmed];
  });

  const payload = updateKnowledgeDocumentSetsSchema.parse({
    knowledgeSetIds: parsedValues,
  });

  if (payload.knowledgeSetIds.length === 0) {
    throw new ApiError(400, "KNOWLEDGE_SET_REQUIRED", "请选择至少一个知识集");
  }

  return payload.knowledgeSetIds;
}

function getStringFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

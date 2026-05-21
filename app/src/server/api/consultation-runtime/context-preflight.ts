import type { ChatMessage } from "../ai-runtime";

export type ConsultationContextPreflightAction = {
  messageIndex: number;
  role: ChatMessage["role"];
  reason:
    | "system_clipped"
    | "user_json_compacted"
    | "user_clipped"
    | "tool_result_compacted"
    | "assistant_clipped"
    | "message_omitted"
    | "hard_budget_unavoidable";
  beforeChars: number;
  afterChars: number;
};

export type ConsultationContextPreflightReport = {
  policy: "consultation_context_preflight_enforcer_v1";
  phase: string;
  maxTotalChars: number;
  originalChars: number;
  finalChars: number;
  clippedMessageCount: number;
  omittedMessageCount: number;
  hardBudgetSatisfied: boolean;
  overflowReason: string | null;
  actions: ConsultationContextPreflightAction[];
};

const consultationMessageBudgetLimits = {
  maxTotalChars: 28_000,
  maxSystemChars: 14_000,
  maxUserChars: 12_000,
  maxAssistantChars: 4_000,
  maxToolResultChars: 4_500,
  maxToolPayloadChars: 1_800,
  maxKnowledgeMatchContentChars: 700,
  maxStrategyMarkdownChars: 6_000,
};

type IndexedMessage = {
  message: ChatMessage;
  index: number;
};

export function enforceConsultationMessageBudget(input: {
  messages: ChatMessage[];
  phase: string;
  maxTotalChars?: number;
}): {
  messages: ChatMessage[];
  report: ConsultationContextPreflightReport;
} {
  const limits = {
    ...consultationMessageBudgetLimits,
    maxTotalChars: input.maxTotalChars ?? consultationMessageBudgetLimits.maxTotalChars,
  };
  const actions: ConsultationContextPreflightAction[] = [];
  const originalChars = getMessagesCharCount(input.messages);
  const compactedMessages = input.messages.map((message, index) =>
    compactChatMessageForBudget({
      message,
      index,
      limits,
      actions,
    }),
  );
  const selectedMessages = selectMessagesWithinCharBudget({
    messages: compactedMessages,
    maxTotalChars: limits.maxTotalChars,
    actions,
  });
  const hardened = fitMessagesToHardBudget({
    messages: selectedMessages,
    maxTotalChars: limits.maxTotalChars,
    limits,
    actions,
    allowOmitNonSystemGroups: true,
  });
  const finalChars = getMessagesCharCount(hardened.messages);
  const hardBudgetSatisfied = finalChars <= limits.maxTotalChars;
  const overflowReason = hardBudgetSatisfied
    ? null
    : hardened.overflowReason ?? "irreducible_messages_exceed_budget";

  if (!hardBudgetSatisfied) {
    actions.push({
      messageIndex: -1,
      role: "system",
      reason: "hard_budget_unavoidable",
      beforeChars: finalChars,
      afterChars: finalChars,
    });
  }

  return {
    messages: hardened.messages,
    report: {
      policy: "consultation_context_preflight_enforcer_v1",
      phase: input.phase,
      maxTotalChars: limits.maxTotalChars,
      originalChars,
      finalChars,
      clippedMessageCount: actions.filter(
        (action) =>
          action.reason !== "message_omitted" &&
          action.reason !== "hard_budget_unavoidable",
      ).length,
      omittedMessageCount: actions.filter((action) => action.reason === "message_omitted").length,
      hardBudgetSatisfied,
      overflowReason,
      actions,
    },
  };
}

function compactChatMessageForBudget(input: {
  message: ChatMessage;
  index: number;
  limits: typeof consultationMessageBudgetLimits;
  actions: ConsultationContextPreflightAction[];
}): ChatMessage {
  const beforeChars = getMessageCharCount(input.message);

  if (input.message.role === "system") {
    const content = clipMiddle(input.message.content, input.limits.maxSystemChars);
    return recordMessageAction({
      message: { ...input.message, content },
      index: input.index,
      role: input.message.role,
      reason: "system_clipped",
      beforeChars,
      actions: input.actions,
    });
  }

  if (input.message.role === "tool") {
    const content = compactToolResultContent({
      content: input.message.content,
      limits: input.limits,
    });
    return recordMessageAction({
      message: { ...input.message, content },
      index: input.index,
      role: input.message.role,
      reason: "tool_result_compacted",
      beforeChars,
      actions: input.actions,
    });
  }

  if (input.message.role === "assistant") {
    const content =
      typeof input.message.content === "string"
        ? clipMiddle(input.message.content, input.limits.maxAssistantChars)
        : input.message.content;

    return recordMessageAction({
      message: { ...input.message, content },
      index: input.index,
      role: input.message.role,
      reason: "assistant_clipped",
      beforeChars,
      actions: input.actions,
    });
  }

  const compactedJson = compactUserJsonContent({
    content: input.message.content,
    limits: input.limits,
  });
  const content = clipMiddle(compactedJson.content, input.limits.maxUserChars);
  return recordMessageAction({
    message: { ...input.message, content },
    index: input.index,
    role: input.message.role,
    reason: compactedJson.changed ? "user_json_compacted" : "user_clipped",
    beforeChars,
    actions: input.actions,
  });
}

function recordMessageAction<T extends ChatMessage>(input: {
  message: T;
  index: number;
  role: ChatMessage["role"];
  reason: ConsultationContextPreflightAction["reason"];
  beforeChars: number;
  actions: ConsultationContextPreflightAction[];
}): T {
  const afterChars = getMessageCharCount(input.message);

  if (afterChars < input.beforeChars) {
    input.actions.push({
      messageIndex: input.index,
      role: input.role,
      reason: input.reason,
      beforeChars: input.beforeChars,
      afterChars,
    });
  }

  return input.message;
}

function compactUserJsonContent(input: {
  content: string;
  limits: typeof consultationMessageBudgetLimits;
}) {
  const parsed = parseJsonRecord(input.content);

  if (!parsed) {
    return {
      content: input.content,
      changed: false,
    };
  }

  const compacted = compactKnownUserPayload(parsed, input.limits);
  const content = JSON.stringify(compacted);

  return {
    content,
    changed: content.length < input.content.length,
  };
}

function compactKnownUserPayload(
  value: Record<string, unknown>,
  limits: typeof consultationMessageBudgetLimits,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...value };

  if (typeof next.userMessage === "string") {
    next.userMessage = clipText(next.userMessage, 5_000);
  }

  if (Array.isArray(next.currentKnowledgeMatches)) {
    next.currentKnowledgeMatches = compactKnowledgeMatches(next.currentKnowledgeMatches, limits);
  }

  if (readRecord(next.strategySnapshot)) {
    next.strategySnapshot = compactStrategySnapshotForBudget(next.strategySnapshot, limits);
  }

  if (readRecord(next.currentStrategySnapshot)) {
    next.currentStrategySnapshot = compactStrategySnapshotForBudget(next.currentStrategySnapshot, limits);
  }

  if (Array.isArray(next.recentConversation)) {
    next.recentConversation = next.recentConversation.slice(-6).map((item) => {
      const record = readRecord(item);

      if (!record) {
        return item;
      }

      return {
        ...record,
        content: typeof record.content === "string" ? clipText(record.content, 600) : record.content,
      };
    });
  }

  if (Array.isArray(next.recentUserMessages)) {
    next.recentUserMessages = next.recentUserMessages
      .slice(-4)
      .map((message) => (typeof message === "string" ? clipText(message, 600) : message));
  }

  const toolResult = readRecord(next.result);

  if (next.type === "tool_result" && toolResult) {
    next.result = compactToolResultObject(toolResult, limits);
  }

  return next;
}

function compactStrategySnapshotForBudget(
  value: unknown,
  limits: typeof consultationMessageBudgetLimits,
) {
  const record = readRecord(value);

  if (!record) {
    return value;
  }

  return {
    ...record,
    positioning: typeof record.positioning === "string" ? clipText(record.positioning, 800) : record.positioning,
    currentSuggestion:
      typeof record.currentSuggestion === "string"
        ? clipText(record.currentSuggestion, 1_000)
        : record.currentSuggestion,
    strategyMarkdown:
      typeof record.strategyMarkdown === "string"
        ? clipMiddle(record.strategyMarkdown, limits.maxStrategyMarkdownChars)
        : record.strategyMarkdown,
    coreSellingPoints: clipStringArray(record.coreSellingPoints, 12, 240),
    targetAudiences: clipStringArray(record.targetAudiences, 12, 240),
    keyScenes: clipStringArray(record.keyScenes, 12, 240),
    strategyTags: clipStringArray(record.strategyTags, 12, 120),
    contentCalendarDraft: compactObjectArray(record.contentCalendarDraft, 8, 240),
  };
}

function compactToolResultContent(input: {
  content: string;
  limits: typeof consultationMessageBudgetLimits;
}) {
  const parsed = parseJsonRecord(input.content);

  if (!parsed) {
    return clipMiddle(input.content, input.limits.maxToolResultChars);
  }

  const compacted = compactToolResultObject(parsed, input.limits);
  let content = JSON.stringify(compacted);

  if (content.length > input.limits.maxToolResultChars) {
    const fallback = {
      ok: compacted.ok,
      toolName: compacted.toolName,
      rawToolName: compacted.rawToolName ?? null,
      status: compacted.status,
      summary: typeof compacted.summary === "string" ? clipText(compacted.summary, 1_000) : compacted.summary,
      compactPolicy: "tool_result_payload_omitted_v1",
      originalChars: input.content.length,
    };
    content = JSON.stringify(fallback);
  }

  return clipMiddle(content, input.limits.maxToolResultChars);
}

function compactToolResultObject(
  value: Record<string, unknown>,
  limits: typeof consultationMessageBudgetLimits,
): Record<string, unknown> {
  const result = readRecord(value.result);

  if (result) {
    return {
      ...value,
      result: compactToolResultObject(result, limits),
    };
  }

  const payload = readRecord(value.payload);
  const payloadChars = payload ? JSON.stringify(payload).length : 0;

  return {
    ...value,
    summary: typeof value.summary === "string" ? clipText(value.summary, 1_000) : value.summary,
    payload: payload && payloadChars > limits.maxToolPayloadChars
      ? {
          compactPolicy: "tool_payload_preview_v1",
          preview: clipMiddle(JSON.stringify(payload), limits.maxToolPayloadChars),
          omittedChars: Math.max(0, payloadChars - limits.maxToolPayloadChars),
        }
      : value.payload,
    knowledgeMatches: Array.isArray(value.knowledgeMatches)
      ? compactKnowledgeMatches(value.knowledgeMatches, limits)
      : value.knowledgeMatches,
  };
}

function compactKnowledgeMatches(
  values: unknown[],
  limits: typeof consultationMessageBudgetLimits,
) {
  return values.slice(0, 5).map((value) => {
    const record = readRecord(value);

    if (!record) {
      return value;
    }

    return {
      ...record,
      content: typeof record.content === "string"
        ? clipText(record.content, limits.maxKnowledgeMatchContentChars)
        : record.content,
      excerpt: typeof record.excerpt === "string"
        ? clipText(record.excerpt, limits.maxKnowledgeMatchContentChars)
        : record.excerpt,
    };
  });
}

function compactObjectArray(value: unknown, limit: number, textLimit: number) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.slice(0, limit).map((item) => {
    const record = readRecord(item);

    if (!record) {
      return item;
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [
        key,
        typeof entry === "string" ? clipText(entry, textLimit) : entry,
      ]),
    );
  });
}

function clipStringArray(value: unknown, limit: number, textLimit: number) {
  return Array.isArray(value)
    ? value.slice(0, limit).map((item) => (typeof item === "string" ? clipText(item, textLimit) : item))
    : value;
}

function selectMessagesWithinCharBudget(input: {
  messages: ChatMessage[];
  maxTotalChars: number;
  actions: ConsultationContextPreflightAction[];
}) {
  const total = getMessagesCharCount(input.messages);

  if (total <= input.maxTotalChars) {
    return input.messages;
  }

  const indexedMessages = input.messages.map((message, index) => ({ message, index }));
  const systemMessages = indexedMessages.filter((item) => item.message.role === "system");
  const nonSystemMessages = indexedMessages.filter((item) => item.message.role !== "system");
  const systemChars = getMessagesCharCount(systemMessages.map((item) => item.message));
  const maxNonSystemChars = Math.max(0, input.maxTotalChars - systemChars);
  const recentGroups: IndexedMessage[][] = [];
  let used = 0;

  for (let index = nonSystemMessages.length - 1; index >= 0;) {
    const { group, nextIndex } = takeNewestMessageGroup(nonSystemMessages, index);
    index = nextIndex;

    if (group.length === 0) {
      continue;
    }

    const groupChars = getMessagesCharCount(group.map((item) => item.message));

    if (used + groupChars > maxNonSystemChars) {
      if (recentGroups.length === 0) {
        recentGroups.unshift(group);
        used += groupChars;
      } else {
        recordOmittedMessages({
          group,
          actions: input.actions,
        });
      }
      break;
    }

    recentGroups.unshift(group);
    used += groupChars;

    if (used >= maxNonSystemChars) {
      break;
    }
  }

  const selected = [...systemMessages, ...recentGroups.flat()];
  const selectedIndexes = new Set(selected.map((item) => item.index));

  for (const item of indexedMessages) {
    if (selectedIndexes.has(item.index)) {
      continue;
    }

    if (
      input.actions.some(
        (action) =>
          action.reason === "message_omitted" &&
          action.messageIndex === item.index,
      )
    ) {
      continue;
    }

    input.actions.push({
      messageIndex: item.index,
      role: item.message.role,
      reason: "message_omitted",
      beforeChars: getMessageCharCount(item.message),
      afterChars: 0,
    });
  }

  return selected.map((item) => item.message);
}

function takeNewestMessageGroup(
  messages: IndexedMessage[],
  startIndex: number,
): {
  group: IndexedMessage[];
  nextIndex: number;
} {
  const group: IndexedMessage[] = [];
  const item = messages[startIndex];
  let index = startIndex;

  if (!item) {
    return {
      group,
      nextIndex: index - 1,
    };
  }

  if (item.message.role === "tool") {
    while (index >= 0 && messages[index]?.message.role === "tool") {
      group.unshift(messages[index] as IndexedMessage);
      index -= 1;
    }

    const assistant = messages[index];

    if (assistant?.message.role === "assistant" && assistant.message.toolCalls?.length) {
      group.unshift(assistant);
      index -= 1;
    }

    return {
      group,
      nextIndex: index,
    };
  }

  group.unshift(item);

  return {
    group,
    nextIndex: index - 1,
  };
}

function fitMessagesToHardBudget(input: {
  messages: ChatMessage[];
  maxTotalChars: number;
  limits: typeof consultationMessageBudgetLimits;
  actions: ConsultationContextPreflightAction[];
  allowOmitNonSystemGroups: boolean;
}): {
  messages: ChatMessage[];
  overflowReason: string | null;
} {
  let messages = input.messages;
  let total = getMessagesCharCount(messages);

  if (total <= input.maxTotalChars) {
    return {
      messages,
      overflowReason: null,
    };
  }

  messages = clipMessagesForHardBudget({
    messages,
    maxTotalChars: input.maxTotalChars,
    limits: input.limits,
    actions: input.actions,
  });
  total = getMessagesCharCount(messages);

  if (total <= input.maxTotalChars) {
    return {
      messages,
      overflowReason: null,
    };
  }

  if (input.allowOmitNonSystemGroups) {
    messages = omitOldestNonSystemGroupsForBudget({
      messages,
      maxTotalChars: input.maxTotalChars,
      actions: input.actions,
    });
    total = getMessagesCharCount(messages);
  }

  if (total <= input.maxTotalChars) {
    return {
      messages,
      overflowReason: null,
    };
  }

  messages = clipMessagesForHardBudget({
    messages,
    maxTotalChars: input.maxTotalChars,
    limits: input.limits,
    actions: input.actions,
    includeMinimumContent: true,
  });
  total = getMessagesCharCount(messages);

  return {
    messages,
    overflowReason: total <= input.maxTotalChars
      ? null
      : "minimum_message_structure_exceeds_budget",
  };
}

function clipMessagesForHardBudget(input: {
  messages: ChatMessage[];
  maxTotalChars: number;
  limits: typeof consultationMessageBudgetLimits;
  actions: ConsultationContextPreflightAction[];
  includeMinimumContent?: boolean;
}) {
  const messages = [...input.messages];
  let total = getMessagesCharCount(messages);
  const orderedIndexes = getHardBudgetClipOrder(messages);

  for (const index of orderedIndexes) {
    if (total <= input.maxTotalChars) {
      break;
    }

    const message = messages[index];

    if (!message) {
      continue;
    }

    const currentContentLength = getMessageContentLength(message);
    const minimumContentLength = input.includeMinimumContent
      ? 0
      : getMinimumContentLength(message);

    if (currentContentLength <= minimumContentLength) {
      continue;
    }

    const currentChars = getMessageCharCount(message);
    let low = minimumContentLength;
    let high = currentContentLength - 1;
    let bestMessage: ChatMessage | null = null;
    let bestChars = Number.POSITIVE_INFINITY;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = clipMessageContentToLength({
        message,
        contentLength: middle,
        limits: input.limits,
      });
      const candidateChars = getMessageCharCount(candidate);
      const candidateTotal = total - currentChars + candidateChars;

      if (candidateTotal <= input.maxTotalChars) {
        bestMessage = candidate;
        bestChars = candidateChars;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    if (!bestMessage) {
      bestMessage = clipMessageContentToLength({
        message,
        contentLength: minimumContentLength,
        limits: input.limits,
      });
      bestChars = getMessageCharCount(bestMessage);
    }

    if (bestChars < currentChars) {
      messages[index] = bestMessage;
      total = total - currentChars + bestChars;
      input.actions.push({
        messageIndex: index,
        role: message.role,
        reason: getClipReasonForMessage(message),
        beforeChars: currentChars,
        afterChars: bestChars,
      });
    }
  }

  return messages;
}

function getHardBudgetClipOrder(messages: ChatMessage[]) {
  const latestUserIndex = findLastIndex(messages, (message) => message.role === "user");
  const byPriority: number[][] = [
    [],
    [],
    [],
    [],
    [],
  ];

  messages.forEach((message, index) => {
    if (message.role === "tool") {
      byPriority[0].push(index);
      return;
    }

    if (message.role === "assistant") {
      byPriority[1].push(index);
      return;
    }

    if (message.role === "user" && index !== latestUserIndex) {
      byPriority[2].push(index);
      return;
    }

    if (message.role === "system") {
      byPriority[3].push(index);
      return;
    }

    byPriority[4].push(index);
  });

  return byPriority.flat();
}

function omitOldestNonSystemGroupsForBudget(input: {
  messages: ChatMessage[];
  maxTotalChars: number;
  actions: ConsultationContextPreflightAction[];
}) {
  let messages = input.messages;
  let total = getMessagesCharCount(messages);

  while (total > input.maxTotalChars) {
    const indexedNonSystem = messages
      .map((message, index) => ({ message, index }))
      .filter((item) => item.message.role !== "system");

    if (indexedNonSystem.length === 0) {
      return messages;
    }

    const { group } = takeOldestMessageGroup(indexedNonSystem);

    if (group.length === 0) {
      return messages;
    }

    const omitIndexes = new Set(group.map((item) => item.index));
    recordOmittedMessages({
      group,
      actions: input.actions,
    });
    messages = messages.filter((_, index) => !omitIndexes.has(index));
    total = getMessagesCharCount(messages);
  }

  return messages;
}

function takeOldestMessageGroup(messages: IndexedMessage[]) {
  const first = messages[0];

  if (!first) {
    return {
      group: [] as IndexedMessage[],
    };
  }

  if (first.message.role === "assistant" && first.message.toolCalls?.length) {
    const group = [first];
    let index = 1;

    while (index < messages.length && messages[index]?.message.role === "tool") {
      group.push(messages[index] as IndexedMessage);
      index += 1;
    }

    return {
      group,
    };
  }

  if (first.message.role === "tool") {
    const group = [first];
    let index = 1;

    while (index < messages.length && messages[index]?.message.role === "tool") {
      group.push(messages[index] as IndexedMessage);
      index += 1;
    }

    return {
      group,
    };
  }

  return {
    group: [first],
  };
}

function recordOmittedMessages(input: {
  group: IndexedMessage[];
  actions: ConsultationContextPreflightAction[];
}) {
  for (const item of input.group) {
    if (
      input.actions.some(
        (action) =>
          action.reason === "message_omitted" &&
          action.messageIndex === item.index,
      )
    ) {
      continue;
    }

    input.actions.push({
      messageIndex: item.index,
      role: item.message.role,
      reason: "message_omitted",
      beforeChars: getMessageCharCount(item.message),
      afterChars: 0,
    });
  }
}

function getMinimumContentLength(message: ChatMessage) {
  if (message.role === "tool") {
    return Math.min(64, message.content.length);
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return Math.min(32, message.content?.length ?? 0);
  }

  return Math.min(120, getMessageContentLength(message));
}

function clipMessageContentToLength(input: {
  message: ChatMessage;
  contentLength: number;
  limits: typeof consultationMessageBudgetLimits;
}): ChatMessage {
  if (input.message.role === "tool") {
    return {
      ...input.message,
      content: compactToolResultContentForHardLimit({
        content: input.message.content,
        contentLength: input.contentLength,
        limits: input.limits,
      }),
    };
  }

  if (input.message.role === "assistant") {
    return {
      ...input.message,
      content: typeof input.message.content === "string"
        ? clipMiddle(input.message.content, input.contentLength)
        : input.message.content,
    };
  }

  return {
    ...input.message,
    content: clipMiddle(input.message.content, input.contentLength),
  };
}

function compactToolResultContentForHardLimit(input: {
  content: string;
  contentLength: number;
  limits: typeof consultationMessageBudgetLimits;
}) {
  if (input.contentLength <= 0) {
    return "";
  }

  const parsed = parseJsonRecord(input.content);

  if (!parsed) {
    return clipMiddle(input.content, input.contentLength);
  }

  const hardLimits = {
    ...input.limits,
    maxToolResultChars: input.contentLength,
    maxToolPayloadChars: Math.max(0, Math.min(input.limits.maxToolPayloadChars, Math.floor(input.contentLength / 2))),
    maxKnowledgeMatchContentChars: Math.max(0, Math.min(input.limits.maxKnowledgeMatchContentChars, Math.floor(input.contentLength / 4))),
  };
  const compacted = compactToolResultObject(parsed, hardLimits);
  let content = JSON.stringify(compacted);

  if (content.length > input.contentLength) {
    content = JSON.stringify({
      ok: compacted.ok,
      toolName: compacted.toolName,
      rawToolName: compacted.rawToolName ?? null,
      status: compacted.status,
      summary: typeof compacted.summary === "string"
        ? clipText(compacted.summary, Math.max(0, Math.min(160, Math.floor(input.contentLength / 3))))
        : compacted.summary,
      compactPolicy: "tool_result_hard_budget_v1",
    });
  }

  return clipMiddle(content, input.contentLength);
}

function getMessageContentLength(message: ChatMessage) {
  if (message.role === "assistant") {
    return typeof message.content === "string" ? message.content.length : 0;
  }

  return message.content.length;
}

function getClipReasonForMessage(
  message: ChatMessage,
): Exclude<ConsultationContextPreflightAction["reason"], "message_omitted" | "hard_budget_unavoidable"> {
  if (message.role === "system") {
    return "system_clipped";
  }

  if (message.role === "tool") {
    return "tool_result_compacted";
  }

  if (message.role === "assistant") {
    return "assistant_clipped";
  }

  return "user_clipped";
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    return readRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function getMessagesCharCount(messages: ChatMessage[]) {
  return messages.reduce((sum, message) => sum + getMessageCharCount(message), 0);
}

function getMessageCharCount(message: ChatMessage) {
  if (message.role === "assistant") {
    return JSON.stringify({
      role: message.role,
      content: message.content ?? "",
      toolCalls: message.toolCalls ?? [],
    }).length;
  }

  if (message.role === "tool") {
    return message.content.length + message.toolCallId.length + 16;
  }

  return message.content.length + message.role.length;
}

function clipMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 120) {
    return clipText(value, maxLength);
  }

  const marker = `\n[context preflight clipped ${value.length - maxLength} chars]\n`;
  const headLength = Math.max(1, Math.floor((maxLength - marker.length) * 0.7));
  const tailLength = Math.max(1, maxLength - marker.length - headLength);

  return `${value.slice(0, headLength)}${marker}${value.slice(-tailLength)}`;
}

function clipText(value: string, maxLength: number) {
  if (maxLength <= 0) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function findLastIndex<T>(values: T[], predicate: (value: T) => boolean) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index] as T)) {
      return index;
    }
  }

  return -1;
}

export const __consultationContextPreflightTest = {
  enforceConsultationMessageBudget,
};

import { api } from "@/services/axios";
import type {
  ChatMessage,
  ChatParticipant,
  ChatSession,
  ChatSessionStatus,
  ChatSessionType,
  CreateDirectChatInput,
  CreateSupportRequestInput,
  SendChatMessageInput,
  StaffAvailability,
  StaffStatusInput,
  SupportPriority,
  SupportRequest,
} from "@/features/messages/types/chat.types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function text(source: UnknownRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function numberValue(source: UnknownRecord, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function booleanValue(source: UnknownRecord, keys: string[]) {
  return keys.some((key) => source[key] === true);
}

function identifier(source: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedId = text(asRecord(value), ["id", "_id"]);
      if (nestedId) return nestedId;
    }
  }
  return "";
}

function collectIdentifierCandidates(value: unknown) {
  const candidates: string[] = [];
  const visit = (current: unknown, key = "", depth = 0) => {
    if (depth > 4 || current == null) return;
    if (typeof current === "string") {
      if (/(^id$|id$|session|chat|conversation)/i.test(key)) {
        candidates.push(current);
      }
      return;
    }
    if (typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, key, depth + 1));
      return;
    }
    Object.entries(asRecord(current)).forEach(([nestedKey, nestedValue]) =>
      visit(nestedValue, nestedKey, depth + 1),
    );
  };
  visit(value);
  return [...new Set(candidates)];
}

function unwrapRecord(value: unknown): UnknownRecord {
  let current = asRecord(value);
  for (let depth = 0; depth < 5; depth += 1) {
    const nested = current.data ?? current.result ?? current.payload;
    if (!nested || Array.isArray(nested) || typeof nested !== "object") break;
    current = asRecord(nested);
  }
  return current;
}

function unwrapEntity(value: unknown, entityKeys: string[]) {
  const root = unwrapRecord(value);
  for (const key of entityKeys) {
    const candidate = root[key];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      return unwrapRecord(candidate);
    }
  }
  return root;
}

function findRows(value: unknown, keys: string[]): unknown[] {
  const queue: unknown[] = [value];
  const visited = new Set<object>();

  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) return current;
    if (!current || typeof current !== "object" || visited.has(current)) {
      continue;
    }
    visited.add(current);
    const source = asRecord(current);
    for (const key of keys) {
      if (Array.isArray(source[key])) return source[key] as unknown[];
    }
    for (const candidate of Object.values(source)) {
      if (candidate && typeof candidate === "object") queue.push(candidate);
    }
  }

  return [];
}

function normalizeParticipant(value: unknown): ChatParticipant | null {
  const source = asRecord(value);
  const id = text(source, ["id", "_id", "userId", "participantId"]);
  const name = text(source, ["fullName", "name", "displayName", "email"]);
  if (!id && !name) return null;

  return {
    id,
    name: name || "PropertyArk user",
    avatarUrl:
      text(source, ["avatarUrl", "avatar", "profilePicture", "image"]) || null,
    role: text(source, ["role", "userType"], "USER").toUpperCase(),
    isOnline: booleanValue(source, ["isOnline", "online"]),
  };
}

function normalizeSession(value: unknown, index = 0): ChatSession {
  const source = asRecord(value);
  const participant = normalizeParticipant(
    source.participant ??
      source.otherParticipant ??
      source.recipient ??
      source.requester ??
      source.customer ??
      source.initiator ??
      source.createdBy ??
      source.vendor ??
      source.user,
  );
  const lastMessageRecord = asRecord(source.lastMessage);
  const createdAt = text(
    source,
    ["createdAt", "startedAt"],
    new Date().toISOString(),
  );

  return {
    id: text(source, ["id", "_id", "sessionId"], `session-${index}`),
    supportRequestId:
      identifier(source, [
        "supportRequestId",
        "requestId",
        "supportRequest",
        "supportId",
        "supportTicketId",
        "ticketId",
      ]) || null,
    type: text(
      source,
      ["type", "sessionType"],
      "DIRECT",
    ).toUpperCase() as ChatSessionType,
    status: text(
      source,
      ["status"],
      "ACTIVE",
    ).toUpperCase() as ChatSessionStatus,
    subject: text(source, ["subject", "title"], "Conversation"),
    propertyId:
      text(
        source,
        ["propertyId"],
        text(asRecord(source.property), ["id", "_id"]),
      ) || null,
    participant,
    lastMessage:
      text(source, ["lastMessageText", "preview"]) ||
      text(lastMessageRecord, ["content", "message", "text"]),
    unreadCount: numberValue(source, ["unreadCount", "unread", "newMessages"]),
    createdAt,
    updatedAt: text(
      source,
      ["updatedAt", "lastMessageAt"],
      text(lastMessageRecord, ["createdAt", "sentAt"], createdAt),
    ),
  };
}

export function normalizeChatMessage(value: unknown, index = 0): ChatMessage {
  const source = unwrapEntity(value, ["message", "chatMessage"]);
  const sender = asRecord(source.sender ?? source.user ?? source.author);

  return {
    id: text(source, ["id", "_id", "messageId"], `message-${index}`),
    sessionId: text(source, ["sessionId", "chatSessionId"]),
    senderId: text(source, ["senderId", "userId"], text(sender, ["id", "_id"])),
    senderName: text(
      source,
      ["senderName"],
      text(sender, ["fullName", "name"], "PropertyArk user"),
    ),
    senderAvatarUrl:
      text(
        source,
        ["senderAvatarUrl"],
        text(sender, ["avatarUrl", "avatar"]),
      ) || null,
    content: text(source, ["content", "message", "text"]),
    messageType: text(source, ["messageType", "type"], "text"),
    createdAt: text(
      source,
      ["createdAt", "sentAt", "timestamp"],
      new Date().toISOString(),
    ),
  };
}

function normalizeSupportRequest(value: unknown, index = 0): SupportRequest {
  const source = asRecord(value);
  const nestedSession =
    source.session ?? source.chatSession ?? source.conversation ?? source.chat;
  const nestedSessionSource = asRecord(nestedSession);
  const session = normalizeSession(
    nestedSession && typeof nestedSession === "object" ? nestedSession : value,
    index,
  );
  // Chat-session records use `id` for the session, but support actions expect
  // the related support-request ID. Prefer that relation before the record ID.
  const requestId =
    identifier(source, [
      "requestId",
      "supportRequestId",
      "supportRequest",
      "supportId",
      "supportTicketId",
      "ticketId",
    ]) ||
    session.supportRequestId ||
    text(source, ["id", "_id"], session.id);
  const sessionId = identifier(source, [
    "sessionId",
    "chatSessionId",
    "supportSessionId",
    "conversationId",
    "chatId",
    "session_id",
    "chat_session_id",
    "session",
    "chatSession",
    "conversation",
    "chat",
  ]);
  const requester = normalizeParticipant(
    source.requester ??
      source.customer ??
      source.initiator ??
      source.createdBy ??
      source.user ??
      nestedSessionSource.requester ??
      nestedSessionSource.customer ??
      nestedSessionSource.initiator ??
      nestedSessionSource.createdBy ??
      nestedSessionSource.user,
  );
  const explicitStatus = text(
    source,
    ["status"],
    text(nestedSessionSource, ["status"]),
  );
  const assignedStaffRecord = normalizeParticipant(
    source.assignedStaff ??
      source.assignedTo ??
      source.acceptedBy ??
      source.handledBy ??
      source.staff ??
      source.assignee ??
      nestedSessionSource.assignedStaff ??
      nestedSessionSource.assignedTo ??
      nestedSessionSource.acceptedBy ??
      nestedSessionSource.handledBy ??
      nestedSessionSource.staff ??
      nestedSessionSource.assignee,
  );
  const assignedStaffId =
    identifier(source, [
      "assignedStaffId",
      "assignedToId",
      "acceptedById",
      "handledById",
      "staffId",
      "assigneeId",
    ]) ||
    identifier(nestedSessionSource, [
      "assignedStaffId",
      "assignedToId",
      "acceptedById",
      "handledById",
      "staffId",
      "assigneeId",
    ]);
  const assignedStaff =
    assignedStaffRecord ??
    (assignedStaffId
      ? {
          id: assignedStaffId,
          name: "Assigned staff",
          avatarUrl: null,
          role: "STAFF",
          isOnline: false,
        }
      : null);

  return {
    ...session,
    id: sessionId || session.id,
    status: (
      explicitStatus || (sessionId ? "ACTIVE" : "PENDING")
    ).toUpperCase() as ChatSessionStatus,
    participant: requester ?? session.participant,
    requestId,
    sessionCandidates: collectIdentifierCandidates(value),
    type: "SUPPORT",
    description: text(source, ["description", "details", "message"]),
    priority: text(
      source,
      ["priority"],
      "NORMAL",
    ).toUpperCase() as SupportPriority,
    requester,
    assignedStaff,
    resolutionNote:
      text(source, ["resolutionNote", "resolution", "resolvedNote"]) || null,
  };
}

function normalizeStaff(value: unknown, index = 0): StaffAvailability {
  const source = asRecord(value);
  const participant = normalizeParticipant(
    source.user ?? source.staff ?? source,
  ) ?? {
    id: `staff-${index}`,
    name: "Support staff",
    avatarUrl: null,
    role: "STAFF",
    isOnline: false,
  };

  return {
    ...participant,
    isOnline:
      booleanValue(source, ["isOnline", "online"]) || participant.isOnline,
    isAvailable: booleanValue(source, ["isAvailable", "available"]),
    maxChats: numberValue(source, ["maxChats", "capacity"]),
    activeChats: numberValue(source, ["activeChats", "currentChats"]),
  };
}

async function resolveSupportSession(request: SupportRequest) {
  const candidates = [
    request.id,
    ...request.sessionCandidates,
    request.requestId,
  ].filter(
    (candidate, index, all) =>
      candidate &&
      !candidate.startsWith("session-") &&
      all.indexOf(candidate) === index,
  );

  for (const sessionId of candidates) {
    try {
      await api.get(`/chat/sessions/${sessionId}/messages`, {
        params: { page: 1, limit: 1 },
      });
      return { ...request, id: sessionId };
    } catch (error) {
      const status = asRecord(asRecord(error).response).status;
      if (status !== 404) throw error;
    }
  }

  throw new Error("Chat session not found for this support request.");
}

export const chatService = {
  createDirect(input: CreateDirectChatInput) {
    return api
      .post<unknown>("/chat/direct", input)
      .then(({ data }) =>
        normalizeSession(
          unwrapEntity(data, ["session", "chat", "conversation"]),
        ),
      );
  },

  createSupportRequest(input: CreateSupportRequestInput) {
    return api
      .post<unknown>("/chat/support", input)
      .then(({ data }) =>
        normalizeSupportRequest(
          unwrapEntity(data, ["request", "session", "ticket"]),
        ),
      );
  },

  getSessions(type?: ChatSessionType, status?: ChatSessionStatus) {
    return api
      .get<unknown>("/chat/sessions", {
        params: { type: type || undefined, status: status || undefined },
      })
      .then(({ data }) =>
        findRows(data, ["sessions", "items", "results", "records"]).map(
          normalizeSession,
        ),
      );
  },

  getMessages(sessionId: string, page = 1, limit = 50) {
    return api
      .get<unknown>(`/chat/sessions/${sessionId}/messages`, {
        params: { page, limit },
      })
      .then(({ data }) =>
        findRows(data, ["messages", "items", "results", "records"]).map(
          normalizeChatMessage,
        ),
      );
  },

  // Message creation is the authoritative write. Socket.IO broadcasts the
  // persisted message to the other participants afterward.
  sendMessage(input: SendChatMessageInput) {
    return api
      .post<unknown>("/chat/messages", input)
      .then(({ data }) =>
        normalizeChatMessage(unwrapEntity(data, ["message", "chatMessage"])),
      );
  },

  async getPendingSupport(status: ChatSessionStatus = "PENDING") {
    if (status !== "PENDING") {
      const { data } = await api.get<unknown>("/chat/sessions", {
        params: { type: "SUPPORT", status },
      });
      return findRows(data, ["sessions", "items", "results", "records"]).map(
        normalizeSupportRequest,
      );
    }

    const { data } = await api.get<unknown>("/chat/support/pending", {
      params: { status },
    });
    return findRows(data, ["requests", "sessions", "items", "results"])
      .map(normalizeSupportRequest)
      .filter((request) => request.status === "PENDING");
  },

  async acceptSupport(request: SupportRequest) {
    const response = await api.patch<unknown>(
      `/chat/support/${request.requestId}/accept`,
    );
    const responseSession = normalizeSupportRequest(
      unwrapEntity(response.data, [
        "request",
        "supportRequest",
        "session",
        "chatSession",
      ]),
    );

    // Accepting creates/activates the chat session. Reload the active queue so
    // callers receive its session ID rather than reusing the support request ID.
    const { data } = await api.get<unknown>("/chat/sessions", {
      params: { type: "SUPPORT", status: "ACTIVE" },
    });
    const accepted = findRows(data, ["sessions", "items", "results", "records"])
      .map(normalizeSupportRequest)
      .find(
        (candidate) =>
          candidate.requestId === request.requestId ||
          (candidate.subject === request.subject &&
            (candidate.requester?.id === request.requester?.id ||
              candidate.participant?.id === request.requester?.id)) ||
          candidate.subject === request.subject,
      );

    const candidate = accepted ?? responseSession;
    return resolveSupportSession({
      ...request,
      ...candidate,
      requestId: request.requestId,
      description: candidate.description || request.description,
      requester: candidate.requester || request.requester,
      sessionCandidates: [
        ...responseSession.sessionCandidates,
        ...(accepted?.sessionCandidates ?? []),
        ...request.sessionCandidates,
      ],
    });
  },

  resolveSupportSession(request: SupportRequest) {
    return resolveSupportSession(request);
  },

  transferSupport(requestId: string, staffId: string) {
    return api.patch(`/chat/support/${requestId}/transfer`, {
      toStaffId: staffId,
    });
  },

  resolveSupport(requestId: string, resolutionNote: string) {
    return api.patch(`/chat/support/${requestId}/resolve`, { resolutionNote });
  },

  cancelSupport(requestId: string) {
    return api.patch(`/chat/support/${requestId}/cancel`);
  },

  setStaffStatus(input: StaffStatusInput) {
    return api.patch("/chat/staff/status", input);
  },

  getAvailableStaff() {
    return api
      .get<unknown>("/chat/staff/available")
      .then(({ data }) =>
        findRows(data, ["staff", "users", "items", "results"]).map(
          normalizeStaff,
        ),
      );
  },
};

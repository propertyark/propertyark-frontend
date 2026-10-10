import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatService, normalizeChatMessage } from "@/services/chat.service";
import { adminService } from "@/services/admin.service";
import { propertyService } from "@/services/property.service";
import type {
  ChatMessage,
  ChatSessionStatus,
  ChatSessionType,
  SendChatMessageInput,
} from "@/features/messages/types/chat.types";
import {
  chatSocketEvents,
  disconnectChatSocket,
  getChatSocket,
} from "@/features/messages/realtime/chat-socket";
import { useAuthStore } from "@/store/auth.store";
import { decodeMessageContent } from "@/features/messages/lib/message-content";

export type ChatConnectionStatus =
  "connecting" | "connected" | "reconnecting" | "offline";

export const chatKeys = {
  all: ["chat"] as const,
  sessions: (type?: ChatSessionType, status?: ChatSessionStatus) =>
    ["chat", "sessions", type ?? "ALL", status ?? "ALL"] as const,
  messages: (sessionId: string) =>
    ["chat", "sessions", sessionId, "messages"] as const,
  support: (status: ChatSessionStatus) => ["chat", "support", status] as const,
  availableStaff: ["chat", "staff", "available"] as const,
};

function readStateKey(userId: string) {
  return `propertyark-chat-read:${userId}`;
}

function readState(userId: string) {
  if (typeof window === "undefined" || !userId) return {};
  try {
    return JSON.parse(
      localStorage.getItem(readStateKey(userId)) ?? "{}",
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

export function markChatSessionRead(sessionId: string, userId: string) {
  if (typeof window === "undefined" || !sessionId || !userId) return;
  localStorage.setItem(
    readStateKey(userId),
    JSON.stringify({
      ...readState(userId),
      [sessionId]: new Date().toISOString(),
    }),
  );
}

export function useChatSessions(
  type?: ChatSessionType,
  status?: ChatSessionStatus,
) {
  const currentUserId = useAuthStore(
    (state) => state.userId ?? state.user?.id ?? "",
  );
  return useQuery({
    queryKey: [...chatKeys.sessions(type, status), currentUserId],
    queryFn: async () => {
      const sessions = await chatService.getSessions(type, status);
      const lastRead = readState(currentUserId);
      const enriched = await Promise.all(
        sessions.map(async (session) => {
          const messages = await chatService
            .getMessages(session.id)
            .catch(() => []);
          const ordered = [...messages].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          const latest = ordered.at(-1);
          const counterpartMessage = [...ordered]
            .reverse()
            .find(
              (message) =>
                message.senderId && message.senderId !== currentUserId,
            );
          const participant =
            session.participant ??
            (counterpartMessage
              ? {
                  id: counterpartMessage.senderId,
                  name: counterpartMessage.senderName,
                  avatarUrl: counterpartMessage.senderAvatarUrl,
                  role: "USER",
                  isOnline: false,
                }
              : null);
          const readAt = new Date(lastRead[session.id] ?? 0).getTime();
          const unreadCount = ordered.filter(
            (message) =>
              message.senderId !== currentUserId &&
              new Date(message.createdAt).getTime() > readAt,
          ).length;

          return {
            ...session,
            lastMessage:
              (latest && decodeMessageContent(latest.content).text) ||
              session.lastMessage,
            updatedAt: latest?.createdAt || session.updatedAt,
            unreadCount,
            participant,
          };
        }),
      );

      return enriched.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useChatMessages(sessionId: string | null) {
  const currentUserId = useAuthStore(
    (state) => state.userId ?? state.user?.id ?? "",
  );
  return useQuery({
    queryKey: chatKeys.messages(sessionId ?? "none"),
    queryFn: async () => {
      const messages = await chatService.getMessages(sessionId as string);
      markChatSessionRead(sessionId as string, currentUserId);
      return messages;
    },
    enabled: Boolean(sessionId),
    staleTime: 3_000,
    refetchInterval: sessionId ? 5_000 : false,
  });
}

function propertyTitleFromInquiry(subject: string) {
  return subject
    .replace(/^shortlet inquiry about\s+/i, "")
    .replace(/^inquiry about\s+/i, "")
    .trim();
}

export function useChatProperty(propertyId: string | null, subject = "") {
  const subjectTitle = propertyTitleFromInquiry(subject);

  return useQuery({
    queryKey: ["chat", "property-directory"],
    queryFn: () =>
      propertyService
        .getAvailable({ page: 1, limit: 1000 })
        .then(({ properties }) => properties),
    select: (properties) => {
      const propertyById = properties.find(
        (property) => property.id === propertyId,
      );
      if (propertyById || !subjectTitle) return propertyById;

      const normalizedSubjectTitle = subjectTitle.toLocaleLowerCase();
      return properties.find(
        (property) =>
          property.title.trim().toLocaleLowerCase() === normalizedSubjectTitle,
      );
    },
    enabled: Boolean(propertyId || subjectTitle),
    staleTime: 5 * 60_000,
  });
}

export function useChatRealtime(sessionId: string | null) {
  const token = useAuthStore((state) => state.accessToken);
  const currentUserId = useAuthStore(
    (state) => state.userId ?? state.user?.id ?? "",
  );
  const client = useQueryClient();
  const [status, setStatus] = useState<ChatConnectionStatus>(() =>
    token ? "connecting" : "offline",
  );

  useEffect(() => {
    if (!token) {
      disconnectChatSocket();
      return;
    }
    const socket = getChatSocket(token);
    const handleConnect = () => {
      setStatus("connected");
      if (sessionId) socket.emit(chatSocketEvents.join, { sessionId });
    };
    const handleDisconnect = () => setStatus("reconnecting");
    const handleConnectError = () => setStatus("offline");
    const handleMessage = (value: unknown) => {
      if (!sessionId) return;
      const incoming = normalizeChatMessage(value);
      const message = {
        ...incoming,
        sessionId: incoming.sessionId || sessionId,
      };
      if (message.sessionId !== sessionId || !message.content) return;

      markChatSessionRead(sessionId, currentUserId);

      client.setQueryData<ChatMessage[]>(
        chatKeys.messages(sessionId),
        (current = []) =>
          current.some((item) => item.id === message.id)
            ? current
            : [...current, message],
      );
      void client.invalidateQueries({ queryKey: ["chat", "sessions"] });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on(chatSocketEvents.message, handleMessage);

    if (socket.connected) handleConnect();
    else socket.connect();

    return () => {
      if (sessionId) socket.emit(chatSocketEvents.leave, { sessionId });
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off(chatSocketEvents.message, handleMessage);
    };
  }, [client, currentUserId, sessionId, token]);

  return status;
}

export function useSendChatMessage() {
  const client = useQueryClient();
  return useMutation<ChatMessage, Error, SendChatMessageInput>({
    // Persist through HTTP and use Socket.IO for live delivery. A successful
    // socket emit alone does not prove that the server handled the event.
    mutationFn: chatService.sendMessage,
    onSuccess: (savedMessage, input) => {
      const message = {
        ...savedMessage,
        sessionId: savedMessage.sessionId || input.sessionId,
        content: savedMessage.content || input.content,
      };
      client.setQueryData<ChatMessage[]>(
        chatKeys.messages(input.sessionId),
        (current = []) =>
          current.some((item) => item.id === message.id)
            ? current
            : [...current, message],
      );
      void client.invalidateQueries({
        queryKey: chatKeys.messages(input.sessionId),
      });
      void client.invalidateQueries({ queryKey: ["chat", "sessions"] });
    },
  });
}

export function useCreateSupportRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: chatService.createSupportRequest,
    onSuccess: () => void client.invalidateQueries({ queryKey: chatKeys.all }),
  });
}

export function usePendingSupportRequests(
  status: ChatSessionStatus = "PENDING",
) {
  const currentUserId = useAuthStore(
    (state) => state.userId ?? state.user?.id ?? "",
  );

  return useQuery({
    queryKey: [...chatKeys.support(status), currentUserId],
    queryFn: async () => {
      const requests = await chatService.getPendingSupport(status);

      return Promise.all(
        requests.map(async (request) => {
          if (request.status === "PENDING") return request;

          try {
            const session = await chatService.resolveSupportSession(request);
            const messages = await chatService.getMessages(session.id);
            const ordered = [...messages].sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            );
            const latest = [...ordered].sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )[0];
            const requesterMessage = ordered.find(
              (message) =>
                message.senderId &&
                message.senderId !== currentUserId &&
                message.senderId !== request.assignedStaff?.id,
            );
            const requester =
              request.requester ??
              request.participant ??
              (requesterMessage
                ? {
                    id: requesterMessage.senderId,
                    name: requesterMessage.senderName,
                    avatarUrl: requesterMessage.senderAvatarUrl,
                    role: "USER",
                    isOnline: false,
                  }
                : null);

            if (!latest) {
              return {
                ...request,
                id: session.id,
                requester,
                participant: requester,
              };
            }

            return {
              ...request,
              id: session.id,
              requester,
              participant: requester,
              lastMessage: decodeMessageContent(latest.content).text,
              updatedAt: latest.createdAt,
            };
          } catch {
            return request;
          }
        }),
      );
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useAvailableStaff() {
  const role = useAuthStore((state) => state.role);

  return useQuery({
    queryKey: [...chatKeys.availableStaff, role],
    queryFn: async () => {
      const [availabilityResult, directoryResult] = await Promise.allSettled([
        chatService.getAvailableStaff(),
        role === "admin"
          ? adminService.getUsers(1, 1000)
          : Promise.resolve({ users: [] }),
      ]);
      const availableStaff =
        availabilityResult.status === "fulfilled"
          ? availabilityResult.value
          : [];
      const directoryStaff =
        directoryResult.status === "fulfilled"
          ? directoryResult.value.users
              .filter((user) =>
                ["ADMIN", "STAFF"].includes(user.role.toUpperCase()),
              )
              .map((user) => ({
                id: user.id,
                name: user.fullName,
                avatarUrl: user.avatar ?? null,
                role: user.role.toUpperCase(),
                isOnline: false,
                isAvailable: false,
                maxChats: 0,
                activeChats: 0,
              }))
          : [];
      const staffById = new Map(
        directoryStaff.map((member) => [member.id, member]),
      );

      availableStaff.forEach((member) => {
        staffById.set(member.id, {
          ...staffById.get(member.id),
          ...member,
        });
      });

      if (!staffById.size) {
        throw (
          (availabilityResult.status === "rejected"
            ? availabilityResult.reason
            : null) ??
          (directoryResult.status === "rejected"
            ? directoryResult.reason
            : new Error("No staff accounts were returned."))
        );
      }

      return [...staffById.values()].sort((first, second) => {
        if (first.isAvailable !== second.isAvailable) {
          return first.isAvailable ? -1 : 1;
        }
        return first.name.localeCompare(second.name);
      });
    },
    staleTime: 15_000,
  });
}

export function useSupportActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: chatKeys.all });

  return {
    open: useMutation({ mutationFn: chatService.resolveSupportSession }),
    accept: useMutation({
      mutationFn: chatService.acceptSupport,
      onSuccess: refresh,
    }),
    transfer: useMutation({
      mutationFn: ({
        requestId,
        staffId,
      }: {
        requestId: string;
        staffId: string;
      }) => chatService.transferSupport(requestId, staffId),
      onSuccess: refresh,
    }),
    resolve: useMutation({
      mutationFn: ({
        requestId,
        resolutionNote,
      }: {
        requestId: string;
        resolutionNote: string;
      }) => chatService.resolveSupport(requestId, resolutionNote),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: chatService.cancelSupport,
      onSuccess: refresh,
    }),
    setStatus: useMutation({
      mutationFn: chatService.setStaffStatus,
      onSuccess: refresh,
    }),
  };
}

export type ChatSessionType = "DIRECT" | "SUPPORT";
export type ChatSessionStatus =
  "PENDING" | "ACTIVE" | "RESOLVED" | "CANCELLED" | string;
export type SupportPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface ChatParticipant {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  isOnline: boolean;
}

export interface ChatSession {
  id: string;
  supportRequestId?: string | null;
  type: ChatSessionType;
  status: ChatSessionStatus;
  subject: string;
  propertyId: string | null;
  participant: ChatParticipant | null;
  lastMessage: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  content: string;
  messageType: string;
  createdAt: string;
}

export interface SupportRequest extends ChatSession {
  requestId: string;
  sessionCandidates: string[];
  description: string;
  priority: SupportPriority;
  requester: ChatParticipant | null;
  assignedStaff: ChatParticipant | null;
  resolutionNote: string | null;
}

export interface StaffAvailability extends ChatParticipant {
  isAvailable: boolean;
  maxChats: number;
  activeChats: number;
}

export interface CreateDirectChatInput {
  participantId: string;
  subject: string;
  propertyId?: string;
}

export interface CreateSupportRequestInput {
  subject: string;
  description: string;
  priority: SupportPriority;
}

export interface SendChatMessageInput {
  sessionId: string;
  content: string;
  messageType?: "text" | string;
}

export interface StaffStatusInput {
  isOnline: boolean;
  isAvailable: boolean;
  maxChats: number;
}

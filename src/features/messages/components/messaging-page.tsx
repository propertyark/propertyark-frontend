"use client";

import { FormEvent, type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Headphones,
  LockKeyhole,
  MessageCircle,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useDashboardUser } from "@/features/dashboard/hooks/use-dashboard-user";
import {
  useChatMessages,
  useChatProperty,
  useChatRealtime,
  useChatSessions,
  useCreateSupportRequest,
  useSendChatMessage,
  useSupportActions,
  markChatSessionRead,
} from "@/features/messages/hooks/use-chat";
import type {
  ChatSession,
  SupportPriority,
} from "@/features/messages/types/chat.types";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api-error";
import { useAuthStore } from "@/store/auth.store";
import {
  decodeMessageContent,
  encodeMessageContent,
  type MessagePropertyContext,
} from "@/features/messages/lib/message-content";

export function MessagingPage({
  role,
  initialSessionId,
  initialPropertyId,
  initialPropertyTitle,
}: {
  role: "buyer" | "vendor";
  initialSessionId?: string;
  initialPropertyId?: string;
  initialPropertyTitle?: string;
}) {
  const user = useDashboardUser();
  const currentUserId = useAuthStore(
    (state) => state.userId ?? state.user?.id ?? "",
  );
  const sessionsQuery = useChatSessions();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    initialSessionId,
  );
  const [supportOpen, setSupportOpen] = useState(false);
  const sessions = useMemo(
    () => sessionsQuery.data ?? [],
    [sessionsQuery.data],
  );
  const visibleSessions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter((session) =>
      `${session.participant?.name ?? ""} ${session.subject} ${session.lastMessage}`
        .toLowerCase()
        .includes(term),
    );
  }, [search, sessions]);
  const unreadTotal = sessions.reduce(
    (total, session) => total + session.unreadCount,
    0,
  );
  const effectiveSelectedId =
    selectedId === undefined && sessions.length === 1
      ? sessions[0].id
      : selectedId;
  const selected =
    sessions.find((session) => session.id === effectiveSelectedId) ?? null;

  return (
    <>
      <section className="mx-auto min-h-[calc(100dvh-118px)] max-w-[1500px] overflow-hidden rounded-2xl border bg-background shadow-sm lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          className={cn(
            "flex min-h-[calc(100dvh-118px)] flex-col border-r bg-background",
            selected && "hidden lg:flex",
          )}
        >
          <div className="flex items-center justify-between gap-3 px-5 pt-6 pb-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Messages
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Property enquiries and support
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSupportOpen(true)}
              aria-label="Contact PropertyArk support"
              title="Contact support"
            >
              <Headphones />
            </Button>
          </div>

          <div className="px-4 pb-5">
            <InputGroup className="h-12 bg-muted/40">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
              />
            </InputGroup>
          </div>

          <div className="flex items-center gap-2 px-5 pb-3 text-xs font-medium text-muted-foreground">
            <MessageCircle />
            Conversations
            {unreadTotal > 0 && (
              <Badge className="ml-auto min-w-5 justify-center rounded-full px-1.5">
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </Badge>
            )}
          </div>
          <Separator />

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sessionsQuery.isLoading ? (
              <ConversationListSkeleton />
            ) : sessionsQuery.isError ? (
              <LoadError onRetry={() => sessionsQuery.refetch()} />
            ) : visibleSessions.length ? (
              visibleSessions.map((session) => (
                <ConversationRow
                  key={session.id}
                  session={session}
                  role={role}
                  selected={session.id === effectiveSelectedId}
                  onSelect={() => {
                    markChatSessionRead(session.id, currentUserId);
                    setSelectedId(session.id);
                    void sessionsQuery.refetch();
                  }}
                />
              ))
            ) : (
              <Empty className="min-h-64 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {search ? <Search /> : <MessageCircle />}
                  </EmptyMedia>
                  <EmptyTitle>
                    {search ? "No conversations found" : "No conversations yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {search
                      ? "Try searching with another name or keyword."
                      : role === "buyer"
                        ? "Open a property and choose Send a Message to contact its vendor."
                        : "Property enquiries from buyers will appear here."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </aside>

        <div
          className={cn(
            "min-h-[calc(100dvh-118px)] bg-primary/[0.02]",
            !selected && "hidden lg:block",
          )}
        >
          {selected ? (
            <ConversationPanel
              session={selected}
              role={role}
              initialPropertyContext={
                selected.id === initialSessionId &&
                initialPropertyId &&
                initialPropertyTitle
                  ? { id: initialPropertyId, title: initialPropertyTitle }
                  : null
              }
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <WelcomePanel
              firstName={user.firstName}
              initials={user.initials}
              avatarUrl={user.avatarUrl}
              counterpart={role === "vendor" ? "buyers" : "vendors"}
              onSupport={() => setSupportOpen(true)}
            />
          )}
        </div>
      </section>
      <SupportRequestDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </>
  );
}

function ConversationRow({
  session,
  role,
  selected,
  onSelect,
}: {
  session: ChatSession;
  role: "buyer" | "vendor";
  selected: boolean;
  onSelect: () => void;
}) {
  const propertyQuery = useChatProperty(session.propertyId, session.subject);
  const propertyTitle =
    propertyQuery.data?.title ?? propertyTitleFromSubject(session.subject);
  const name =
    session.type === "SUPPORT"
      ? "PropertyArk Support"
      : (session.participant?.name ??
        (role === "buyer" ? propertyQuery.data?.vendorName : null) ??
        (role === "buyer" ? "Property vendor" : "Property enquiry"));
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        session.unreadCount > 0 && !selected && "bg-primary/[0.04]",
        selected && "bg-primary/5",
      )}
    >
      <Avatar size="lg">
        <AvatarImage
          src={session.participant?.avatarUrl ?? undefined}
          alt={name}
        />
        <AvatarFallback className="bg-primary/10 font-semibold text-primary">
          {getInitials(name)}
        </AvatarFallback>
        {session.participant?.isOnline && (
          <AvatarBadge className="bg-success" />
        )}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm",
              session.unreadCount > 0 ? "font-bold" : "font-semibold",
            )}
          >
            {name}
          </p>
          <time
            className={cn(
              "shrink-0 text-[11px]",
              session.unreadCount > 0
                ? "font-semibold text-primary"
                : "text-muted-foreground",
            )}
          >
            {formatConversationTime(session.updatedAt)}
          </time>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p
            className={cn(
              "truncate text-xs",
              session.unreadCount > 0
                ? "font-semibold text-foreground"
                : "text-muted-foreground",
            )}
          >
            {session.lastMessage || propertyTitle || session.subject}
          </p>
          {session.unreadCount > 0 && (
            <Badge className="ml-auto min-w-5 justify-center rounded-full px-1.5">
              {session.unreadCount > 99 ? "99+" : session.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

export function ConversationPanel({
  session,
  onBack,
  embedded = false,
  allowCancelSupport = true,
  role = "admin",
  initialPropertyContext = null,
  fillAvailableHeight = false,
  headerAction,
  canSendMessages = true,
  readOnlyReason = "Accept this request before replying.",
}: {
  session: ChatSession;
  onBack: () => void;
  embedded?: boolean;
  allowCancelSupport?: boolean;
  role?: "buyer" | "vendor" | "admin";
  initialPropertyContext?: MessagePropertyContext | null;
  fillAvailableHeight?: boolean;
  headerAction?: ReactNode;
  canSendMessages?: boolean;
  readOnlyReason?: string;
}) {
  const currentUserId = useAuthStore((state) => state.userId ?? state.user?.id);
  const messagesQuery = useChatMessages(session.id);
  const propertyQuery = useChatProperty(session.propertyId, session.subject);
  useChatRealtime(session.id);
  const sendMessage = useSendChatMessage();
  const supportActions = useSupportActions();
  const [content, setContent] = useState("");
  const [propertyContextSent, setPropertyContextSent] = useState(false);
  const [propertyContextDismissed, setPropertyContextDismissed] =
    useState(false);
  const draftPropertyContext =
    propertyContextSent || propertyContextDismissed
      ? null
      : initialPropertyContext;
  const name =
    session.type === "SUPPORT" && role !== "admin"
      ? "PropertyArk Support"
      : (session.participant?.name ??
        (role === "buyer" ? propertyQuery.data?.vendorName : null) ??
        (session.type === "SUPPORT"
          ? session.subject
          : role === "buyer"
            ? "Property vendor"
            : "Property enquiry"));
  const supportDescription =
    session.type === "SUPPORT" &&
    "description" in session &&
    typeof session.description === "string"
      ? session.description
      : "";
  const supportPriority =
    session.type === "SUPPORT" &&
    "priority" in session &&
    typeof session.priority === "string"
      ? session.priority
      : "";

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const cleanContent = content.trim();
    if (!canSendMessages || !cleanContent || sendMessage.isPending) return;
    const outgoingContent = encodeMessageContent(
      cleanContent,
      draftPropertyContext,
    );
    sendMessage.mutate(
      { sessionId: session.id, content: outgoingContent, messageType: "text" },
      {
        onSuccess: () => {
          setContent("");
          if (initialPropertyContext) setPropertyContextSent(true);
        },
        onError: (error) =>
          toast.error(
            getApiErrorMessage(error, "Your message could not be sent."),
          ),
      },
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        fillAvailableHeight
          ? "h-full min-h-0"
          : embedded
            ? "h-[min(72dvh,760px)] min-h-0"
            : "h-[calc(100dvh-118px)] min-h-[580px]",
      )}
    >
      <header className="flex h-20 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft />
        </Button>
        <Avatar size="lg">
          <AvatarImage
            src={session.participant?.avatarUrl ?? undefined}
            alt={name}
          />
          <AvatarFallback className="bg-primary/10 font-semibold text-primary">
            {getInitials(name)}
          </AvatarFallback>
          {session.participant?.isOnline && (
            <AvatarBadge className="bg-success" />
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "h-5 shrink-0 px-1.5 text-[10px]",
                session.participant?.isOnline
                  ? "border-success/30 bg-success/10 text-success"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  session.participant?.isOnline
                    ? "bg-success"
                    : "bg-muted-foreground",
                )}
                aria-hidden="true"
              />
              {session.participant?.isOnline ? "Online" : "Offline"}
            </Badge>
          </div>
        </div>
        {headerAction}
        {allowCancelSupport &&
          session.type === "SUPPORT" &&
          !["RESOLVED", "CANCELLED"].includes(session.status) && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={supportActions.cancel.isPending}
              onClick={() =>
                supportActions.cancel.mutate(
                  session.supportRequestId ?? session.id,
                  {
                    onSuccess: () =>
                      toast.success("Support request cancelled."),
                    onError: (error) =>
                      toast.error(
                        getApiErrorMessage(
                          error,
                          "The support request could not be cancelled.",
                        ),
                      ),
                  },
                )
              }
            >
              {supportActions.cancel.isPending && (
                <Spinner data-icon="inline-start" />
              )}
              Cancel request
            </Button>
          )}
      </header>

      <div className="min-h-0 flex-1">
        {messagesQuery.isLoading ? (
          <MessageListSkeleton />
        ) : messagesQuery.isError ? (
          <LoadError onRetry={() => messagesQuery.refetch()} />
        ) : messagesQuery.data?.length ? (
          <MessageScrollerProvider autoScroll>
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent className="p-4 sm:p-6">
                  {session.type === "SUPPORT" && (
                    <Marker className="items-start rounded-xl border bg-muted/40 p-3">
                      <MarkerContent className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <Badge variant="outline">Support request</Badge>
                          {supportPriority && (
                            <Badge
                              variant={
                                supportPriority === "URGENT"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {supportPriority.toLowerCase()}
                            </Badge>
                          )}
                        </span>
                        <span className="font-semibold text-foreground">
                          {session.subject}
                        </span>
                        <span className="text-xs leading-relaxed">
                          {supportDescription || "No description was supplied."}
                        </span>
                      </MarkerContent>
                    </Marker>
                  )}
                  <Marker variant="separator">
                    <MarkerContent>Conversation started</MarkerContent>
                  </Marker>
                  {messagesQuery.data.map((message) => {
                    const decodedContent = decodeMessageContent(
                      message.content,
                    );
                    const ownMessage = Boolean(
                      currentUserId && message.senderId === currentUserId,
                    );
                    return (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={ownMessage}
                      >
                        <Message align={ownMessage ? "end" : "start"}>
                          <MessageAvatar>
                            <Avatar size="sm">
                              <AvatarImage
                                src={message.senderAvatarUrl ?? undefined}
                                alt={message.senderName}
                              />
                              <AvatarFallback>
                                {getInitials(message.senderName)}
                              </AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                          <MessageContent>
                            {!ownMessage && (
                              <MessageHeader>
                                {message.senderName}
                              </MessageHeader>
                            )}
                            <Bubble
                              align={ownMessage ? "end" : "start"}
                              variant={ownMessage ? "default" : "muted"}
                            >
                              <BubbleContent className="flex flex-col gap-2 whitespace-pre-wrap">
                                {decodedContent.property && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="max-w-full justify-start bg-background text-foreground shadow-none hover:bg-primary hover:text-primary-foreground"
                                    asChild
                                  >
                                    <Link
                                      href={`/properties/${decodedContent.property.id}`}
                                    >
                                      <Building2 data-icon="inline-start" />
                                      <span className="truncate">
                                        Property:{" "}
                                        {decodedContent.property.title}
                                      </span>
                                    </Link>
                                  </Button>
                                )}
                                <span>{decodedContent.text}</span>
                              </BubbleContent>
                            </Bubble>
                            <MessageFooter>
                              {formatMessageTime(message.createdAt)}
                            </MessageFooter>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    );
                  })}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        ) : (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircle />
              </EmptyMedia>
              <EmptyTitle>Start the conversation</EmptyTitle>
              <EmptyDescription>
                {session.type === "DIRECT"
                  ? `Send your first message to ${name}.`
                  : `Send a message about ${session.subject}.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <form
        onSubmit={submitMessage}
        className="flex shrink-0 flex-col gap-2 border-t bg-background p-4 sm:p-5"
      >
        {!canSendMessages && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border bg-muted/40 px-4 py-3"
          >
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Chat locked</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {readOnlyReason}
              </p>
            </div>
          </div>
        )}
        {canSendMessages && draftPropertyContext && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/properties/${draftPropertyContext.id}`}>
                <Building2 data-icon="inline-start" />
                <span className="max-w-64 truncate">
                  Property: {draftPropertyContext.title}
                </span>
              </Link>
            </Button>
            <span className="text-xs text-muted-foreground">
              Attached to this message
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setPropertyContextDismissed(true)}
              aria-label={`Remove ${draftPropertyContext.title} from this message`}
              title="Remove property attachment"
            >
              <X />
            </Button>
          </div>
        )}
        <InputGroup className="min-h-12 items-end bg-muted/30">
          <InputGroupTextarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              const usesTouchKeyboard =
                window.matchMedia("(pointer: coarse)").matches ||
                window.matchMedia("(hover: none)").matches;
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !usesTouchKeyboard &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              canSendMessages ? "Write a message" : "Acceptance required"
            }
            aria-label="Message"
            rows={1}
            className="max-h-32 min-h-11 overflow-y-auto"
            disabled={!canSendMessages || sendMessage.isPending}
          />
          <InputGroupAddon align="inline-end" className="pb-2">
            <Button
              type="submit"
              size="icon-sm"
              disabled={
                !canSendMessages || !content.trim() || sendMessage.isPending
              }
            >
              {sendMessage.isPending ? <Spinner /> : <Send />}
              <span className="sr-only">Send message</span>
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

function WelcomePanel({
  firstName,
  initials,
  avatarUrl,
  counterpart,
  onSupport,
}: {
  firstName: string;
  initials: string;
  avatarUrl?: string;
  counterpart: string;
  onSupport: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-118px)] items-center justify-center p-6 lg:p-12">
      <Empty className="w-full max-w-2xl border-0">
        <EmptyHeader className="gap-4">
          <Avatar className="size-20">
            <AvatarImage src={avatarUrl} alt={firstName} />
            <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <EmptyTitle className="text-2xl font-semibold">
              Welcome back, {firstName}
            </EmptyTitle>
            <EmptyDescription className="mt-1 text-base">
              Select a conversation with one of your {counterpart}.
            </EmptyDescription>
          </div>
        </EmptyHeader>
        <Button variant="outline" onClick={onSupport}>
          <Headphones data-icon="inline-start" /> Contact PropertyArk support
        </Button>
      </Empty>
    </div>
  );
}

function SupportRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const request = useCreateSupportRequest();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<SupportPriority>("NORMAL");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    request.mutate(
      { subject: subject.trim(), description: description.trim(), priority },
      {
        onSuccess: () => {
          toast.success("Support request submitted", {
            description:
              "A support specialist will accept your request shortly.",
          });
          setSubject("");
          setDescription("");
          setPriority("NORMAL");
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(
            getApiErrorMessage(
              error,
              "The support request could not be submitted.",
            ),
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contact PropertyArk support</DialogTitle>
          <DialogDescription>
            Describe the issue. It will enter the support queue for an available
            staff member.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="support-subject">Subject</FieldLabel>
              <Input
                id="support-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Payment issue with my account"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="support-description">Description</FieldLabel>
              <Textarea
                id="support-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Tell us what happened and what you expected."
                rows={5}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="support-priority">Priority</FieldLabel>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as SupportPriority)}
              >
                <SelectTrigger id="support-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                request.isPending || !subject.trim() || !description.trim()
              }
            >
              {request.isPending && <Spinner data-icon="inline-start" />} Submit
              request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConversationListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-2">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageListSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end gap-6 p-6">
      <Skeleton className="h-14 w-2/3 rounded-xl" />
      <Skeleton className="ml-auto h-20 w-3/5 rounded-xl" />
      <Skeleton className="h-16 w-1/2 rounded-xl" />
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Empty className="min-h-64 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageCircle />
        </EmptyMedia>
        <EmptyTitle>Messages could not be loaded</EmptyTitle>
        <EmptyDescription>
          Check your connection and try again.
        </EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </Empty>
  );
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "PA"
  );
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function propertyTitleFromSubject(subject: string) {
  return subject
    .replace(/^shortlet inquiry about\s+/i, "")
    .replace(/^inquiry about\s+/i, "")
    .trim();
}

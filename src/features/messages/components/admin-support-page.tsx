"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  Check,
  Headphones,
  RefreshCw,
  SendHorizontal,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { ConversationPanel } from "@/features/messages/components/messaging-page";
import {
  useAvailableStaff,
  usePendingSupportRequests,
  useSupportActions,
} from "@/features/messages/hooks/use-chat";
import type {
  ChatSessionStatus,
  StaffAvailability,
  SupportRequest,
} from "@/features/messages/types/chat.types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api-error";
import { useAuthStore } from "@/store/auth.store";

const statusOptions: ChatSessionStatus[] = ["PENDING", "ACTIVE", "RESOLVED"];

function supportActionId(request: SupportRequest) {
  return request.supportRequestId ?? request.requestId;
}

export function AdminSupportPage() {
  const [status, setStatus] = useState<ChatSessionStatus>("PENDING");
  const requestsQuery = usePendingSupportRequests(status);
  const staffQuery = useAvailableStaff();
  const actions = useSupportActions();
  const currentUserId = useAuthStore(
    (state) => state.userId ?? state.user?.id ?? "",
  );
  const currentUser = useAuthStore((state) => state.user);
  const [readRequestIds, setReadRequestIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(
    null,
  );
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [dialog, setDialog] = useState<
    | { type: "transfer"; request: SupportRequest }
    | { type: "resolve"; request: SupportRequest }
    | null
  >(null);

  function accept(request: SupportRequest) {
    actions.accept.mutate(request, {
      onSuccess: (activeRequest) => {
        const acceptedRequest: SupportRequest = {
          ...activeRequest,
          status: "ACTIVE",
          assignedStaff: activeRequest.assignedStaff ?? {
            id: currentUserId,
            name: currentUser?.fullName || "You",
            avatarUrl: currentUser?.avatarUrl ?? null,
            role: "STAFF",
            isOnline: true,
          },
        };
        toast.success("Support request accepted. You can reply now.");
        setStatus("ACTIVE");
        setSelectedRequest(acceptedRequest);
      },
      onError: (error) =>
        toast.error(
          getApiErrorMessage(error, "The request could not be accepted."),
        ),
    });
  }

  return (
    <AdminWorkspace contained>
      <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 p-4 sm:p-6 lg:p-8 xl:grid xl:min-h-0 xl:flex-1 xl:grid-rows-[auto_minmax(0,1fr)] xl:overflow-hidden">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Support chat
            </h1>
            <p className="mt-1 text-muted-foreground">
              Accept, transfer, and resolve customer support conversations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StaffAvailabilityDialog />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger
                className="w-40"
                aria-label="Support request status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {titleCase(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => requestsQuery.refetch()}
              disabled={requestsQuery.isFetching}
            >
              {requestsQuery.isFetching ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              Refresh
            </Button>
          </div>
        </header>

        <section
          aria-label="Support workspace"
          className="grid h-[calc(100svh-16rem)] min-h-[360px] overflow-hidden rounded-2xl border bg-background shadow-sm xl:h-full xl:min-h-0 xl:grid-cols-[320px_minmax(420px,1fr)_300px]"
        >
          <aside className="flex min-h-0 flex-col overflow-hidden border-b xl:border-r xl:border-b-0">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="font-semibold">{titleCase(status)} requests</h2>
                <p className="text-xs text-muted-foreground">
                  Select a request to review
                </p>
              </div>
              <Badge>{requestsQuery.data?.length ?? 0}</Badge>
            </div>
            <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto p-2">
              {requestsQuery.isLoading ? (
                <SupportQueueSkeleton />
              ) : requestsQuery.isError ? (
                <QueueError onRetry={() => requestsQuery.refetch()} />
              ) : requestsQuery.data?.length ? (
                <div className="flex flex-col gap-1">
                  {requestsQuery.data.map((request) => (
                    <SupportQueueItem
                      key={request.requestId}
                      request={request}
                      selected={
                        selectedRequest?.requestId === request.requestId
                      }
                      opening={actions.open.isPending}
                      unread={
                        request.unreadCount > 0 &&
                        !readRequestIds.has(request.requestId)
                          ? request.unreadCount
                          : 0
                      }
                      onSelect={() => {
                        setReadRequestIds((current) =>
                          new Set(current).add(request.requestId),
                        );
                        if (request.status === "PENDING") {
                          setSelectedRequest(request);
                          return;
                        }
                        actions.open.mutate(request, {
                          onSuccess: setSelectedRequest,
                          onError: (error) =>
                            toast.error(
                              getApiErrorMessage(
                                error,
                                "The support conversation could not be opened.",
                              ),
                            ),
                        });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <QueueEmpty status={status} />
              )}
            </div>
          </aside>

          <div
            className={cn(
              "overflow-hidden bg-background",
              selectedRequest ? "fixed inset-0 z-40" : "hidden",
              "xl:static xl:block xl:h-full xl:min-h-0 xl:bg-primary/[0.015]",
            )}
          >
            {selectedRequest?.status === "PENDING" ? (
              <PendingConversation
                request={selectedRequest}
                pending={actions.accept.isPending}
                canAccept={Boolean(
                  currentUserId &&
                  (!selectedRequest.assignedStaff ||
                    selectedRequest.assignedStaff.id === currentUserId),
                )}
                onBack={() => setSelectedRequest(null)}
                onViewProfile={() => setMobileProfileOpen(true)}
                onAccept={() => accept(selectedRequest)}
              />
            ) : selectedRequest ? (
              <ConversationPanel
                session={selectedRequest}
                onBack={() => setSelectedRequest(null)}
                embedded
                fillAvailableHeight
                allowCancelSupport={false}
                canSendMessages={Boolean(
                  currentUserId &&
                  selectedRequest.assignedStaff?.id === currentUserId,
                )}
                readOnlyReason={
                  selectedRequest.assignedStaff
                    ? "This request is assigned to " +
                      selectedRequest.assignedStaff.name +
                      ". Only the staff member who accepted it can reply."
                    : "Accept this request before replying."
                }
                headerAction={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="xl:hidden"
                    onClick={() => setMobileProfileOpen(true)}
                    aria-label="View customer profile"
                  >
                    <UserRound />
                  </Button>
                }
              />
            ) : (
              <Empty className="h-full border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Headphones />
                  </EmptyMedia>
                  <EmptyTitle>Select a support request</EmptyTitle>
                  <EmptyDescription>
                    Choose a request from the queue to view its conversation.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>

          <aside className="hidden overscroll-contain overflow-y-auto bg-muted/20 xl:block xl:h-full xl:min-h-0 xl:border-l">
            <CustomerProfilePanel
              request={selectedRequest}
              currentUserId={currentUserId}
              onTransfer={(request) => setDialog({ type: "transfer", request })}
              onResolve={(request) => setDialog({ type: "resolve", request })}
            />
          </aside>
        </section>
      </main>

      <Sheet open={mobileProfileOpen} onOpenChange={setMobileProfileOpen}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>Customer profile</SheetTitle>
          </SheetHeader>
          <CustomerProfilePanel
            request={selectedRequest}
            currentUserId={currentUserId}
            onTransfer={(request) => {
              setMobileProfileOpen(false);
              setDialog({ type: "transfer", request });
            }}
            onResolve={(request) => {
              setMobileProfileOpen(false);
              setDialog({ type: "resolve", request });
            }}
          />
        </SheetContent>
      </Sheet>

      <TransferDialog
        key={
          dialog?.type === "transfer" ? dialog.request.requestId : "transfer"
        }
        request={dialog?.type === "transfer" ? dialog.request : null}
        staff={(staffQuery.data ?? []).filter(
          (member) => member.id !== currentUserId,
        )}
        loading={staffQuery.isLoading}
        loadError={staffQuery.isError}
        pending={actions.transfer.isPending}
        onClose={() => setDialog(null)}
        onTransfer={(requestId, staffId) =>
          actions.transfer.mutate(
            { requestId, staffId },
            {
              onSuccess: () => {
                toast.success(
                  "Support request transferred. The receiving staff member must accept it before replying.",
                );
                setSelectedRequest(null);
                setMobileProfileOpen(false);
                setDialog(null);
              },
              onError: (error) =>
                toast.error(
                  getApiErrorMessage(
                    error,
                    "The request could not be transferred.",
                  ),
                ),
            },
          )
        }
      />
      <ResolveDialog
        key={dialog?.type === "resolve" ? dialog.request.requestId : "resolve"}
        request={dialog?.type === "resolve" ? dialog.request : null}
        pending={actions.resolve.isPending}
        onClose={() => setDialog(null)}
        onResolve={(requestId, resolutionNote) => {
          const request = dialog?.type === "resolve" ? dialog.request : null;
          if (!request || request.assignedStaff?.id !== currentUserId) {
            toast.error(
              "Only the staff member who accepted this request can resolve it.",
            );
            return;
          }

          actions.resolve.mutate(
            { requestId, resolutionNote },
            {
              onSuccess: () => {
                toast.success("Support request resolved.");
                setSelectedRequest(null);
                setDialog(null);
              },
              onError: (error) =>
                toast.error(
                  getApiErrorMessage(
                    error,
                    "The request could not be resolved.",
                  ),
                ),
            },
          );
        }}
      />
    </AdminWorkspace>
  );
}

function StaffAvailabilityDialog() {
  const actions = useSupportActions();
  const [open, setOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);
  const [maxChats, setMaxChats] = useState(5);

  function save(event: FormEvent) {
    event.preventDefault();
    actions.setStatus.mutate(
      { isOnline, isAvailable, maxChats },
      {
        onSuccess: () => {
          toast.success("Availability updated.");
          setOpen(false);
        },
        onError: (error) =>
          toast.error(
            getApiErrorMessage(error, "Availability could not be updated."),
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users data-icon="inline-start" /> Availability
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Staff availability</DialogTitle>
          <DialogDescription>
            Control whether new support requests can be assigned to you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-6">
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="staff-online">Online</FieldLabel>
              <Checkbox
                id="staff-online"
                checked={isOnline}
                onCheckedChange={(checked) => setIsOnline(checked === true)}
              />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="staff-available">Available</FieldLabel>
              <Checkbox
                id="staff-available"
                checked={isAvailable}
                onCheckedChange={(checked) => setIsAvailable(checked === true)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="staff-max-chats">
                Maximum active chats
              </FieldLabel>
              <Input
                id="staff-max-chats"
                type="number"
                min={1}
                max={50}
                value={maxChats}
                onChange={(event) => setMaxChats(Number(event.target.value))}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={actions.setStatus.isPending}>
              {actions.setStatus.isPending && (
                <Spinner data-icon="inline-start" />
              )}
              Save availability
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SupportQueueItem({
  request,
  selected,
  opening,
  unread,
  onSelect,
}: {
  request: SupportRequest;
  selected: boolean;
  opening: boolean;
  unread: number;
  onSelect: () => void;
}) {
  const requesterName =
    request.requester?.name ?? request.participant?.name ?? "PropertyArk user";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={opening}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        unread > 0 && !selected && "bg-primary/[0.04]",
        selected && "bg-primary/5",
      )}
    >
      <Avatar size="lg">
        <AvatarImage
          src={request.requester?.avatarUrl ?? undefined}
          alt={requesterName}
        />
        <AvatarFallback>{initials(requesterName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm",
              unread > 0 ? "font-bold" : "font-semibold",
            )}
          >
            {requesterName}
          </p>
          <Badge
            variant={request.priority === "URGENT" ? "destructive" : "outline"}
            className="shrink-0 px-1.5 text-[10px]"
          >
            {titleCase(request.priority)}
          </Badge>
          <span
            className={cn(
              "shrink-0 text-[11px]",
              unread > 0
                ? "font-semibold text-primary"
                : "text-muted-foreground",
            )}
          >
            {opening ? "Opening…" : formatRequestTime(request.updatedAt)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p
            className={cn(
              "truncate text-xs",
              unread > 0
                ? "font-semibold text-foreground"
                : "text-muted-foreground",
            )}
          >
            {request.lastMessage || "No messages yet."}
          </p>
          {unread > 0 && (
            <Badge className="ml-auto min-w-5 justify-center rounded-full px-1.5">
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

function PendingConversation({
  request,
  pending,
  canAccept,
  onBack,
  onViewProfile,
  onAccept,
}: {
  request: SupportRequest;
  pending: boolean;
  canAccept: boolean;
  onBack: () => void;
  onViewProfile: () => void;
  onAccept: () => void;
}) {
  const requesterName =
    request.requester?.name ?? request.participant?.name ?? "PropertyArk user";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 xl:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to support requests"
        >
          <ArrowLeft />
        </Button>
        <Avatar>
          <AvatarImage
            src={request.requester?.avatarUrl ?? undefined}
            alt={requesterName}
          />
          <AvatarFallback>{initials(requesterName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-semibold">{requesterName}</p>
          <p className="truncate text-xs text-muted-foreground">
            Pending support request
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={onViewProfile}
          aria-label="View customer profile"
        >
          <UserRound />
        </Button>
      </header>
      <Empty className="min-h-0 flex-1 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Headphones />
          </EmptyMedia>
          <EmptyTitle>{request.subject}</EmptyTitle>
          <EmptyDescription className="max-w-md">
            {request.description || "No description was supplied."}
          </EmptyDescription>
        </EmptyHeader>
        {canAccept ? (
          <Button onClick={onAccept} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Accept and start chatting
          </Button>
        ) : (
          <div className="max-w-md rounded-xl border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
            This transferred request is waiting for{" "}
            <span className="font-semibold text-foreground">
              {request.assignedStaff?.name ?? "the assigned staff member"}
            </span>{" "}
            to accept it.
          </div>
        )}
      </Empty>
    </div>
  );
}

function CustomerProfilePanel({
  request,
  currentUserId,
  onTransfer,
  onResolve,
}: {
  request: SupportRequest | null;
  currentUserId: string;
  onTransfer: (request: SupportRequest) => void;
  onResolve: (request: SupportRequest) => void;
}) {
  if (!request) {
    return (
      <Empty className="h-full min-h-72 border-0 px-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UserRound />
          </EmptyMedia>
          <EmptyTitle>Customer profile</EmptyTitle>
          <EmptyDescription>
            Customer information appears here when you select a request.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const customer = request.requester ?? request.participant;
  const customerName = customer?.name ?? "PropertyArk user";
  const assignedToCurrentUser = Boolean(
    currentUserId && request.assignedStaff?.id === currentUserId,
  );

  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar size="lg" className="size-16">
          <AvatarImage
            src={customer?.avatarUrl ?? undefined}
            alt={customerName}
          />
          <AvatarFallback>{initials(customerName)}</AvatarFallback>
        </Avatar>
        <div>
          <h2 className="font-semibold">{customerName}</h2>
          <p className="text-sm text-muted-foreground">
            {titleCase(customer?.role ?? "User")}
          </p>
        </div>
        <Badge variant="outline">
          {customer?.isOnline ? "Online" : "Offline"}
        </Badge>
        {customer?.id && (
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/admin/users/${encodeURIComponent(customer.id)}`}>
              <UserRound data-icon="inline-start" />
              View {customer.role === "VENDOR" ? "vendor" : "user"} profile
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t pt-5">
        <ProfileField label="Subject" value={request.subject} />
        <ProfileField label="Priority" value={titleCase(request.priority)} />
        <ProfileField label="Status" value={titleCase(request.status)} />
        <ProfileField
          label="Created"
          value={new Date(request.createdAt).toLocaleString()}
        />
        <div className="rounded-xl border bg-background p-3">
          <span className="text-xs font-medium text-muted-foreground">
            Assigned staff
          </span>
          <p className="mt-1 text-sm font-semibold">
            {request.assignedStaff?.name ?? "Unassigned"}
            {assignedToCurrentUser ? " (You)" : ""}
          </p>
        </div>
      </div>

      {request.status === "ACTIVE" && (
        <div className="flex flex-col gap-2 border-t pt-5">
          {!assignedToCurrentUser && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Only the staff member who accepted this request can reply,
              transfer, or resolve it.
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => onTransfer(request)}
            disabled={!assignedToCurrentUser}
            title={
              assignedToCurrentUser
                ? "Transfer conversation"
                : "This request is assigned to another staff member"
            }
          >
            <Users data-icon="inline-start" /> Transfer conversation
          </Button>
          <Button
            onClick={() => onResolve(request)}
            disabled={!assignedToCurrentUser}
            title={
              assignedToCurrentUser
                ? "Resolve request"
                : "This request is assigned to another staff member"
            }
          >
            <Check data-icon="inline-start" /> Resolve request
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm leading-relaxed">{value}</span>
    </div>
  );
}

function QueueError({ onRetry }: { onRetry: () => void }) {
  return (
    <Empty className="min-h-64 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Headphones />
        </EmptyMedia>
        <EmptyTitle>Queue unavailable</EmptyTitle>
        <EmptyDescription>Check the connection and try again.</EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </Empty>
  );
}

function QueueEmpty({ status }: { status: ChatSessionStatus }) {
  return (
    <Empty className="min-h-64 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Check />
        </EmptyMedia>
        <EmptyTitle>Queue is clear</EmptyTitle>
        <EmptyDescription>No {status.toLowerCase()} requests.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function TransferDialog({
  request,
  staff,
  loading,
  loadError,
  pending,
  onClose,
  onTransfer,
}: {
  request: SupportRequest | null;
  staff: StaffAvailability[];
  loading: boolean;
  loadError: boolean;
  pending: boolean;
  onClose: () => void;
  onTransfer: (requestId: string, staffId: string) => void;
}) {
  const [staffId, setStaffId] = useState("");
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer support request</DialogTitle>
          <DialogDescription>
            Select an available staff member. They must accept the transferred
            request before they can reply.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="transfer-staff">Available staff</FieldLabel>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger id="transfer-staff" className="w-full">
              <SelectValue placeholder="Select staff member" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {staff.length ? (
                  staff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}{" "}
                      {member.isAvailable
                        ? `(${member.activeChats}/${member.maxChats || "∞"} active)`
                        : "(offline or unavailable)"}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__no-staff" disabled>
                    {loading
                      ? "Loading staff…"
                      : loadError
                        ? "Staff list could not be loaded"
                        : "No other staff accounts available"}
                  </SelectItem>
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!request || !staffId || pending}
            onClick={() =>
              request && onTransfer(supportActionId(request), staffId)
            }
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SendHorizontal data-icon="inline-start" />
            )}{" "}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({
  request,
  pending,
  onClose,
  onResolve,
}: {
  request: SupportRequest | null;
  pending: boolean;
  onClose: () => void;
  onResolve: (requestId: string, note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve support request</DialogTitle>
          <DialogDescription>
            Add a note explaining how the customer’s issue was resolved.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="resolution-note">Resolution note</FieldLabel>
          <Textarea
            id="resolution-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={5}
            placeholder="Issue resolved — credit points added manually."
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!request || !note.trim() || pending}
            onClick={() =>
              request && onResolve(supportActionId(request), note.trim())
            }
          >
            {pending && <Spinner data-icon="inline-start" />} Resolve request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupportQueueSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

function formatRequestTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "PA"
  );
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(
      /(^|\s|_)(\w)/g,
      (_, prefix: string, letter: string) =>
        `${prefix === "_" ? " " : prefix}${letter.toUpperCase()}`,
    );
}

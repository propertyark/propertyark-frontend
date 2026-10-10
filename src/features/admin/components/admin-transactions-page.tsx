"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  History,
  ListFilter,
  MoreHorizontal,
  ReceiptText,
  Search,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { AdminTablePagination } from "@/features/admin/components/admin-table-pagination";
import {
  AdminStatCard,
  type AdminStatTone,
} from "@/features/admin/components/admin-stat-card";
import { useAdminAllActivities } from "@/features/admin/hooks/use-admin-activity";
import { useAdminCreditSettings } from "@/features/admin/hooks/use-admin-credit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminActivity } from "@/services/activity.service";
import { DEFAULT_CREDIT_SETTINGS } from "@/services/admin-credit.service";

type TransactionKind =
  "purchase" | "usage" | "payment" | "refund" | "adjustment";
export type TransactionRecord = {
  id: string;
  kind: TransactionKind;
  description: string;
  vendor: string;
  email: string | null;
  points: number | null;
  amount: number | null;
  currency: string;
  reference: string | null;
  status: string;
  channel: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

function recordsIn(value: unknown) {
  const records: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];
  const visited = new Set<object>();

  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (!current || typeof current !== "object" || visited.has(current))
      continue;
    visited.add(current);
    const source = current as Record<string, unknown>;
    records.push(source);
    queue.push(...Object.values(source));
  }
  return records;
}

function text(metadata: Record<string, unknown>, keys: string[]) {
  for (const record of recordsIn(metadata)) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    }
  }
  return null;
}

function number(metadata: Record<string, unknown>, keys: string[]) {
  for (const record of recordsIn(metadata)) {
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate))
        return candidate;
      if (typeof candidate === "string" && candidate.trim()) {
        const parsed = Number(candidate.replace(/[^\d.-]/g, ""));
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function values(metadata: Record<string, unknown>, keys: string[]) {
  const matches: unknown[] = [];
  for (const record of recordsIn(metadata)) {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== "") {
        matches.push(value);
      }
    }
  }
  return matches;
}

function paymentStatus(activity: AdminActivity) {
  const statusText = values(activity.metadata, [
    "paymentStatus",
    "payment_status",
    "transactionStatus",
    "transaction_status",
    "gatewayStatus",
    "gateway_status",
    "paystackStatus",
    "paystack_status",
    "verificationStatus",
    "verification_status",
    "paymentState",
    "payment_state",
    "status",
    "state",
  ])
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toUpperCase();
  const outcomeText = `${statusText} ${activity.action} ${activity.entityType} ${activity.title} ${activity.description}`;
  const hasMarker = (keys: string[]) =>
    values(activity.metadata, keys).some(
      (value) =>
        value === true ||
        (typeof value === "string" &&
          value.trim() !== "" &&
          !/^(FALSE|NO|0)$/i.test(value.trim())) ||
        (typeof value === "number" && value > 0),
    );

  if (
    /REFUND|REVERSED/.test(outcomeText) ||
    hasMarker(["refundedAt", "refunded_at", "reversedAt", "reversed_at"])
  )
    return "REFUNDED";
  if (
    /CANCELLED|CANCELED|ABANDONED|VOIDED/.test(outcomeText) ||
    hasMarker([
      "cancelledAt",
      "cancelled_at",
      "canceledAt",
      "canceled_at",
      "abandonedAt",
      "abandoned_at",
    ])
  )
    return "CANCELLED";
  if (
    /FAILED|FAILURE|DECLINED|ERROR/.test(outcomeText) ||
    hasMarker(["failedAt", "failed_at"])
  )
    return "FAILED";
  if (
    /SUCCESS|SUCCESSFUL|COMPLETED|PAID|CREDITED|VERIFIED/.test(outcomeText) ||
    hasMarker([
      "isSuccessful",
      "is_successful",
      "paymentSuccessful",
      "payment_successful",
      "isPaid",
      "is_paid",
      "paymentVerified",
      "payment_verified",
      "paidAt",
      "paid_at",
      "completedAt",
      "completed_at",
      "verifiedAt",
      "verified_at",
      "creditedAt",
      "credited_at",
    ]) ||
    (text(activity.metadata, ["purchaseNumber", "purchase_number"]) !== null &&
      number(activity.metadata, ["newBalance", "new_balance"]) !== null)
  )
    return "COMPLETED";
  if (/INITIALIZE|INITIATED/.test(outcomeText)) return "INITIATED";
  if (/PENDING|PROCESSING/.test(outcomeText)) return "PENDING";
  return "RECORDED";
}

export function transactionFrom(
  activity: AdminActivity,
  pricePerPoint = DEFAULT_CREDIT_SETTINGS.pricePerPoint,
): TransactionRecord | null {
  const searchable =
    `${activity.action} ${activity.entityType} ${activity.title} ${activity.description} ${JSON.stringify(activity.metadata)}`.toUpperCase();
  if (
    !/CREDIT|POINT|PAYMENT|PAYSTACK|TRANSACTION|PURCHASE|FEATURE|REFUND/.test(
      searchable,
    )
  )
    return null;

  const rawPoints = number(activity.metadata, [
    "points",
    "creditPoints",
    "credit_points",
    "pointsUsed",
    "points_used",
    "pointsPurchased",
    "points_purchased",
    "pointAmount",
    "point_amount",
    "quantity",
    "credits",
    "creditAmount",
    "credit_amount",
  ]);
  const kind: TransactionKind = /REFUND|REVERSAL/.test(searchable)
    ? "refund"
    : /PURCHASE|TOP.?UP|PAYSTACK/.test(searchable)
      ? "purchase"
      : /USED|DEBIT|SPEND|FEATURE|LISTING/.test(searchable)
        ? "usage"
        : /PAYMENT/.test(searchable)
          ? "payment"
          : "adjustment";
  const amount = number(activity.metadata, [
    "amountPaid",
    "amount_paid",
    "paymentAmount",
    "payment_amount",
    "totalAmount",
    "total_amount",
    "totalPrice",
    "total_price",
    "amount",
    "value",
  ]);
  const calculatedPoints =
    rawPoints === null &&
    kind === "purchase" &&
    amount !== null &&
    pricePerPoint > 0 &&
    Number.isInteger(amount / pricePerPoint)
      ? amount / pricePerPoint
      : rawPoints;
  const points =
    calculatedPoints === null
      ? null
      : kind === "usage"
        ? -Math.abs(calculatedPoints)
        : calculatedPoints;

  // CREDIT_POINT audit events also contain page visits and administrative
  // activity. They are not ledger transactions without a monetary or point
  // movement.
  if (amount === null && points === null) return null;

  return {
    id: activity.id,
    kind,
    description: activity.title || activity.description,
    vendor:
      text(activity.metadata, [
        "vendorName",
        "vendor_name",
        "businessName",
        "business_name",
        "userName",
        "user_name",
        "fullName",
        "full_name",
        "name",
      ]) ?? activity.actor.name,
    email:
      text(activity.metadata, [
        "vendorEmail",
        "vendor_email",
        "email",
        "userEmail",
        "user_email",
      ]) ?? activity.actor.email,
    points,
    amount,
    currency: text(activity.metadata, ["currency"]) ?? "NGN",
    reference: text(activity.metadata, [
      "reference",
      "ref",
      "paymentReference",
      "payment_reference",
      "transactionReference",
      "transaction_reference",
      "transactionRef",
      "transaction_ref",
      "paystackReference",
      "paystack_reference",
      "purchaseNumber",
      "purchase_number",
      "purchaseId",
      "purchase_id",
      "creditPurchaseId",
      "credit_purchase_id",
      "transactionId",
      "transaction_id",
      // Activity records currently expose the credit-purchase record ID but
      // not the Paystack reference. Use that stable ID as the internal ref.
      "entityId",
      "entity_id",
    ]),
    status: paymentStatus(activity),
    channel:
      text(activity.metadata, [
        "channel",
        "provider",
        "paymentProvider",
        "payment_provider",
        "gateway",
      ]) ??
      (kind === "purchase" || /PAYSTACK/.test(searchable)
        ? "Paystack"
        : "Credit wallet"),
    createdAt: activity.createdAt,
    metadata: activity.metadata,
  };
}

export function money(value: number | null, currency: string) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}

function statusPriority(status: string) {
  if (/SUCCESS|COMPLETED|PAID|CREDITED/.test(status)) return 4;
  if (/REFUND|REVERSED/.test(status)) return 3;
  if (/FAILED|CANCELLED|CANCELED|ABANDONED/.test(status)) return 2;
  if (/INITIATED|PENDING/.test(status)) return 1;
  return 0;
}

function transactionCorrelationIds(transaction: TransactionRecord) {
  const identifiers = values(transaction.metadata, [
    "entityId",
    "entity_id",
    "purchaseId",
    "purchase_id",
    "creditPurchaseId",
    "credit_purchase_id",
    "reference",
    "ref",
    "paymentReference",
    "payment_reference",
    "transactionReference",
    "transaction_reference",
    "transactionRef",
    "transaction_ref",
    "paystackReference",
    "paystack_reference",
    "purchaseNumber",
    "purchase_number",
    "transactionId",
    "transaction_id",
  ])
    .filter(
      (value): value is string | number =>
        typeof value === "string" || typeof value === "number",
    )
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (transaction.reference) identifiers.push(transaction.reference);
  return [...new Set(identifiers)];
}

function mergeTransactionRecords(
  existing: TransactionRecord,
  candidate: TransactionRecord,
) {
  const candidateWins =
    statusPriority(candidate.status) > statusPriority(existing.status) ||
    (statusPriority(candidate.status) === statusPriority(existing.status) &&
      new Date(candidate.createdAt).getTime() >=
        new Date(existing.createdAt).getTime());
  const primary = candidateWins ? candidate : existing;
  const fallback = candidateWins ? existing : candidate;

  return {
    ...fallback,
    ...primary,
    amount: primary.amount ?? fallback.amount,
    points: primary.points ?? fallback.points,
    reference: primary.reference ?? fallback.reference,
    email: primary.email ?? fallback.email,
    metadata: { ...fallback.metadata, ...primary.metadata },
  } satisfies TransactionRecord;
}

type TransactionStatus =
  | "completed"
  | "initiated"
  | "pending"
  | "failed"
  | "cancelled"
  | "refunded"
  | "other";

function transactionStatus(status: string): TransactionStatus {
  if (/REFUND|REVERSED/.test(status)) return "refunded";
  if (/CANCELLED|CANCELED|ABANDONED/.test(status)) return "cancelled";
  if (/FAILED|FAILURE|DECLINED|ERROR/.test(status)) return "failed";
  if (/INITIALIZE|INITIATED/.test(status)) return "initiated";
  if (/PENDING|PROCESSING/.test(status)) return "pending";
  if (/SUCCESS|COMPLETED|PAID|CREDITED/.test(status)) return "completed";
  return "other";
}

function kindLabel(kind: TransactionKind) {
  return {
    purchase: "Purchase",
    usage: "Wallet usage",
    payment: "Payment",
    refund: "Refund",
    adjustment: "Adjustment",
  }[kind];
}

function csvCell(value: string | number | null) {
  const safe = value === null ? "" : String(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportTransactions(records: TransactionRecord[]) {
  const rows = records.map((item) =>
    [
      item.reference ?? item.id,
      kindLabel(item.kind),
      item.vendor,
      item.email,
      item.points,
      item.amount,
      item.currency,
      item.status,
      item.channel,
      item.createdAt,
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = [
    "Transaction ID,Type,Buyer or vendor,Email,Credits,Amount,Currency,Status,Payment method,Created",
    ...rows,
  ].join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `propertyark-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminTransactionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [channel, setChannel] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [filterReferenceTime] = useState(() => Date.now());
  const settingsQuery = useAdminCreditSettings();
  const pricePerPoint =
    settingsQuery.data?.pricePerPoint ?? DEFAULT_CREDIT_SETTINGS.pricePerPoint;
  // Payment completion can be recorded as PAYMENT or TRANSACTION while the
  // original purchase initialization is recorded as CREDIT_POINT.
  const query = useAdminAllActivities();
  const transactions = useMemo(() => {
    const unique = new Map<string, TransactionRecord>();
    const keyByIdentifier = new Map<string, string>();
    (query.data ?? [])
      .map((activity) => transactionFrom(activity, pricePerPoint))
      .filter((item): item is TransactionRecord => Boolean(item))
      .forEach((transaction) => {
        const identifiers = transactionCorrelationIds(transaction);
        const key =
          identifiers
            .map((identifier) => keyByIdentifier.get(identifier))
            .find(Boolean) ??
          transaction.reference ??
          transaction.id;
        const existing = unique.get(key);
        unique.set(
          key,
          existing
            ? mergeTransactionRecords(existing, transaction)
            : transaction,
        );
        identifiers.forEach((identifier) =>
          keyByIdentifier.set(identifier, key),
        );
      });
    return Array.from(unique.values()).sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime(),
    );
  }, [pricePerPoint, query.data]);
  const channels = useMemo(
    () => Array.from(new Set(transactions.map((item) => item.channel))).sort(),
    [transactions],
  );
  const filtered = useMemo(() => {
    const rangeDays = dateRange === "all" ? null : Number(dateRange);
    return transactions.filter((item) => {
      const matchesKind = kind === "all" || item.kind === kind;
      const matchesStatus =
        status === "all" || transactionStatus(item.status) === status;
      const matchesChannel = channel === "all" || item.channel === channel;
      const createdAt = new Date(item.createdAt).getTime();
      const matchesDate =
        rangeDays === null ||
        (!Number.isNaN(createdAt) &&
          createdAt >= filterReferenceTime - rangeDays * 24 * 60 * 60 * 1_000);
      const needle = search.trim().toLowerCase();
      return (
        matchesKind &&
        matchesStatus &&
        matchesChannel &&
        matchesDate &&
        (!needle ||
          `${item.description} ${item.vendor} ${item.email ?? ""} ${item.reference ?? ""} ${item.points ?? ""}`
            .toLowerCase()
            .includes(needle))
      );
    });
  }, [
    channel,
    dateRange,
    filterReferenceTime,
    kind,
    search,
    status,
    transactions,
  ]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const totalVolume = transactions.reduce(
    (sum, item) => sum + Math.abs(item.amount ?? 0),
    0,
  );
  const completed = transactions.filter(
    (item) => transactionStatus(item.status) === "completed",
  ).length;
  const pending = transactions.filter(
    (item) => transactionStatus(item.status) === "pending",
  ).length;
  const failed = transactions.filter(
    (item) =>
      transactionStatus(item.status) === "failed" ||
      transactionStatus(item.status) === "cancelled",
  ).length;
  const revenue = transactions.reduce(
    (sum, item) =>
      sum +
      (item.kind === "purchase" &&
      transactionStatus(item.status) === "completed"
        ? (item.amount ?? 0)
        : 0),
    0,
  );
  const firstVisible = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(safePage * pageSize, filtered.length);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <AdminWorkspace>
      <main className="mx-auto flex max-w-[1500px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight">
              Transaction Management
            </h1>
            <p className="mt-1 text-muted-foreground">
              Monitor and manage financial activity across PropertyArk with a
              live view of payments, points, refunds, and wallet usage.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row print:hidden">
            <Button variant="outline" size="lg" onClick={() => window.print()}>
              <FileText data-icon="inline-start" />
              Generate Financial Report
            </Button>
            <Button size="lg" onClick={() => exportTransactions(filtered)}>
              <Download data-icon="inline-start" />
              Export Transactions
            </Button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            title="Total Transaction Volume"
            value={money(totalVolume, "NGN")}
            detail={`${transactions.length.toLocaleString()} recorded events`}
            icon={WalletCards}
            loading={query.isPending}
          />
          <SummaryCard
            title="Completed Transactions"
            value={completed.toLocaleString()}
            detail="Successfully recorded"
            icon={CheckCircle2}
            tone="success"
            loading={query.isPending}
          />
          <SummaryCard
            title="Pending Transactions"
            value={pending.toLocaleString()}
            detail="Awaiting confirmation"
            icon={Clock3}
            tone="warning"
            loading={query.isPending}
          />
          <SummaryCard
            title="Failed Transactions"
            value={failed.toLocaleString()}
            detail="Requires attention"
            icon={TriangleAlert}
            tone="destructive"
            loading={query.isPending}
          />
          <SummaryCard
            title="Platform Revenue"
            value={money(revenue, "NGN")}
            detail="Completed point purchases"
            icon={Banknote}
            tone="secondary"
            loading={query.isPending}
          />
        </section>

        <Card className="py-3 print:hidden">
          <CardContent className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_repeat(4,minmax(130px,auto))_auto]">
            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Search transactions"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by ID, buyer, vendor, credits..."
              />
            </InputGroup>
            <Select
              value={kind}
              onValueChange={(value) => updateFilter(setKind, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Transaction type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All transaction types</SelectItem>
                  <SelectItem value="purchase">Purchases</SelectItem>
                  <SelectItem value="usage">Wallet usage</SelectItem>
                  <SelectItem value="payment">Payments</SelectItem>
                  <SelectItem value="refund">Refunds</SelectItem>
                  <SelectItem value="adjustment">Adjustments</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => updateFilter(setStatus, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="initiated">Initiated</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={channel}
              onValueChange={(value) => updateFilter(setChannel, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All payment methods</SelectItem>
                  {channels.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={dateRange}
              onValueChange={(value) => updateFilter(setDateRange, value)}
            >
              <SelectTrigger className="w-full">
                <CalendarDays />
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All dates</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Reset transaction filters"
              title="Reset filters"
              disabled={
                !search &&
                kind === "all" &&
                status === "all" &&
                channel === "all" &&
                dateRange === "all"
              }
              onClick={() => {
                setSearch("");
                setKind("all");
                setStatus("all");
                setChannel("all");
                setDateRange("all");
                setPage(1);
              }}
            >
              <ListFilter />
            </Button>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4 sm:hidden">
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              {filtered.length} matching records
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {query.isPending ? (
              <div className="flex flex-col gap-3 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : query.isError ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ReceiptText />
                  </EmptyMedia>
                  <EmptyTitle>Transaction history unavailable</EmptyTitle>
                  <EmptyDescription>
                    The admin activity service could not be reached. Try again
                    shortly.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : visible.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WalletCards />
                  </EmptyMedia>
                  <EmptyTitle>No matching transactions</EmptyTitle>
                  <EmptyDescription>
                    Point and payment events will appear here when they are
                    recorded by the backend.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader className="bg-surface">
                    <TableRow>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Buyer / Vendor</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((item) => (
                      <TableRow key={item.id} className="h-20">
                        <TableCell>
                          <Link
                            href={`/admin/transactions/${encodeURIComponent(item.id)}`}
                            className="font-mono text-xs font-semibold text-primary hover:underline"
                          >
                            #{item.reference ?? item.id}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <TransactionTypeBadge kind={item.kind} />
                        </TableCell>
                        <TableCell>
                          <p className="max-w-48 truncate font-semibold">
                            {item.vendor}
                          </p>
                          <p className="max-w-48 truncate text-xs text-muted-foreground">
                            {item.email ?? item.channel}
                          </p>
                        </TableCell>
                        <TableCell className="font-numeric font-semibold">
                          {item.points === null
                            ? "—"
                            : `${item.points > 0 ? "+" : ""}${item.points.toLocaleString("en-NG")} points`}
                        </TableCell>
                        <TableCell className="font-numeric font-semibold">
                          {money(item.amount, item.currency)}
                        </TableCell>
                        <TableCell>
                          <TransactionStatusBadge status={item.status} />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {date(item.createdAt)}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <TransactionActions transaction={item} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          {!query.isPending && !query.isError && filtered.length > 0 && (
            <CardFooter className="flex-col gap-4 bg-surface/40 px-6 py-4 print:hidden sm:flex-row sm:justify-between">
              <p className="text-xs text-muted-foreground sm:text-sm">
                Showing {firstVisible} to {lastVisible} of {filtered.length}{" "}
                transactions
              </p>
              <AdminTablePagination
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </CardFooter>
          )}
        </Card>

        <section className="grid gap-6 lg:grid-cols-2 print:hidden">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="text-primary" />
                Recent Logs
              </CardTitle>
              <CardDescription>
                Latest events returned by the transaction activity feed.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {transactions.slice(0, 3).map((item) => (
                <div key={item.id} className="flex gap-3">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {date(item.createdAt)} · {item.reference ?? item.id}
                    </p>
                  </div>
                </div>
              ))}
              {!transactions.length && (
                <p className="text-sm text-muted-foreground">
                  Recent transaction logs will appear here.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-surface text-center">
            <CardHeader className="justify-items-center text-center">
              <ShieldCheck className="size-12 text-primary" />
              <CardTitle className="text-2xl">
                Secure Financial Custody
              </CardTitle>
              <CardDescription className="max-w-md">
                Payment records remain tied to the authenticated PropertyArk
                activity ledger for traceable administrative review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/admin/settings/security">
                  Audit Security Protocols
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </AdminWorkspace>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "primary",
  loading,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof ReceiptText;
  tone?: AdminStatTone;
  loading: boolean;
}) {
  return (
    <AdminStatCard
      label={title}
      value={value}
      note={detail}
      icon={Icon}
      tone={tone}
      loading={loading}
    />
  );
}

function TransactionTypeBadge({ kind }: { kind: TransactionKind }) {
  const variant = kind === "refund" ? "secondary" : "outline";
  return <Badge variant={variant}>{kindLabel(kind)}</Badge>;
}

function TransactionStatusBadge({ status }: { status: string }) {
  const group = transactionStatus(status);
  const variant =
    group === "failed" || group === "cancelled" ? "destructive" : "outline";
  const dotClass = {
    completed: "bg-success",
    initiated: "bg-warning",
    pending: "bg-warning",
    failed: "bg-destructive",
    cancelled: "bg-destructive",
    refunded: "bg-secondary",
    other: "bg-muted-foreground",
  }[group];
  const label =
    group === "other" ? status : `${group[0].toUpperCase()}${group.slice(1)}`;

  return (
    <Badge variant={variant}>
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {label}
    </Badge>
  );
}

function TransactionActions({
  transaction,
}: {
  transaction: TransactionRecord;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${transaction.reference ?? transaction.id}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link
              href={`/admin/transactions/${encodeURIComponent(transaction.id)}`}
            >
              <Eye />
              View details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void navigator.clipboard.writeText(
                transaction.reference ?? transaction.id,
              )
            }
          >
            <ReceiptText />
            Copy transaction ID
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

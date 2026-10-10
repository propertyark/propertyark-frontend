"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  Bath,
  BedDouble,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Flag,
  LandPlot,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  StarOff,
} from "lucide-react";
import { toast } from "sonner";
import { AdminActionDialog } from "@/features/admin/components/admin-action-dialog";
import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { useAdminProperty } from "@/features/admin/hooks/use-admin-dashboard";
import {
  adminPropertyCategory,
  adminPropertyLocation,
  adminPropertyPrice,
} from "@/features/admin/lib/admin-property-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { adminService } from "@/services/admin.service";
import { getApiErrorMessage } from "@/services/api-error";
import type {
  PropertyApiItem,
  PropertyMediaResponse,
} from "@/features/properties/types/api";
import {
  normalizePropertyMediaUrl,
  showPropertyImageFallback,
} from "@/features/properties/utils/normalize-property-response";
import { PropertyImageLightbox } from "@/features/properties/components/property-image-lightbox";
import { cn } from "@/lib/utils";
import { trustedUploadProxyUrl } from "@/lib/property-media-security";
import { useAuthStore } from "@/store/auth.store";
import { useAdminCreditSettings } from "@/features/admin/hooks/use-admin-credit";
import { DEFAULT_CREDIT_SETTINGS } from "@/services/admin-credit.service";
import { propertyService } from "@/services/property.service";

export function AdminPropertyDetailsPage({
  propertyId,
}: {
  propertyId: string;
}) {
  return (
    <AdminWorkspace>
      <PropertyReviewContent propertyId={propertyId} />
    </AdminWorkspace>
  );
}

function PropertyReviewContent({ propertyId }: { propertyId: string }) {
  const query = useAdminProperty(propertyId);

  if (query.isPending) return <PropertyDetailsSkeleton />;
  if (query.isError || !query.data) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Card>
          <CardContent className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
            <FileText className="size-10 text-muted-foreground" />
            <div>
              <h1 className="text-xl font-semibold">Property unavailable</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The property details could not be loaded.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/admin/properties">Back to Properties</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <PropertyReview property={query.data} />;
}

function PropertyReview({ property }: { property: PropertyApiItem }) {
  const queryClient = useQueryClient();
  const [selectedImage, setSelectedImage] = useState(0);
  const [decision, setDecision] = useState<"reject" | "changes" | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [unfeatureOpen, setUnfeatureOpen] = useState(false);
  const [reason, setReason] = useState("");
  const images = useMemo(
    () => property.media?.filter((item) => item.type === "IMAGE") ?? [],
    [property.media],
  );
  const videos = property.media?.filter((item) => item.type === "VIDEO") ?? [];
  const approvalStatus = String(
    property.listingStatus ??
      property.approvalStatus ??
      property.reviewStatus ??
      "PENDING",
  ).toUpperCase();
  const propertyStatus = String(property.status ?? "AVAILABLE").toUpperCase();
  const reviewComplete = isPropertyReviewComplete(property, approvalStatus);
  const creditSettings = useAdminCreditSettings();
  const featureCost =
    creditSettings.data?.featurePropertyCost ??
    DEFAULT_CREDIT_SETTINGS.featurePropertyCost;

  const review = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      if (action === "approve")
        return adminService.approveProperty(property.id);
      return adminService.rejectProperty(property.id, reason.trim());
    },
    onSuccess: async (_, action) => {
      toast.success(
        action === "approve"
          ? "Property approved and published"
          : "Review decision submitted",
      );
      setDecision(null);
      setApproveOpen(false);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin", "property", property.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["admin", "properties"] }),
      ]);
    },
    onError: (error) =>
      toast.error(
        getApiErrorMessage(
          error,
          "The property review could not be submitted.",
        ),
      ),
  });
  const unfeature = useMutation({
    mutationFn: () => propertyService.unfeature(property.id, featureCost),
    onSuccess: async () => {
      setUnfeatureOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin", "property", property.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["admin", "properties"] }),
        queryClient.invalidateQueries({ queryKey: ["properties", "featured"] }),
        queryClient.invalidateQueries({
          queryKey: ["properties", "available"],
        }),
      ]);
      toast.success("Featured placement removed.");
    },
    onError: (error) =>
      toast.error(
        getApiErrorMessage(error, "Featured placement could not be removed."),
      ),
  });

  return (
    <main className="mx-auto w-full max-w-7xl min-w-0 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6 lg:py-8">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3 sm:mb-4" asChild>
        <Link href="/admin/properties">
          <ArrowLeft data-icon="inline-start" />
          Back to Properties
        </Link>
      </Button>

      <header className="mb-5 flex flex-col justify-between gap-3 sm:mb-7 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="w-full break-words text-xl font-semibold tracking-tight sm:w-auto sm:text-3xl">
              {property.name}
            </h1>
            <Badge
              variant="outline"
              className={cn(
                approvalStatus === "PENDING" &&
                  "border-warning/20 bg-warning/10 text-warning",
                approvalStatus === "REJECTED" &&
                  "border-destructive/20 bg-destructive/10 text-destructive",
                ["ACTIVE", "APPROVED", "VERIFIED", "ACCEPTED"].includes(
                  approvalStatus,
                ) && "border-success/20 bg-success/10 text-success",
              )}
            >
              Approval: {reviewStatusLabel(approvalStatus)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                propertyStatus === "AVAILABLE" &&
                  "border-success/20 bg-success/10 text-success",
                ["SOLD", "RENTED", "OCCUPIED"].includes(propertyStatus) &&
                  "border-primary/20 bg-primary/10 text-primary",
                ["UNDER_MAINTENANCE", "UNDER_CONSTRUCTION"].includes(
                  propertyStatus,
                ) && "border-warning/20 bg-warning/10 text-warning",
              )}
            >
              Property: {propertyStatusLabel(propertyStatus)}
            </Badge>
          </div>
          <div className="mt-2 flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2 sm:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />
              {adminPropertyLocation(property)}
            </span>
            <span className="block max-w-full truncate" title={property.id}>
              Reference: {property.id}
            </span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-3 sm:block sm:text-right">
          <p className="text-xl font-bold text-primary sm:text-2xl">
            {adminPropertyPrice(property)}
          </p>
          <p className="text-sm text-muted-foreground">
            {listingLabel(property.listingType)}
          </p>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <PropertyMedia
            images={images}
            videos={videos}
            selectedImage={selectedImage}
            onSelectImage={setSelectedImage}
          />
          <PropertyFacts property={property} />
          <Card>
            <CardHeader>
              <CardTitle>Property Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line leading-7 text-muted-foreground">
                {property.description ||
                  "No property description was provided."}
              </p>
            </CardContent>
          </Card>
          {property.listingType === "FOR_SHORTLET" && (
            <ShortletStayInformation property={property} />
          )}
        </div>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-20">
          <VendorCard property={property} />
          <DocumentsCard documents={property.documents ?? []} />
          <ReviewChecklist />
          <ActiveIssues issue={property.rejectionReason} />
          <AdminNotes propertyId={property.id} />
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-8 grid grid-cols-2 items-center gap-2 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_24px_-20px_var(--foreground)] backdrop-blur sm:mx-0 sm:flex sm:flex-wrap sm:justify-end sm:gap-3 sm:px-0 sm:py-4 sm:shadow-none">
        {reviewComplete && (
          <p className="col-span-2 text-sm font-medium text-muted-foreground sm:mr-auto">
            This property has already been verified and approved.
          </p>
        )}
        {property.isFeatured && (
          <Button
            variant="outline"
            disabled={unfeature.isPending}
            onClick={() => setUnfeatureOpen(true)}
            className="col-span-2 w-full sm:w-auto"
          >
            <StarOff data-icon="inline-start" />
            Remove featured status
          </Button>
        )}
        {!reviewComplete && (
          <>
            <Button
              variant="outline"
              disabled={review.isPending}
              onClick={() => setDecision("reject")}
              className="w-full sm:w-auto"
            >
              Reject Property
            </Button>
            <Button
              variant="secondary"
              disabled={review.isPending}
              onClick={() => setDecision("changes")}
              className="w-full sm:w-auto"
            >
              Request Changes
            </Button>
            <Button
              disabled={review.isPending}
              onClick={() => setApproveOpen(true)}
              className="col-span-2 w-full sm:w-auto"
            >
              <CheckCircle2 data-icon="inline-start" />
              Approve &amp; Publish
            </Button>
          </>
        )}
      </div>

      <DecisionDialog
        decision={decision}
        reason={reason}
        setReason={setReason}
        pending={review.isPending}
        onClose={() => setDecision(null)}
        onSubmit={() => review.mutate("reject")}
      />
      <ApprovalDialog
        open={approveOpen}
        propertyName={property.name}
        pending={review.isPending}
        onClose={() => setApproveOpen(false)}
        onConfirm={() => review.mutate("approve")}
      />
      <Dialog
        open={unfeatureOpen}
        onOpenChange={(open) => {
          if (!unfeature.isPending) setUnfeatureOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove featured status?</DialogTitle>
            <DialogDescription>
              “{property.name}” will be removed from premium featured
              placements.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={unfeature.isPending}
              onClick={() => setUnfeatureOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={unfeature.isPending}
              onClick={() => unfeature.mutate()}
            >
              {unfeature.isPending && <Spinner data-icon="inline-start" />}
              {unfeature.isPending ? "Removing..." : "Remove featured status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ShortletStayInformation({ property }: { property: PropertyApiItem }) {
  const houseRules = property.houseRules ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stay information and policies</CardTitle>
        <CardDescription>
          Review the guest arrival details and policies supplied by the vendor.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="font-medium">Check-in and check-out</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Check-in: {formatStayTime(property.shortletCheckInTime)} ·
            Check-out: {formatStayTime(property.shortletCheckOutTime)}
          </p>
        </div>
        <div>
          <h3 className="font-medium">House rules</h3>
          {houseRules.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {houseRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No additional house rules supplied.
            </p>
          )}
        </div>
        <div>
          <h3 className="font-medium">Cancellation policy</h3>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {property.cancellationPolicy || "No cancellation policy supplied."}
          </p>
        </div>
        <div>
          <h3 className="font-medium">Payment policy</h3>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {property.paymentPolicy || "No payment policy supplied."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatStayTime(value?: string | null) {
  if (!value) return "Not supplied";
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours > 23 || minutes > 59) return value;
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
}

function PropertyMedia({
  images,
  videos,
  selectedImage,
  onSelectImage,
}: {
  images: PropertyMediaResponse[];
  videos: PropertyMediaResponse[];
  selectedImage: number;
  onSelectImage: (index: number) => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const showPrevious = () =>
    onSelectImage((selectedImage - 1 + images.length) % images.length);
  const showNext = () => onSelectImage((selectedImage + 1) % images.length);

  return (
    <>
      <Card className="-mx-3 gap-0 overflow-hidden rounded-none border-x-0 py-0 sm:mx-0 sm:gap-(--card-spacing) sm:rounded-xl sm:border-x sm:py-(--card-spacing)">
        <CardHeader className="flex-row items-center justify-between border-b px-3 py-3 sm:px-(--card-spacing) sm:py-0 sm:pb-(--card-spacing)">
          <CardTitle>Property Media</CardTitle>
          <Badge variant="outline">
            <CheckCircle2 /> Media review
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-0 sm:p-5">
          <div className="group relative aspect-video overflow-hidden bg-muted sm:aspect-[16/8] sm:rounded-xl">
            {images.length ? (
              <>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="absolute inset-0 cursor-zoom-in"
                  aria-label="Open property image preview"
                >
                  <Image
                    src={normalizePropertyMediaUrl(
                      images[selectedImage]?.url ?? images[0].url,
                    )}
                    alt={`${selectedImage + 1} of ${images.length} for the property`}
                    fill
                    priority
                    crossOrigin="anonymous"
                    unoptimized
                    onError={(event) =>
                      showPropertyImageFallback(event.currentTarget)
                    }
                    sizes="(max-width: 1280px) 100vw, 850px"
                    className="object-cover transition-transform group-hover:scale-[1.01]"
                  />
                </button>
                {images.length > 1 && (
                  <ImageNavigation
                    onPrevious={showPrevious}
                    onNext={showNext}
                  />
                )}
                <Badge className="absolute bottom-3 right-3 bg-foreground/70 text-background">
                  {selectedImage + 1} / {images.length}
                </Badge>
              </>
            ) : (
              <MediaPlaceholder />
            )}
          </div>
          {images.length > 1 && (
            <div className="hidden grid-cols-4 gap-3 sm:grid">
              {images.slice(0, 4).map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => onSelectImage(index)}
                  className="relative aspect-[16/9] overflow-hidden rounded-lg border ring-offset-2 data-[active=true]:ring-2 data-[active=true]:ring-primary"
                  data-active={selectedImage === index}
                >
                  <Image
                    src={normalizePropertyMediaUrl(image.url)}
                    alt={`Select property image ${index + 1}`}
                    fill
                    crossOrigin="anonymous"
                    unoptimized
                    onError={(event) =>
                      showPropertyImageFallback(event.currentTarget)
                    }
                    sizes="180px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
          {videos.map((video) => (
            <video
              key={video.id}
              controls
              crossOrigin="anonymous"
              preload="metadata"
              className="aspect-video w-full rounded-xl bg-foreground"
              src={normalizePropertyMediaUrl(video.url)}
            >
              Your browser does not support property video playback.
            </video>
          ))}
        </CardContent>
      </Card>
      <PropertyImageLightbox
        images={images.map((image) => ({
          id: image.id,
          name: image.name,
          url: normalizePropertyMediaUrl(image.url),
        }))}
        initialIndex={selectedImage}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </>
  );
}

function ImageNavigation({
  onPrevious,
  onNext,
}: {
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Previous property image"
        onClick={onPrevious}
        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full shadow-lg sm:left-3"
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Next property image"
        onClick={onNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full shadow-lg sm:right-3"
      >
        <ChevronRight />
      </Button>
    </>
  );
}

function MediaPlaceholder() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <Building2 className="size-12" />
      <p>No property photos uploaded</p>
    </div>
  );
}

function VendorCard({ property }: { property: PropertyApiItem }) {
  const vendor = property.vendor;
  const initials =
    vendor?.fullName
      ?.split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("") || "V";
  return (
    <Card className="border-primary/15 bg-primary/5">
      <CardHeader>
        <CardDescription className="font-semibold uppercase">
          Listed by
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarImage src={vendor?.avatar} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {vendor?.fullName || "PropertyArk vendor"}
            </p>
            <p className="flex items-center gap-1 text-xs text-success">
              <ShieldCheck className="size-4" />
              KYC Verified Vendor
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="sm"
            asChild={Boolean(vendor?.id)}
            className="bg-primary/10 text-primary hover:bg-primary/15"
          >
            {vendor?.id ? (
              <Link href={`/admin/users/${vendor.id}`}>Profile</Link>
            ) : (
              <span>Profile</span>
            )}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            asChild={Boolean(vendor?.id)}
            className="bg-primary/10 text-primary hover:bg-primary/15"
          >
            {vendor?.id ? (
              <Link href={`/admin/users/${vendor.id}?tab=activity`}>
                History
              </Link>
            ) : (
              <span>History</span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentsCard({
  documents,
}: {
  documents: NonNullable<PropertyApiItem["documents"]>;
}) {
  const [preview, setPreview] = useState<
    NonNullable<PropertyApiItem["documents"]>[number] | null
  >(null);
  const rawPreviewUrl = preview?.url ?? preview?.fileUrl;
  const previewUrl = rawPreviewUrl
    ? trustedUploadProxyUrl(rawPreviewUrl, "kyc")
    : null;
  const accessToken = useAuthStore((state) => state.accessToken);

  return (
    <>
      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle>Legal Documents</CardTitle>
          <CardDescription>
            Review the documentation supplied with this listing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {documents.length ? (
            documents.map((document) => {
              const rawUrl = document.url ?? document.fileUrl;
              const url = rawUrl ? trustedUploadProxyUrl(rawUrl, "kyc") : null;
              const documentName =
                document.name ?? document.fileName ?? "Property document";
              return (
                <div
                  key={document.id}
                  className="flex items-center gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3"
                >
                  <FileText className="size-8 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {documentName}
                    </p>
                    <p className="text-xs text-success">Uploaded</p>
                  </div>
                  {url && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="View document"
                        onClick={() => setPreview(document)}
                      >
                        <Eye />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Download document"
                        onClick={() =>
                          void downloadAdminDocument(
                            url,
                            documentName,
                            accessToken,
                          )
                        }
                      >
                        <Download />
                      </Button>
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <FileText className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">
                No legal documents supplied
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Documents will appear here when returned by the property
                endpoint.
              </p>
            </div>
          )}
        </CardContent>
        <div className="flex gap-3 border-t px-6 py-4 text-xs leading-5 text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
          Cross-check all supplied documents before approving this property.
        </div>
      </Card>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {preview?.name ?? preview?.fileName ?? "Property document"}
            </DialogTitle>
            <DialogDescription>
              Review the document before making a property decision.
            </DialogDescription>
          </DialogHeader>
          {previewUrl && preview ? (
            <AuthenticatedPropertyDocument
              url={previewUrl}
              name={preview.name ?? preview.fileName ?? "Property document"}
              declaredType={preview.type}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AuthenticatedPropertyDocument({
  url,
  name,
  declaredType,
}: {
  url: string;
  name: string;
  declaredType?: string;
}) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [file, setFile] = useState<{
    objectUrl: string;
    contentType: string;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;

    void fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Document request failed");
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setFile({ objectUrl, contentType: blob.type });
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFailed(true);
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, url]);

  if (!accessToken || failed) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-lg border text-center text-muted-foreground">
        <FileText className="size-10" />
        <p className="mt-3">This document could not be securely loaded.</p>
      </div>
    );
  }

  if (!file) return <Skeleton className="min-h-[65vh] w-full" />;

  const image =
    file.contentType.startsWith("image/") ||
    isImageDocument(name, declaredType);

  return (
    <>
      {image ? (
        <div className="relative min-h-[65vh] overflow-hidden rounded-lg bg-muted">
          <Image
            src={file.objectUrl}
            alt={name}
            fill
            unoptimized
            sizes="90vw"
            className="object-contain"
          />
        </div>
      ) : (
        <iframe
          src={file.objectUrl}
          title={name}
          className="h-[70vh] w-full rounded-lg border"
        />
      )}
      <DialogFooter>
        <Button variant="outline" asChild>
          <a href={file.objectUrl} download={name}>
            <Download data-icon="inline-start" />
            Download Document
          </a>
        </Button>
      </DialogFooter>
    </>
  );
}

async function downloadAdminDocument(
  url: string,
  name: string,
  accessToken: string | null,
) {
  if (!accessToken) {
    toast.error("Your admin session is not ready. Please try again.");
    return;
  }

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Document download failed");
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = window.document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  } catch {
    toast.error("The document could not be downloaded.");
  }
}

function isImageDocument(url: string, type?: string) {
  return (
    String(type).toUpperCase().includes("IMAGE") ||
    /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(url)
  );
}

function ReviewChecklist() {
  const items = [
    "Images meet quality standards",
    "Address matches listing data",
    "Pricing is reasonable",
    "Required legal documents reviewed",
  ];
  return (
    <Card className="border-primary/15">
      <CardHeader>
        <CardDescription className="font-semibold uppercase">
          Manual checklist
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.map((item) => (
          <label key={item} className="flex items-start gap-3 text-sm">
            <Checkbox />
            <span>{item}</span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

function ActiveIssues({ issue }: { issue?: string | null }) {
  return (
    <Card className="border-destructive/30">
      <CardHeader className="flex-row items-center justify-between">
        <CardDescription className="flex items-center gap-2 font-semibold uppercase text-destructive">
          <AlertTriangle className="size-4" />
          Active issues
        </CardDescription>
        <Badge variant="destructive">{issue ? 1 : 0}</Badge>
      </CardHeader>
      <CardContent>
        {issue ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm font-semibold">Property review issue</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {issue}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No active review issues have been recorded.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AdminNotes({ propertyId }: { propertyId: string }) {
  const storageKey = `propertyark-admin-property-note:${propertyId}`;
  const [note, setNote] = useState("");

  function saveNote() {
    localStorage.setItem(storageKey, note);
    toast.success("Internal note saved");
  }

  return (
    <Card className="border-primary/15">
      <CardHeader>
        <CardDescription className="font-semibold uppercase">
          Internal admin notes
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={note}
          onFocus={() => {
            if (!note) setNote(localStorage.getItem(storageKey) ?? "");
          }}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add notes about the verification process... (Visible to admins only)"
          rows={6}
        />
        <Button variant="secondary" size="sm" onClick={saveNote}>
          Save Note
        </Button>
      </CardContent>
    </Card>
  );
}

function PropertyFacts({ property }: { property: PropertyApiItem }) {
  const facts = [
    { label: "Property type", value: property.type, icon: Building2 },
    {
      label: "Category",
      value: adminPropertyCategory(property),
      icon: LandPlot,
    },
    {
      label: "Condition",
      value:
        property.condition ||
        (property.yearBuilt ? `Built ${property.yearBuilt}` : "Not specified"),
      icon: CheckCircle2,
    },
    {
      label: "Bedrooms",
      value: String(property.bedrooms ?? "—"),
      icon: BedDouble,
    },
    {
      label: "Bathrooms",
      value: String(property.bathrooms ?? "—"),
      icon: Bath,
    },
    {
      label: "Total area",
      value: property.size
        ? `${property.size} ${property.sizeUnit || "sqm"}`
        : "—",
      icon: LandPlot,
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Property Details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(({ label, value, icon: Icon }) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 flex items-center gap-2 font-medium">
                <Icon className="size-4 text-muted-foreground" />
                {value}
              </p>
            </div>
          ))}
        </div>
        {Boolean(property.amenities?.length) && (
          <>
            <Separator className="my-6" />
            <p className="mb-3 text-sm font-semibold">
              Features &amp; Amenities
            </p>
            <div className="flex flex-wrap gap-2">
              {property.amenities?.map((amenity) => (
                <Badge key={amenity} variant="secondary">
                  {amenity}
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DecisionDialog({
  decision,
  reason,
  setReason,
  pending,
  onClose,
  onSubmit,
}: {
  decision: "reject" | "changes" | null;
  reason: string;
  setReason: (value: string) => void;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <AdminActionDialog
      open={Boolean(decision)}
      onOpenChange={(open) => !open && onClose()}
      icon={decision === "changes" ? AlertTriangle : Flag}
      tone={decision === "changes" ? "warning" : "destructive"}
      title={
        decision === "changes" ? "Request property changes" : "Reject property"
      }
      description="Explain what the vendor must correct. This reason will be submitted with the review decision."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 5}
            onClick={onSubmit}
          >
            <Flag data-icon="inline-start" />
            Submit decision
          </Button>
        </>
      }
    >
      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Enter a clear review note..."
        rows={5}
      />
    </AdminActionDialog>
  );
}

function ApprovalDialog({
  open,
  propertyName,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  propertyName: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AdminActionDialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      icon={ShieldCheck}
      tone="success"
      title="Approve and publish property?"
      description={
        <>
          You are about to approve <strong>{propertyName}</strong>. Once
          confirmed, the listing will become available on the PropertyArk
          marketplace.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            <CheckCircle2 data-icon="inline-start" />
            {pending ? "Approving..." : "Confirm Approval"}
          </Button>
        </>
      }
    >
      <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
        Confirm that you have reviewed the property information, media, and all
        supplied legal documents.
      </div>
    </AdminActionDialog>
  );
}

function PropertyDetailsSkeleton() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Skeleton className="mb-6 h-24 w-full" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[720px]" />
        <Skeleton className="h-[520px]" />
      </div>
    </main>
  );
}

function listingLabel(value: string) {
  return (
    (
      {
        FOR_SALE: "Outright Sale",
        FOR_RENT: "For Rent",
        FOR_LAND: "Land Sale",
        FOR_SHORTLET: "Shortlet",
      } as Record<string, string>
    )[value] ?? value.replaceAll("_", " ").toLowerCase()
  );
}
function reviewStatusLabel(status: string) {
  return status === "PENDING"
    ? "Pending Verification"
    : status.charAt(0) + status.slice(1).toLowerCase();
}

function propertyStatusLabel(status: string) {
  return status === "AVAILABLE"
    ? "Available / Active"
    : status
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPropertyReviewComplete(property: PropertyApiItem, status: string) {
  const reviewStates = [
    status,
    property.approvalStatus,
    property.reviewStatus,
    property.verificationStatus,
  ]
    .filter(Boolean)
    .map((value) => String(value).toUpperCase());

  return (
    property.isApproved === true ||
    property.approved === true ||
    property.isVerified === true ||
    reviewStates.some((value) =>
      ["ACTIVE", "APPROVED", "VERIFIED", "ACCEPTED"].includes(value),
    )
  );
}

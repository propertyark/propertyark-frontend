"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FilePenLine, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyAmenities } from "@/features/properties/components/property-amenities";
import { PropertyDescriptionContent } from "@/features/properties/components/property-description-content";
import { PropertyGallery } from "@/features/properties/components/property-gallery";
import { PropertyHeader } from "@/features/properties/components/property-header";
import { PropertyInformation } from "@/features/properties/components/property-information";
import { PropertyOverview } from "@/features/properties/components/property-overview";
import { PropertyVideo } from "@/features/properties/components/property-video";
import { normalizePropertyResponse } from "@/features/properties/utils/normalize-property-response";
import {
  propertyStatus,
  propertyStatusVariant,
} from "@/features/vendor/lib/vendor-property-display";
import { propertyService } from "@/services/property.service";

export function VendorPropertyPreview({ propertyId }: { propertyId: string }) {
  const propertyQuery = useQuery({
    queryKey: ["vendor", "property-preview", propertyId],
    queryFn: () => propertyService.getById(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });

  if (propertyQuery.isLoading) return <PreviewSkeleton />;

  if (propertyQuery.isError || !propertyQuery.data) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Listing preview unavailable</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted-foreground">
            We could not load this property. Return to your properties and try
            again.
          </p>
          <Button asChild variant="outline">
            <Link href="/vendor/properties">
              <ArrowLeft data-icon="inline-start" />
              Back to properties
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const source = propertyQuery.data;
  const property = normalizePropertyResponse(source);
  const listingStatus = propertyStatus(source);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost">
          <Link href="/vendor/properties">
            <ArrowLeft data-icon="inline-start" />
            Back to properties
          </Link>
        </Button>
        <Button asChild>
          <Link href={`/vendor/properties/new?edit=${propertyId}`}>
            <FilePenLine data-icon="inline-start" />
            Edit property
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm">
        <Info className="size-5 text-primary" />
        <span className="font-medium">Vendor preview</span>
        <Badge variant={propertyStatusVariant(listingStatus.key)}>
          {listingStatus.label}
        </Badge>
        <span className="text-muted-foreground">
          This listing is visible only to you and administrators until it is
          approved.
        </span>
      </div>

      <PropertyHeader property={property} />
      <PropertyGallery
        images={property.images}
        imageMedia={property.imageMedia}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-8">
          <PropertyOverview property={property} />
          <section>
            <h2 className="text-lg font-semibold">Property description</h2>
            <PropertyDescriptionContent
              description={property.description}
              className="mt-3 leading-7"
            />
          </section>
          {(property.amenities?.length ?? 0) > 0 && (
            <PropertyAmenities amenities={property.amenities ?? []} />
          )}
          {property.videoUrl && (
            <PropertyVideo
              thumbnailSrc={property.images[0]}
              videoUrl={property.videoUrl}
            />
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>Listing information</CardTitle>
          </CardHeader>
          <CardContent>
            <PropertyInformation
              property={property}
              compact
              showHeading={false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <Skeleton className="h-10 w-44" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="aspect-[16/7] w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

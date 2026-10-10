"use client";

import { useState } from "react";
import Image from "next/image";
import { PropertyImageLightbox } from "./property-image-lightbox";
import { PropertyStreetView } from "./property-street-view";
import { Button } from "@/components/ui/button";
import type { PropertyImage } from "@/features/properties/types";
import {
  PROPERTY_IMAGE_CATEGORIES,
  propertyImageCategoryFromName,
  type PropertyImageCategory,
} from "@/features/properties/lib/property-image-categories";
import { showPropertyImageFallback } from "@/features/properties/utils/normalize-property-response";
import { cn } from "@/lib/utils";

interface PropertyGalleryProps {
  images: string[];
  imageMedia?: PropertyImage[];
  streetViewAddress?: string;
}

export function PropertyGallery({
  images,
  imageMedia,
  streetViewAddress,
}: PropertyGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [startCategory, setStartCategory] = useState<
    PropertyImageCategory | "All"
  >("All");

  if (!images.length) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground">
        No images available
      </div>
    );
  }

  const galleryImages: PropertyImage[] =
    imageMedia?.length === images.length
      ? imageMedia
      : images.map((url, index) => ({
          id: `${url}-${index}`,
          name: `Property image ${index + 1}`,
          url,
        }));
  const [main, ...rest] = galleryImages;
  const thumbs = rest.slice(0, 4);
  const extraCount = galleryImages.length - 5;
  const categories = PROPERTY_IMAGE_CATEGORIES.filter((category) =>
    galleryImages.some(
      (image) => propertyImageCategoryFromName(image.name) === category,
    ),
  );

  function openAt(index: number) {
    setStartIndex(index);
    setStartCategory("All");
    setLightboxOpen(true);
  }

  function openCategory(category: PropertyImageCategory | "All") {
    setStartIndex(0);
    setStartCategory(category);
    setLightboxOpen(true);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:h-[clamp(22rem,30vw,28rem)] lg:grid-cols-[1.4fr_1fr]">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl lg:aspect-auto lg:h-full">
          <button
            type="button"
            onClick={() => openAt(0)}
            className="absolute inset-0"
          >
            <Image
              src={main.url}
              alt={main.name || "Property main view"}
              fill
              sizes="(max-width: 1023px) 100vw, 58vw"
              crossOrigin="anonymous"
              unoptimized
              onError={(event) =>
                showPropertyImageFallback(event.currentTarget)
              }
              className="object-cover transition-transform hover:scale-[1.02]"
              priority
            />
          </button>
          {streetViewAddress && (
            <PropertyStreetView address={streetViewAddress} />
          )}
        </div>

        {thumbs.length > 0 && (
          <div
            className={cn(
              "grid grid-cols-2 gap-3 lg:h-full",
              thumbs.length <= 2 ? "lg:grid-rows-1" : "lg:grid-rows-2",
            )}
          >
            {thumbs.map((image, i) => {
              const isLast = i === thumbs.length - 1;
              const showOverlay = isLast && extraCount > 0;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => openAt(i + 1)}
                  className="relative aspect-[4/3] overflow-hidden rounded-2xl lg:aspect-auto lg:h-full lg:min-h-0"
                >
                  <Image
                    src={image.url}
                    alt={image.name || `Property view ${i + 2}`}
                    fill
                    sizes="(max-width: 1023px) 50vw, 21vw"
                    crossOrigin="anonymous"
                    unoptimized
                    onError={(event) =>
                      showPropertyImageFallback(event.currentTarget)
                    }
                    className="object-cover transition-transform hover:scale-[1.02]"
                  />
                  {showOverlay && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">
                      +{extraCount}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {galleryImages.length > 1 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">
            Browse photos by section
          </p>
          <div className="overflow-x-auto pb-2">
            <div className="flex w-max gap-3">
              <GalleryCategoryButton
                label="All photos"
                image={galleryImages[0]}
                count={galleryImages.length}
                onClick={() => openCategory("All")}
              />
              {categories.map((category) => {
                const categoryImages = galleryImages.filter(
                  (image) =>
                    propertyImageCategoryFromName(image.name) === category,
                );
                return (
                  <GalleryCategoryButton
                    key={category}
                    label={category}
                    image={categoryImages[0]}
                    count={categoryImages.length}
                    onClick={() => openCategory(category)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      <PropertyImageLightbox
        images={galleryImages}
        initialIndex={startIndex}
        initialCategory={startCategory}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </>
  );
}

function GalleryCategoryButton({
  label,
  image,
  count,
  onClick,
}: {
  label: string;
  image: PropertyImage;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-32 flex-col items-stretch gap-1.5 p-1 text-left"
      onClick={onClick}
    >
      <span className="relative aspect-[4/3] overflow-hidden rounded-md">
        <Image
          src={image.url}
          alt=""
          fill
          sizes="128px"
          crossOrigin="anonymous"
          unoptimized
          onError={(event) => showPropertyImageFallback(event.currentTarget)}
          className="object-cover"
        />
        <span className="absolute bottom-1 right-1 rounded-full bg-black/65 px-1.5 py-0.5 text-xs text-white">
          {count}
        </span>
      </span>
      <span className="truncate px-1 pb-0.5">{label}</span>
    </Button>
  );
}

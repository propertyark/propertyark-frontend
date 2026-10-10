import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { Navbar } from "@/components/shared/navbar";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { PropertyGallery } from "@/features/properties/components/property-gallery";
import { PropertyHeader } from "@/features/properties/components/property-header";
import { PropertyOverview } from "@/features/properties/components/property-overview";
import { PropertyInformation } from "@/features/properties/components/property-information";
import { PropertyAmenities } from "@/features/properties/components/property-amenities";
import { PropertyDescriptionContent } from "@/features/properties/components/property-description-content";
import { PropertyVideo } from "@/features/properties/components/property-video";
import { PropertyMap } from "@/features/properties/components/property-map";
import { VendorContactCard } from "@/features/properties/components/vendor-contact-card";
import { SimilarPropertiesCarousel } from "@/features/properties/components/similar-properties-carousel";
import { PropertyViewTracker } from "@/features/properties/components/property-view-tracker";
import { ShortletBookingCard } from "@/features/properties/components/shortlet-booking-card";
import { Footer } from "@/components/shared/footer";
import {
  getAvailablePropertiesServer,
  getFeaturedPropertiesServer,
} from "@/features/properties/server/get-available-properties";
import { CONTAINER, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serializeJsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";

const getPropertyResults = cache(() => getAvailablePropertiesServer());

async function getProperty(id: string) {
  const { properties } = await getPropertyResults();
  return properties.find((property) => property.id === id);
}

function propertyDescription(description: string) {
  const normalized = description
    .replace(/(\*\*|__|\*|_|~~|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 155
    ? `${normalized.slice(0, 152).trimEnd()}...`
    : normalized;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (id.startsWith("draft:"))
    return { robots: { index: false, follow: false } };

  try {
    const property = await getProperty(id);
    if (!property) return { robots: { index: false, follow: false } };

    const description = propertyDescription(property.description);
    const path = `/properties/${property.id}`;
    return {
      title: property.title,
      description,
      alternates: { canonical: path },
      openGraph: {
        title: property.title,
        description,
        url: path,
        siteName: SITE_NAME,
        locale: "en_NG",
        type: "website",
        images: property.images.map((url) => ({
          url,
          alt: property.title,
        })),
      },
      twitter: {
        card: "summary_large_image",
        title: property.title,
        description,
        images: property.images.slice(0, 1),
      },
    };
  } catch {
    return {
      title: "Property listing",
      robots: { index: false, follow: false },
    };
  }
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (id.startsWith("draft:"))
    redirect(`/vendor/properties/new?draft=${id.slice("draft:".length)}`);

  const [{ properties }, featuredProperties] = await Promise.all([
    getPropertyResults(),
    getFeaturedPropertiesServer(),
  ]);
  const base = properties.find((property) => property.id === id);
  if (!base) return notFound();

  const featuredProperty = featuredProperties.find(
    (candidate) => candidate.id === id,
  );
  const property = featuredProperty
    ? {
        ...base,
        isFeatured: true,
        featuredAt: featuredProperty.featuredAt,
        featuredUntil: featuredProperty.featuredUntil,
        featureExpiresAt: featuredProperty.featureExpiresAt,
      }
    : base;
  const similar = properties
    .filter((candidate) => candidate.id !== property.id)
    .slice(0, 12);
  const propertyUrl = `${SITE_URL}/properties/${property.id}`;
  const propertyJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${propertyUrl}#listing`,
    name: property.title,
    description: propertyDescription(property.description),
    image: property.images,
    url: propertyUrl,
    sku: property.id,
    category: property.type,
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "Offer",
      url: propertyUrl,
      price: property.price,
      priceCurrency: property.currency,
      availability:
        property.status === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: property.vendorName || SITE_NAME,
      },
    },
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Location",
        value: [
          property.location.address,
          property.location.city,
          property.location.state,
          property.location.country,
        ]
          .filter(Boolean)
          .join(", "),
      },
      {
        "@type": "PropertyValue",
        name: "Bedrooms",
        value: property.bedrooms,
      },
      {
        "@type": "PropertyValue",
        name: "Bathrooms",
        value: property.bathrooms,
      },
    ],
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Properties",
        item: `${SITE_URL}/properties`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: property.title,
        item: propertyUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd([propertyJsonLd, breadcrumbJsonLd]),
        }}
      />
      <PropertyViewTracker propertyId={property.id} />
      <Navbar reserveSpace />
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Properties", href: "/properties" },
        ]}
        style={{ marginTop: "2rem" }}
      />

      <div className={cn(CONTAINER, "py-8")}>
        <PropertyHeader property={property} />

        <div className="mt-6">
          <PropertyGallery
            images={property.images}
            imageMedia={property.imageMedia}
            streetViewAddress={[
              property.location.address,
              property.location.city,
              property.location.state,
              property.location.country,
            ]
              .filter(Boolean)
              .join(", ")}
          />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-10">
            <PropertyOverview property={property} />
            <PropertyInformation property={property} />

            <section>
              <h2 className="text-lg font-semibold text-foreground">
                Property Description
              </h2>
              <PropertyDescriptionContent
                description={property.description}
                className="mt-4"
              />
            </section>

            {property.amenities && (
              <PropertyAmenities amenities={property.amenities} />
            )}

            {property.purpose === "shortlet" && property.shortletDetails && (
              <Card>
                <CardHeader>
                  <CardTitle>Stay information and policies</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="font-medium">Check-in and check-out</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Check-in:{" "}
                      {property.shortletDetails.checkInTime || "Contact host"}
                      {" · "}
                      Check-out:{" "}
                      {property.shortletDetails.checkOutTime || "Contact host"}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium">House rules</h3>
                    {property.shortletDetails.houseRules.length ? (
                      <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                        {property.shortletDetails.houseRules.map((rule) => (
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
                      {property.shortletDetails.cancellationPolicy ||
                        "Contact the host for cancellation terms."}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium">Payment policy</h3>
                    <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                      {property.shortletDetails.paymentPolicy ||
                        "Payment terms will be confirmed before booking."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {property.videoUrl && (
              <PropertyVideo
                thumbnailSrc={property.images[0]}
                videoUrl={property.videoUrl}
              />
            )}

            <PropertyMap
              address={`${property.location.address}, ${property.location.city}`}
            />

            {/* The property reviews section will be restored later. */}
          </div>

          <div>
            {property.purpose === "shortlet" ? (
              <ShortletBookingCard property={property} />
            ) : (
              <VendorContactCard property={property} />
            )}
          </div>
        </div>
      </div>

      <div className={cn(CONTAINER, "py-16")}>
        <SimilarPropertiesCarousel properties={similar} />
      </div>

      <Footer />
    </>
  );
}

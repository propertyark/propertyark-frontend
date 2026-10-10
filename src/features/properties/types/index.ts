export type PropertyType =
  | "duplex"
  | "bungalow"
  | "apartment"
  | "terrace"
  | "detached-house"
  | "semi-detached"
  | "land"
  | "shortlet"
  | "commercial";

export type PropertyStatus =
  | "available"
  | "under-offer"
  | "sold"
  | "rented"
  | "pending-approval"
  | "rejected"
  | "delisted";

export type PropertyListingPurpose = "sale" | "rent" | "shortlet" | "land";

export interface PropertyLocation {
  address: string;
  city: string;
  state: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface PropertyDocument {
  id: string;
  name: string;
  url: string;
  type: "title-deed" | "survey-plan" | "certificate-of-occupancy" | "other";
  uploadedAt: string;
}

export interface PropertyImage {
  id: string;
  name: string;
  url: string;
}

export interface Property {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: "NGN" | "USD";
  type: PropertyType;
  purpose: PropertyListingPurpose;
  status: PropertyStatus;
  location: PropertyLocation;
  bedrooms: number;
  bathrooms: number;
  sizeSqm?: number;
  sizeUnit?: "sqm" | "sqft";
  images: string[];
  imageMedia?: PropertyImage[];
  videos?: string[];
  documents?: PropertyDocument[];
  amenities?: string[];
  vendorId: string;
  isVerified: boolean;
  isFeatured?: boolean;
  featuredAt?: string | null;
  featuredUntil?: string | null;
  featureExpiresAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  unavailableDateRanges?: Array<{
    start: string;
    end: string;
  }>;
  shortletDetails?: {
    checkInTime?: string;
    checkOutTime?: string;
    houseRules: string[];
    cancellationPolicy?: string;
    paymentPolicy?: string;
  };
}

// For property comparison and search/filter features
export interface PropertyFilters {
  type?: PropertyType;
  purpose?: PropertyListingPurpose;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  city?: string;
  state?: string;
  isVerified?: boolean;
}

export interface PropertyInspection {
  id: string;
  propertyId: string;
  buyerId: string;
  scheduledDate: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  notes?: string;
}

export interface PropertyReview {
  id: string;
  reviewerName: string;
  reviewerAvatarUrl?: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// Add these optional fields to the existing `Property` interface:
export interface Property {
  // ...all your existing fields stay unchanged
  rating?: number;
  reviewCount?: number;
  garageSpaces?: number;
  yearBuilt?: number;
  landSizeSqm?: number;
  roomsCount?: number;
  amenities?: string[];
  videoUrl?: string;
  vendorName?: string;
  vendorAvatarUrl?: string;
  vendorPhone?: string;
  reviews?: PropertyReview[];
}

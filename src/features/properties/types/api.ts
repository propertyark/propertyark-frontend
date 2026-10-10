export interface PropertyMediaResponse {
  id: string;
  name: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  isPrimary: boolean;
}

export interface PropertyBookedSlotResponse {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
}

export interface PropertyApiItem {
  id: string;
  name: string;
  description: string;
  type: string;
  listingType: string;
  status: string;
  /** Publication workflow state returned by the backend (for example ACTIVE). */
  listingStatus?: string;
  rentAmount: number | null;
  salePrice: number | null;
  landFee: number | null;
  shortletAmount: number | null;
  address: string;
  city: string;
  state: string;
  country: string;
  zipCode?: string;
  size: number;
  sizeUnit?: string;
  bedrooms: number;
  bathrooms: number;
  amenities?: string[];
  condition?: string;
  yearBuilt?: number;
  documents?: Array<{
    id: string;
    name?: string;
    fileName?: string;
    url?: string;
    fileUrl?: string;
    type?: string;
    status?: string;
  }>;
  vendorId: string;
  createdAt: string;
  updatedAt?: string;
  media?: PropertyMediaResponse[];
  bookedSlots?: PropertyBookedSlotResponse[];
  shortletCheckInTime?: string | null;
  shortletCheckOutTime?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  houseRules?: string[];
  cancellationPolicy?: string | null;
  paymentPolicy?: string | null;
  priceDisplay?: string;
  approvalStatus?: string;
  reviewStatus?: string;
  rejectionReason?: string | null;
  verificationStatus?: string;
  isApproved?: boolean;
  approved?: boolean;
  isVerified?: boolean;
  viewCount?: number;
  views?: number;
  inquiryCount?: number;
  leads?: number;
  isFeatured?: boolean;
  featuredAt?: string | null;
  featuredUntil?: string | null;
  featureExpiresAt?: string | null;
  vendor?: {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    avatar?: string;
  };
}

export interface AvailablePropertiesResponse {
  success: boolean;
  message: string;
  data: {
    properties: PropertyApiItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

import axios from "axios";
import { api } from "@/services/axios";
import type {
  AvailablePropertiesResponse,
  PropertyApiItem,
  PropertyMediaResponse,
} from "@/features/properties/types/api";
import {
  normalizePropertyMediaUrl,
  normalizePropertyResponse,
} from "@/features/properties/utils/normalize-property-response";

export interface AvailablePropertyFilters {
  listingTypes?: string[];
  propertyTypes?: string[];
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  search?: string;
}

export interface AvailablePropertiesPageOptions {
  page?: number;
  limit?: number;
  filters?: AvailablePropertyFilters;
}

export interface VendorPropertiesResult {
  properties: PropertyApiItem[];
  pagination: { page: number; limit: number; total: number; pages: number };
  metrics: { occupancyRate: number; soldRate: number };
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function normalizeMediaItem(value: unknown): PropertyMediaResponse | null {
  if (typeof value === "string" && value.trim()) {
    return {
      id: value,
      name: fileNameFromUrl(value),
      url: value,
      type: "IMAGE",
      isPrimary: false,
    };
  }

  const media = asRecord(value);
  const id = media.id ?? media._id ?? media.mediaId;
  const url =
    media.url ??
    media.fileUrl ??
    media.secureUrl ??
    media.path ??
    media.location;
  if (typeof id !== "string" || typeof url !== "string") return null;

  const rawType = String(
    media.type ?? media.mediaType ?? media.resourceType ?? "",
  ).toUpperCase();
  if (
    rawType.includes("DOCUMENT") ||
    rawType.includes("PDF") ||
    /\.(pdf|doc|docx)(?:\?|$)/i.test(url)
  ) {
    return null;
  }
  const type = rawType.includes("VIDEO") ? "VIDEO" : "IMAGE";

  return {
    id,
    name: String(
      media.name ??
        media.fileName ??
        media.originalName ??
        fileNameFromUrl(url),
    ),
    url: normalizePropertyMediaUrl(url),
    type,
    isPrimary: Boolean(
      media.isPrimary ?? media.primary ?? media.isCover ?? media.cover,
    ),
  };
}

type PropertyDocument = NonNullable<PropertyApiItem["documents"]>[number];

function fileNameFromUrl(url: string) {
  const path = url.split("?")[0];
  return decodeURIComponent(path.split("/").pop() || "Property document");
}

function normalizeDocumentItem(
  value: unknown,
  knownDocument = false,
): PropertyDocument | null {
  const document = asRecord(value);
  const url =
    typeof value === "string"
      ? value
      : (document.url ??
        document.fileUrl ??
        document.secureUrl ??
        document.path ??
        document.location);
  if (typeof url !== "string" || !url.trim()) return null;

  const rawType = String(
    document.type ?? document.mediaType ?? document.resourceType ?? "",
  ).toUpperCase();
  const isDocument =
    rawType.includes("DOCUMENT") ||
    rawType.includes("PDF") ||
    /\.(pdf|doc|docx)(?:\?|$)/i.test(url);
  if (!knownDocument && !isDocument) return null;

  return {
    id: String(document.id ?? document._id ?? document.mediaId ?? url),
    name: String(
      document.name ??
        document.fileName ??
        document.originalName ??
        fileNameFromUrl(url),
    ),
    // Keep the source URL for documents. The visual-media proxy can return an
    // image-style error response when it is asked to stream a PDF.
    url,
    type: rawType || "DOCUMENT",
    status: String(document.status ?? "UPLOADED"),
  };
}

function mediaSource(value: unknown): unknown[] {
  const root = asRecord(value);
  const data = root.data ?? value;
  if (Array.isArray(data)) return data;

  const dataRecord = asRecord(data);
  const collections = [
    dataRecord.media,
    dataRecord.items,
    dataRecord.results,
    dataRecord.photos,
    dataRecord.videos,
    root.media,
  ].filter(Array.isArray) as unknown[][];

  return collections.flat();
}

function normalizePropertyAssets(value: unknown) {
  const root = asRecord(value);
  const data = asRecord(root.data ?? value);
  const source = mediaSource(value);
  const explicitDocuments = [data.documents, root.documents]
    .filter(Array.isArray)
    .flat() as unknown[];
  const documents = [
    ...explicitDocuments.map((item) => normalizeDocumentItem(item, true)),
    ...source.map((item) => normalizeDocumentItem(item)),
  ].filter((item): item is PropertyDocument => Boolean(item));

  return {
    media: source
      .map(normalizeMediaItem)
      .filter((item): item is PropertyMediaResponse => Boolean(item)),
    documents: [...new Map(documents.map((item) => [item.id, item])).values()],
  };
}

/** Handles both `{ data: [] }` and `{ data: { media: [] } }` API envelopes. */
function normalizeMediaResponse(value: unknown): PropertyMediaResponse[] {
  return normalizePropertyAssets(value).media;
}

function normalizeVendorProperty(value: unknown): PropertyApiItem {
  const property = asRecord(value) as unknown as PropertyApiItem;
  const source = asRecord(value);
  const pricing = asRecord(
    source.pricing ?? source.priceDetails ?? source.rates,
  );
  const shortlet = asRecord(
    source.shortletDetails ?? source.shortletPolicies ?? source.policies,
  );
  const optionalText = (...values: unknown[]) => {
    const value = values.find(
      (candidate) => typeof candidate === "string" && candidate.trim(),
    );
    return typeof value === "string" ? value.trim() : null;
  };
  const rulesValue =
    source.houseRules ?? shortlet.houseRules ?? shortlet.rules ?? [];
  const houseRules = Array.isArray(rulesValue)
    ? rulesValue
        .map(String)
        .map((rule) => rule.trim())
        .filter(Boolean)
    : typeof rulesValue === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(rulesValue);
            if (Array.isArray(parsed))
              return parsed
                .map(String)
                .map((rule) => rule.trim())
                .filter(Boolean);
          } catch {
            // Older API records can store rules as newline-separated text.
          }
          return rulesValue
            .split(/\r?\n/)
            .map((rule) => rule.trim())
            .filter(Boolean);
        })()
      : [];
  const embeddedMedia =
    [source.media, source.medias, source.photos, source.images].find(
      Array.isArray,
    ) ?? [];
  const embeddedDocuments = Array.isArray(source.documents)
    ? source.documents
    : [];
  const documents = [
    ...embeddedDocuments.map((item) => normalizeDocumentItem(item, true)),
    ...embeddedMedia.map((item) => normalizeDocumentItem(item)),
  ].filter((item): item is PropertyDocument => Boolean(item));
  const amountFrom = (...values: unknown[]) => {
    for (const candidate of values) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === "string" && candidate.trim()) {
        const normalized = Number(candidate.replace(/[^0-9.-]/g, ""));
        if (Number.isFinite(normalized)) return normalized;
      }
    }
    return null;
  };
  const rawListingType = String(
    source.listingType ?? source.purpose ?? source.listingPurpose ?? "FOR_SALE",
  ).toUpperCase();
  const listingType = rawListingType.startsWith("FOR_")
    ? rawListingType
    : rawListingType.includes("SHORT")
      ? "FOR_SHORTLET"
      : rawListingType.includes("RENT")
        ? "FOR_RENT"
        : rawListingType.includes("LAND")
          ? "FOR_LAND"
          : "FOR_SALE";
  const commonPrice = amountFrom(
    source.price,
    source.amount,
    source.listingPrice,
    source.propertyPrice,
    pricing.price,
    pricing.amount,
  );

  return {
    ...property,
    listingType,
    rentAmount: amountFrom(
      source.rentAmount,
      source.monthlyRent,
      source.rentPrice,
      pricing.rentAmount,
      pricing.monthlyRent,
      listingType === "FOR_RENT" ? commonPrice : null,
    ),
    salePrice: amountFrom(
      source.salePrice,
      source.sellingPrice,
      pricing.salePrice,
      listingType === "FOR_SALE" ? commonPrice : null,
    ),
    landFee: amountFrom(
      source.landFee,
      source.landPrice,
      pricing.landFee,
      listingType === "FOR_LAND" ? commonPrice : null,
    ),
    shortletAmount: amountFrom(
      source.shortletAmount,
      source.nightlyRate,
      source.pricePerNight,
      pricing.shortletAmount,
      pricing.nightlyRate,
      listingType === "FOR_SHORTLET" ? commonPrice : null,
    ),
    shortletCheckInTime: optionalText(
      source.shortletCheckInTime,
      source.checkInTime,
      shortlet.checkInTime,
      // Keep reading the initially proposed names for draft API compatibility.
      source.shortletCheckInDate,
    ),
    shortletCheckOutTime: optionalText(
      source.shortletCheckOutTime,
      source.checkOutTime,
      shortlet.checkOutTime,
      source.shortletCheckOutDate,
    ),
    houseRules,
    cancellationPolicy: optionalText(
      source.cancellationPolicy,
      shortlet.cancellationPolicy,
    ),
    paymentPolicy: optionalText(source.paymentPolicy, shortlet.paymentPolicy),
    media: normalizeMediaResponse({ data: embeddedMedia }),
    documents: [...new Map(documents.map((item) => [item.id, item])).values()],
  };
}

function unwrapProperty(value: unknown): PropertyApiItem {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const candidate = data.property ?? root.property ?? root.data ?? value;
  return normalizeVendorProperty(candidate);
}

/**
 * Some backend deployments persist a property successfully and then return a
 * 500 while resolving the newly uploaded media IDs. Recover only that exact
 * post-save failure so retrying the form cannot create a duplicate property.
 */
function persistedPropertyIdFromMediaLookupError(error: unknown) {
  if (!axios.isAxiosError(error)) return null;

  const payload = asRecord(error.response?.data);
  const message = [payload.message, payload.error, payload.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (
    !message.includes("prisma.media.findMany") ||
    !message.includes("undefined")
  ) {
    return null;
  }

  return message.match(/propertyId\s*:\s*["']([^"']+)["']/)?.[1] ?? null;
}

async function recoverPersistedProperty(error: unknown) {
  const propertyId = persistedPropertyIdFromMediaLookupError(error);
  if (!propertyId) throw error;

  // Prefer the vendor collection here. Some backend versions repeat the same
  // broken media lookup on the single-property endpoint.
  const { data } = await api.get<unknown>("/properties/my-properties", {
    params: { page: 1, limit: 1000 },
  });
  const recovered = normalizeVendorPropertiesResponse(
    data,
    1,
    1000,
  ).properties.find((property) => property.id === propertyId);

  if (recovered) return recovered;

  // The database ID came from the backend error, but the new row was not
  // returned by the authenticated vendor collection. Preserve the original
  // failure rather than risking a second submission and a duplicate listing.
  throw error;
}

function normalizeVendorPropertiesResponse(
  value: unknown,
  page: number,
  limit: number,
): VendorPropertiesResult {
  const root =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const data =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const properties = [
    Array.isArray(root.data) ? root.data : undefined,
    data.properties,
    data.items,
    data.results,
    root.properties,
  ].find(Array.isArray) as PropertyApiItem[] | undefined;
  const paginationSource =
    data.pagination && typeof data.pagination === "object"
      ? (data.pagination as Record<string, unknown>)
      : data;
  const rows = (properties ?? []).map(normalizeVendorProperty);
  const metricsSource = asRecord(
    data.metrics ?? data.stats ?? data.summary ?? root.metrics ?? root.stats,
  );
  const numberValue = (key: string, fallback: number) => {
    const candidate = paginationSource[key];
    return typeof candidate === "number"
      ? candidate
      : typeof candidate === "string" && !Number.isNaN(Number(candidate))
        ? Number(candidate)
        : fallback;
  };
  const total = numberValue("total", rows.length);
  const optionalNumber = (keys: string[]) => {
    for (const key of keys) {
      const candidate = metricsSource[key] ?? data[key] ?? root[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
      if (
        typeof candidate === "string" &&
        candidate.trim() &&
        !Number.isNaN(Number(candidate))
      ) {
        return Number(candidate);
      }
    }
    return null;
  };
  const rateFromRows = (kind: "occupancy" | "sold") => {
    const eligible = rows.filter((property) => {
      const listingType = property.listingType?.toUpperCase() ?? "";
      return kind === "occupancy"
        ? Boolean(
            property.rentAmount != null ||
            property.shortletAmount != null ||
            listingType.includes("RENT") ||
            listingType.includes("SHORTLET"),
          )
        : Boolean(property.salePrice != null || listingType.includes("SALE"));
    });
    if (!eligible.length) return 0;
    const matching = eligible.filter((property) => {
      const source = asRecord(property);
      const status = String(
        kind === "occupancy"
          ? (source.occupancyStatus ??
              source.availabilityStatus ??
              source.status)
          : (source.saleStatus ?? source.listingStatus ?? source.status),
      ).toUpperCase();
      return kind === "occupancy"
        ? source.isOccupied === true || status === "OCCUPIED"
        : source.isSold === true || status === "SOLD";
    }).length;
    return Math.round((matching / eligible.length) * 100);
  };
  return {
    properties: rows,
    pagination: {
      page: numberValue("page", page),
      limit: numberValue("limit", limit),
      total,
      pages: numberValue("pages", Math.max(1, Math.ceil(total / limit))),
    },
    metrics: {
      occupancyRate:
        optionalNumber([
          "occupancyRate",
          "occupancyPercentage",
          "occupiedRate",
        ]) ?? rateFromRows("occupancy"),
      soldRate:
        optionalNumber(["soldRate", "salesRate", "soldPercentage"]) ??
        rateFromRows("sold"),
    },
  };
}

async function getFilteredAvailable(filters: AvailablePropertyFilters = {}) {
  const { listingTypes = [], propertyTypes = [], ...commonFilters } = filters;
  const request = (listingType?: string, type?: string) =>
    api.get<AvailablePropertiesResponse>("/properties/available", {
      params: {
        ...commonFilters,
        listingType,
        type,
        // The UI owns pagination, so request the complete filtered collection.
        limit: 1000,
      },
    });
  const listingFilters = listingTypes.length ? listingTypes : [undefined];
  const typeFilters = propertyTypes.length ? propertyTypes : [undefined];
  const responses = await Promise.all(
    listingFilters.flatMap((listingType) =>
      typeFilters.map((type) => request(listingType, type)),
    ),
  );
  const uniqueProperties = new Map<string, PropertyApiItem>();
  responses.forEach(({ data }) =>
    data.data.properties.forEach((property) =>
      uniqueProperties.set(property.id, property),
    ),
  );
  return [...uniqueProperties.values()].map(normalizePropertyResponse);
}

export const propertyService = {
  getVendorProperties: async ({
    page = 1,
    limit = 1000,
  }: { page?: number; limit?: number } = {}) => {
    const { data } = await api.get<unknown>("/properties/my-properties", {
      params: { page, limit },
    });
    return normalizeVendorPropertiesResponse(data, page, limit);
  },
  getById: async (propertyId: string) => {
    const { data } = await api.get<unknown>(`/properties/${propertyId}`);
    return unwrapProperty(data);
  },
  getAvailable: async ({
    page = 1,
    limit = 12,
  }: { page?: number; limit?: number } = {}) => {
    const { data } = await api.get<AvailablePropertiesResponse>(
      "/properties/available",
      { params: { page, limit } },
    );
    return {
      properties: data.data.properties.map(normalizePropertyResponse),
      pagination: data.data.pagination,
    };
  },
  getFeatured: async () => {
    const [{ data }, availableProperties] = await Promise.all([
      api.get<unknown>("/credit-points/featured"),
      getFilteredAvailable().catch(() => []),
    ]);
    const featuredProperties = normalizeVendorPropertiesResponse(
      data,
      1,
      100,
    ).properties.map(normalizePropertyResponse);
    const availableById = new Map(
      availableProperties.map((property) => [property.id, property]),
    );

    return featuredProperties.map((featuredProperty) => {
      const completeProperty = availableById.get(featuredProperty.id);
      if (!completeProperty) return featuredProperty;

      return {
        ...completeProperty,
        isFeatured: true,
        featuredAt: featuredProperty.featuredAt,
        featuredUntil: featuredProperty.featuredUntil,
        featureExpiresAt: featuredProperty.featureExpiresAt,
      };
    });
  },
  getFeaturedApiItems: async () => {
    const { data } = await api.get<unknown>("/credit-points/featured");
    return normalizeVendorPropertiesResponse(data, 1, 100).properties;
  },
  feature: async (propertyId: string, points: number) => {
    const { data } = await api.patch<unknown>(
      `/credit-points/feature/${encodeURIComponent(propertyId)}`,
      { points },
    );
    return data;
  },
  unfeature: async (propertyId: string, points: number) => {
    const { data } = await api.patch<unknown>(
      `/credit-points/unfeature/${encodeURIComponent(propertyId)}`,
      { points },
    );
    return data;
  },
  getAvailablePage: async ({
    page = 1,
    limit = 12,
    filters = {},
  }: AvailablePropertiesPageOptions = {}) => {
    const { listingTypes = [], propertyTypes = [], ...commonFilters } = filters;
    const { data } = await api.get<AvailablePropertiesResponse>(
      "/properties/available",
      {
        params: {
          page,
          limit,
          ...commonFilters,
          listingType: listingTypes.length === 1 ? listingTypes[0] : undefined,
          listingTypes: listingTypes.length > 1 ? listingTypes : undefined,
          type: propertyTypes.length === 1 ? propertyTypes[0] : undefined,
          types: propertyTypes.length > 1 ? propertyTypes : undefined,
        },
      },
    );

    return {
      properties: data.data.properties.map(normalizePropertyResponse),
      pagination: data.data.pagination,
    };
  },
  getAllAvailable: getFilteredAvailable,
  create: async (payload: FormData) => {
    try {
      const { data } = await api.post<unknown>("/properties", payload);
      return unwrapProperty(data);
    } catch (error) {
      return recoverPersistedProperty(error);
    }
  },
  update: async (propertyId: string, payload: FormData) => {
    try {
      const { data } = await api.patch<unknown>(
        `/properties/${propertyId}`,
        payload,
      );
      return unwrapProperty(data);
    } catch (error) {
      const recoveredPropertyId =
        persistedPropertyIdFromMediaLookupError(error);
      if (!recoveredPropertyId || recoveredPropertyId !== propertyId) {
        throw error;
      }
      return recoverPersistedProperty(error);
    }
  },
  remove: async (propertyId: string) => {
    if (propertyId.startsWith("draft:")) {
      const { deletePropertyDraft } =
        await import("@/features/vendor/lib/property-drafts");
      await deletePropertyDraft(propertyId.slice("draft:".length));
      return { success: true };
    }
    const { data } = await api.delete(`/properties/${propertyId}`);
    return data;
  },
  getMedia: async (propertyId: string) => {
    const { data } = await api.get<unknown>(`/properties/${propertyId}/media`);
    return normalizeMediaResponse(data);
  },
  getAssets: async (propertyId: string) => {
    const { data } = await api.get<unknown>(`/properties/${propertyId}/media`);
    return normalizePropertyAssets(data);
  },
  uploadMedia: async (propertyId: string, payload: FormData) => {
    const { data } = await api.post<unknown>(
      `/properties/${propertyId}/media`,
      payload,
    );
    return normalizeMediaResponse(data);
  },
  setPrimaryMedia: async (mediaId: string) => {
    const { data } = await api.patch(`/properties/media/${mediaId}/primary`);
    return data;
  },
  renameMedia: async (mediaId: string, name: string) => {
    const { data } = await api.patch(`/properties/media/${mediaId}`, { name });
    return data;
  },
  bulkDeleteMedia: async (propertyId: string, mediaIds: string[]) => {
    const { data } = await api.delete(`/properties/${propertyId}/media/bulk`, {
      data: { mediaIds },
    });
    return data;
  },
};

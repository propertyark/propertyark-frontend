"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Check,
  FileCheck2,
  FileText,
  ImagePlus,
  Info,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/services/api-error";
import { propertyService } from "@/services/property.service";
import { useAccountKey } from "@/lib/account-identity";
import { vendorDashboardQueryKey } from "@/features/vendor/hooks/use-vendor-dashboard";
import {
  creditPaymentKeys,
  useCreditInfo,
  useCreditRules,
} from "@/features/vendor/hooks/use-credit-payment";
import {
  useVendorProperties,
  vendorPropertiesQueryKey,
} from "@/features/vendor/hooks/use-vendor-properties";
import type { PropertyMediaResponse } from "@/features/properties/types/api";
import { PropertyDescriptionContent } from "@/features/properties/components/property-description-content";
import { propertyImageUploadName } from "@/features/properties/lib/property-image-categories";
import { getAmenityIcon } from "@/features/properties/utils/amenity-icons";
import {
  PropertyFileList,
  PropertyStepper,
  PropertyTipCard,
  PropertyUploadBox,
} from "@/features/vendor/components/add-property-wizard-ui";
import {
  ReorderablePropertyPhotoGrid,
  type ReorderablePropertyPhoto,
} from "@/features/vendor/components/reorderable-property-photo-grid";
import { PropertyDescriptionEditor } from "@/features/vendor/components/property-description-editor";
import {
  GoogleAddressAutocomplete,
  type SelectedGoogleAddress,
} from "@/features/vendor/components/google-address-autocomplete";
import {
  formatPropertyMoney,
  INITIAL_PROPERTY_VALUES,
  MAX_PROPERTY_PHOTOS,
  PROPERTY_DESCRIPTION_MAX_LENGTH,
  PRICE_FIELDS,
  PRICE_LABELS,
  readablePropertyValue,
  type AddPropertyFormValues,
  type LegalFiles,
} from "@/features/vendor/lib/add-property-form";
import {
  deletePropertyDraft,
  getDraftMedia,
  getPropertyDraft,
  PROPERTY_DRAFT_TTL_MS,
  saveDraftMedia,
  savePropertyDraft,
} from "@/features/vendor/lib/property-drafts";

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function AddPropertyWizard({
  initialDraftId,
  initialPropertyId,
}: {
  initialDraftId: string | null;
  initialPropertyId: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accountKey = useAccountKey();
  const vendorProperties = useVendorProperties();
  const isEditing = Boolean(initialPropertyId);
  const creditRules = useCreditRules(!isEditing);
  const creditInfo = useCreditInfo(!isEditing);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<AddPropertyFormValues>(
    INITIAL_PROPERTY_VALUES,
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const expiryTimer = useRef<number | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [amenityInput, setAmenityInput] = useState("");
  const [documents, setDocuments] = useState<LegalFiles>({
    ownership: [],
    identification: [],
    tax: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [existingMedia, setExistingMedia] = useState<PropertyMediaResponse[]>(
    [],
  );
  const [deletingMediaIds, setDeletingMediaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [renamingMediaIds, setRenamingMediaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [settingPrimaryMediaId, setSettingPrimaryMediaId] = useState<
    string | null
  >(null);
  const editInitialized = useRef(false);
  const propertyCreationCost =
    creditRules.data?.propertyCreationCost ??
    creditInfo.data?.propertyCreationCost ??
    null;
  const availablePoints = creditInfo.data?.balance ?? null;
  const creditDetailsLoading =
    !isEditing && (creditRules.isLoading || creditInfo.isLoading);
  const hasEnoughPoints =
    propertyCreationCost !== null &&
    availablePoints !== null &&
    availablePoints >= propertyCreationCost;
  const creditDetailsUnavailable =
    !creditDetailsLoading &&
    (propertyCreationCost === null || availablePoints === null);
  const pointsNeeded =
    propertyCreationCost !== null &&
    availablePoints !== null &&
    availablePoints < propertyCreationCost
      ? propertyCreationCost - availablePoints
      : null;
  const insufficientPoints = pointsNeeded !== null;
  const balanceAfterSubmission = hasEnoughPoints
    ? availablePoints - propertyCreationCost
    : null;
  const photoUrls = useMemo(
    () => photos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [photos],
  );
  useEffect(
    // Object URLs retain browser memory until explicitly revoked.
    () => () => photoUrls.forEach(({ url }) => URL.revokeObjectURL(url)),
    [photoUrls],
  );
  useEffect(() => {
    if (!initialDraftId) return;
    // Draft metadata lives in localStorage, while File objects are restored from
    // IndexedDB because they cannot be serialized safely as JSON.
    void (async () => {
      const draft =
        await getPropertyDraft<AddPropertyFormValues>(initialDraftId);
      if (!draft) {
        toast.error("This draft expired or no longer exists.");
        router.replace("/vendor/properties/new");
        return;
      }
      const media = await getDraftMedia(initialDraftId);
      queueMicrotask(() => {
        setValues({ ...INITIAL_PROPERTY_VALUES, ...draft.values });
        setStep(draft.step);
        setPhotos((media?.photos ?? []).slice(0, MAX_PROPERTY_PHOTOS));
        setVideos(media?.videos ?? []);
        setDocuments(
          media?.documents ?? { ownership: [], identification: [], tax: [] },
        );
        setDraftId(initialDraftId);
      });
    })();
  }, [initialDraftId, router]);
  useEffect(() => {
    if (!initialPropertyId || editInitialized.current) return;
    const property = vendorProperties.data?.properties.find(
      (item) => item.id === initialPropertyId,
    );
    if (!property) {
      if (!vendorProperties.isLoading && vendorProperties.data) {
        toast.error("The property could not be found in your listings.");
        router.replace("/vendor/dashboard#properties");
      }
      return;
    }

    editInitialized.current = true;
    const price =
      property.listingType === "FOR_RENT"
        ? property.rentAmount
        : property.listingType === "FOR_LAND"
          ? property.landFee
          : property.listingType === "FOR_SHORTLET"
            ? property.shortletAmount
            : property.salePrice;
    queueMicrotask(() =>
      setValues({
        name: property.name ?? "",
        description: property.description ?? "",
        type: property.type as AddPropertyFormValues["type"],
        listingType:
          property.listingType as AddPropertyFormValues["listingType"],
        status: [
          "AVAILABLE",
          "OCCUPIED",
          "UNDER_MAINTENANCE",
          "UNDER_CONSTRUCTION",
          "SOLD",
          "RENTED",
        ].includes(property.status?.toUpperCase())
          ? (property.status.toUpperCase() as AddPropertyFormValues["status"])
          : "AVAILABLE",
        price: price == null ? "" : String(price),
        address: property.address ?? "",
        city: property.city ?? "",
        state: property.state ?? "",
        country: property.country ?? "Nigeria",
        zipCode: property.zipCode ?? "",
        size: property.size == null ? "" : String(property.size),
        sizeUnit: property.sizeUnit ?? "sqm",
        bedrooms: property.bedrooms == null ? "" : String(property.bedrooms),
        bathrooms: property.bathrooms == null ? "" : String(property.bathrooms),
        amenities: property.amenities ?? [],
        shortletCheckInTime: property.shortletCheckInTime ?? "",
        shortletCheckOutTime: property.shortletCheckOutTime ?? "",
        houseRules: property.houseRules?.join("\n") ?? "",
        cancellationPolicy: property.cancellationPolicy ?? "",
        paymentPolicy: property.paymentPolicy ?? "",
      }),
    );
    void (async () => {
      try {
        const media = property.media?.length
          ? property.media
          : await propertyService.getMedia(property.id);
        setExistingMedia(
          [...media].sort(
            (first, second) =>
              Number(second.isPrimary) - Number(first.isPrimary),
          ),
        );
      } catch {
        setExistingMedia(
          [...(property.media ?? [])].sort(
            (first, second) =>
              Number(second.isPrimary) - Number(first.isPrimary),
          ),
        );
      }
    })();
  }, [
    initialPropertyId,
    router,
    vendorProperties.data,
    vendorProperties.isLoading,
  ]);
  useEffect(() => {
    if (!draftId) return;
    // Debounce autosaves and restart the one-hour inactivity window after edits.
    const timeout = window.setTimeout(() => {
      savePropertyDraft(values, step, draftId);
      void saveDraftMedia(draftId, { photos, videos, documents });
      if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
      expiryTimer.current = window.setTimeout(() => {
        void deletePropertyDraft<AddPropertyFormValues>(draftId);
        setDraftId(null);
        setStep(0);
        setValues(INITIAL_PROPERTY_VALUES);
        setPhotos([]);
        setVideos([]);
        setDocuments({ ownership: [], identification: [], tax: [] });
        router.replace("/vendor/properties/new");
        toast.info("The inactive draft expired after one hour.");
      }, PROPERTY_DRAFT_TTL_MS);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [documents, draftId, photos, router, step, values, videos]);
  useEffect(
    () => () => {
      if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
    },
    [],
  );
  const update = (
    key: keyof AddPropertyFormValues,
    value: string | string[],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };
  const applyGoogleAddress = useCallback((address: SelectedGoogleAddress) => {
    setValues((current) => ({
      ...current,
      address: address.address || current.address,
      city: address.city || current.city,
      state: address.state || current.state,
      country: address.country || current.country,
      zipCode: address.zipCode || current.zipCode,
    }));
    setErrors((current) => ({
      ...current,
      address: "",
      city: "",
      state: "",
      country: "",
    }));
  }, []);
  const addAmenities = (entries: string[]) => {
    const cleaned = entries.map((entry) => entry.trim()).filter(Boolean);
    if (!cleaned.length) return;
    setValues((current) => {
      // Compare case-insensitively while preserving the vendor's original casing.
      const existing = new Set(
        current.amenities.map((entry) => entry.toLocaleLowerCase()),
      );
      const additions = cleaned.filter((entry) => {
        const key = entry.toLocaleLowerCase();
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      return { ...current, amenities: [...current.amenities, ...additions] };
    });
  };
  const handleAmenityInput = (value: string) => {
    const entries = value.split(",");
    const remainder = entries.pop() ?? "";
    if (entries.length) addAmenities(entries);
    setAmenityInput(remainder.replace(/^\s+/, ""));
  };
  const commitAmenityInput = () => {
    addAmenities([amenityInput]);
    setAmenityInput("");
  };

  const validateStep = (index: number) => {
    const next: Record<string, string> = {};
    if (index === 0) {
      if (!values.name.trim()) next.name = "Enter a property title.";
      if (!values.price || Number(values.price) <= 0)
        next.price = "Enter a valid amount.";
      if (!values.address.trim()) next.address = "Enter the property address.";
      if (!values.city.trim()) next.city = "Enter a city.";
      if (!values.state.trim()) next.state = "Enter a state.";
      if (!values.country.trim()) next.country = "Enter a country.";
      if (values.description.trim().length < 20)
        next.description =
          "Add at least 20 characters describing the property.";
      else if (values.description.length > PROPERTY_DESCRIPTION_MAX_LENGTH)
        next.description = `Keep the property description within ${PROPERTY_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters.`;
      if (values.listingType === "FOR_SHORTLET") {
        if (!values.shortletCheckInTime)
          next.shortletCheckInTime = "Select the standard check-in time.";
        if (!values.shortletCheckOutTime)
          next.shortletCheckOutTime = "Select the standard check-out time.";
      }
    }
    if (index === 1) {
      if (!values.size || Number(values.size) <= 0)
        next.size = "Enter a valid property size.";
      if (
        values.type === "RESIDENTIAL" &&
        (!values.bedrooms || Number(values.bedrooms) < 0)
      )
        next.bedrooms = "Enter the number of bedrooms.";
      if (
        values.type === "RESIDENTIAL" &&
        (!values.bathrooms || Number(values.bathrooms) < 0)
      )
        next.bathrooms = "Enter the number of bathrooms.";
    }
    if (
      index === 2 &&
      photos.length === 0 &&
      !existingMedia.some((item) => item.type === "IMAGE")
    )
      next.photos = "Upload at least one property photo.";
    if (index === 3 && !isEditing && documents.ownership.length === 0)
      next.ownership = "Upload proof of ownership.";
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error("Please complete the highlighted fields.");
      return false;
    }
    return true;
  };
  const next = () => {
    if (validateStep(step)) {
      setStep((current) => Math.min(current + 1, 4));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const addMedia = (kind: "photos" | "videos", incoming: File[]) => {
    const image = kind === "photos";
    const valid = incoming.filter((file) =>
      image
        ? ["image/jpeg", "image/png"].includes(file.type) &&
          file.size <= 3 * 1024 * 1024
        : file.type === "video/mp4" && file.size <= 10 * 1024 * 1024,
    );
    if (valid.length !== incoming.length)
      toast.error(
        image
          ? "Photos must be JPG/PNG and 3 MB or less."
          : "Videos must be MP4 and 10 MB or less.",
      );
    if (image) {
      const savedPhotoCount = existingMedia.filter(
        (item) => item.type === "IMAGE",
      ).length;
      const availableSlots = Math.max(
        0,
        MAX_PROPERTY_PHOTOS - savedPhotoCount - photos.length,
      );
      const accepted = valid.slice(0, availableSlots);

      if (accepted.length < valid.length) {
        toast.info(
          `A property can have a maximum of ${MAX_PROPERTY_PHOTOS} photos.`,
        );
      }
      setPhotos((current) => [
        ...current,
        ...accepted.slice(
          0,
          Math.max(0, MAX_PROPERTY_PHOTOS - savedPhotoCount - current.length),
        ),
      ]);
    } else {
      setVideos((current) => [...current, ...valid].slice(0, 5));
    }
  };
  const deleteExistingMedia = async (media: PropertyMediaResponse) => {
    if (!initialPropertyId || deletingMediaIds.has(media.id)) return;
    const label = media.type === "VIDEO" ? "video" : "image";
    if (!window.confirm(`Delete this property ${label}?`)) return;

    setDeletingMediaIds((current) => new Set(current).add(media.id));
    try {
      await propertyService.bulkDeleteMedia(initialPropertyId, [media.id]);
      setExistingMedia((current) =>
        current.filter((item) => item.id !== media.id),
      );
      if (accountKey) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: vendorPropertiesQueryKey(accountKey),
          }),
          queryClient.invalidateQueries({
            queryKey: vendorDashboardQueryKey(accountKey),
          }),
        ]);
      }
      toast.success(`Property ${label} deleted.`);
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          `The property ${label} could not be deleted.`,
        ),
      );
    } finally {
      setDeletingMediaIds((current) => {
        const next = new Set(current);
        next.delete(media.id);
        return next;
      });
    }
  };
  const reorderPhotos = (fromIndex: number, toIndex: number) => {
    setPhotos((current) => moveItem(current, fromIndex, toIndex));
  };
  const renamePhoto = (index: number, name: string) => {
    setPhotos((current) =>
      current.map((file, currentIndex) =>
        currentIndex === index
          ? new File([file], propertyImageUploadName(file, name), {
              type: file.type,
              lastModified: file.lastModified,
            })
          : file,
      ),
    );
  };
  const renameExistingImage = async (mediaId: string, name: string) => {
    if (!initialPropertyId || renamingMediaIds.has(mediaId)) return;

    setRenamingMediaIds((current) => new Set(current).add(mediaId));
    try {
      await propertyService.renameMedia(mediaId, name);
      setExistingMedia((current) =>
        current.map((item) => (item.id === mediaId ? { ...item, name } : item)),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["properties", "available"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["vendor", "property-preview", initialPropertyId],
        }),
        ...(accountKey
          ? [
              queryClient.invalidateQueries({
                queryKey: vendorPropertiesQueryKey(accountKey),
              }),
              queryClient.invalidateQueries({
                queryKey: vendorDashboardQueryKey(accountKey),
              }),
            ]
          : []),
      ]);
      toast.success("Image name and category updated.");
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "The image name could not be updated."),
      );
      throw error;
    } finally {
      setRenamingMediaIds((current) => {
        const next = new Set(current);
        next.delete(mediaId);
        return next;
      });
    }
  };
  const reorderExistingImages = async (fromIndex: number, toIndex: number) => {
    if (!initialPropertyId || settingPrimaryMediaId) return;

    const previousMedia = existingMedia;
    const images = existingMedia.filter((item) => item.type === "IMAGE");
    const otherMedia = existingMedia.filter((item) => item.type !== "IMAGE");
    const reorderedImages = moveItem(images, fromIndex, toIndex);
    const previousCoverId = images[0]?.id;
    const nextCover = reorderedImages[0];

    setExistingMedia([...reorderedImages, ...otherMedia]);
    if (!nextCover || nextCover.id === previousCoverId) return;

    setSettingPrimaryMediaId(nextCover.id);
    try {
      await propertyService.setPrimaryMedia(nextCover.id);
      setExistingMedia((current) =>
        current.map((item) => ({
          ...item,
          isPrimary: item.id === nextCover.id,
        })),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["properties", "available"],
        }),
        ...(accountKey
          ? [
              queryClient.invalidateQueries({
                queryKey: vendorPropertiesQueryKey(accountKey),
              }),
              queryClient.invalidateQueries({
                queryKey: vendorDashboardQueryKey(accountKey),
              }),
            ]
          : []),
      ]);
      toast.success("The property cover photo was updated.");
    } catch (error) {
      setExistingMedia(previousMedia);
      toast.error(
        getApiErrorMessage(error, "The cover photo could not be updated."),
      );
    } finally {
      setSettingPrimaryMediaId(null);
    }
  };
  const addDocuments = (kind: keyof LegalFiles, incoming: File[]) => {
    const valid = incoming.filter(
      (file) =>
        ["application/pdf", "image/jpeg", "image/png"].includes(file.type) &&
        file.size <= 10 * 1024 * 1024,
    );
    if (valid.length !== incoming.length)
      toast.error("Documents must be PDF, JPG, or PNG and 10 MB or less.");
    setDocuments((current) => ({
      ...current,
      [kind]: [...current[kind], ...valid],
    }));
    setErrors((current) => ({ ...current, [kind]: "" }));
  };
  const saveDraft = async () => {
    const draft = savePropertyDraft(values, step, draftId);
    setDraftId(draft.id);
    await saveDraftMedia(draft.id, { photos, videos, documents });
    router.replace(`/vendor/properties/new?draft=${draft.id}`, {
      scroll: false,
    });
    toast.success(
      "Draft saved for one hour. Editing it resets the expiry time.",
    );
  };
  const submit = async () => {
    if (!validateStep(3)) {
      setStep(3);
      return;
    }
    if (!terms) {
      setErrors((current) => ({ ...current, terms: "Required" }));
      toast.error("Accept the listing declaration before submitting.");
      return;
    }
    // The property endpoint accepts one multipart request containing fields,
    // property media, and legal documents.
    const form = new FormData();
    const propertyFields = {
      name: values.name.trim(),
      description: values.description.trim(),
      type: values.type,
      listingType: values.listingType,
      // `status` is the property's availability state. The backend separately
      // resets the admin-controlled `listingStatus` to PENDING on resubmission.
      status: values.status,
      address: values.address.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
      country: values.country.trim(),
      zipCode: values.zipCode.trim(),
      size: values.size,
      bedrooms: values.bedrooms || "0",
      bathrooms: values.bathrooms || "0",
      [PRICE_FIELDS[values.listingType]]: values.price,
      amenities: JSON.stringify(values.amenities),
      ...(values.listingType === "FOR_SHORTLET"
        ? {
            checkInTime: values.shortletCheckInTime,
            checkOutTime: values.shortletCheckOutTime,
            houseRules: JSON.stringify(
              values.houseRules
                .split(/\r?\n/)
                .map((rule) => rule.trim())
                .filter(Boolean),
            ),
            cancellationPolicy: values.cancellationPolicy.trim(),
            paymentPolicy: values.paymentPolicy.trim(),
          }
        : {}),
    };
    Object.entries(propertyFields).forEach(([key, value]) =>
      form.append(key, value),
    );

    if (isEditing) {
      // Keep edit media in the PATCH request instead of calling the backend's
      // bulk media endpoint, which currently fails when resolving uploaded IDs.
      photos.forEach((file) => form.append("photos", file));
      videos.forEach((file) => form.append("videos", file));
    } else {
      photos.forEach((file) => form.append("photos", file));
      videos.forEach((file) => form.append("videos", file));
      Object.values(documents)
        .flat()
        .forEach((file) => form.append("documents", file));
    }
    setSubmitting(true);
    try {
      const property = initialPropertyId
        ? await propertyService.update(initialPropertyId, form)
        : await propertyService.create(form);

      if (draftId) await deletePropertyDraft<AddPropertyFormValues>(draftId);
      // Refresh the public catalogue as well as vendor-owned views. An approved
      // edit can become public immediately, and must not remain hidden behind
      // a catalogue response cached before the save completed.
      const invalidations = [
        queryClient.invalidateQueries({
          queryKey: ["properties", "available"],
        }),
        queryClient.invalidateQueries({ queryKey: creditPaymentKeys.info }),
        queryClient.invalidateQueries({ queryKey: ["admin", "properties"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      ];
      if (initialPropertyId) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ["admin", "property", initialPropertyId],
          }),
        );
      }
      if (accountKey) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: vendorPropertiesQueryKey(accountKey),
          }),
          queryClient.invalidateQueries({
            queryKey: vendorDashboardQueryKey(accountKey),
          }),
        );
      }
      await Promise.all(invalidations);
      setSubmitConfirmationOpen(false);
      setCreatedId(property.id);
      toast.success("Property saved successfully.");
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          "The property could not be saved. Please review the form and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const requestSubmission = () => {
    if (!validateStep(3)) {
      setStep(3);
      return;
    }
    if (!terms) {
      setErrors((current) => ({ ...current, terms: "Required" }));
      toast.error("Accept the listing declaration before submitting.");
      return;
    }
    if (isEditing) {
      void submit();
      return;
    }
    setSubmitConfirmationOpen(true);
  };

  if (createdId)
    return (
      <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <span className="flex size-28 items-center justify-center rounded-full border-8 border-success text-success">
          <Check className="size-14" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {isEditing
              ? "Property Updated Successfully"
              : "Property Listed Successfully"}
          </h1>
          <p className="max-w-xl text-muted-foreground">
            {isEditing
              ? "Your changes and newly uploaded media were saved successfully. The admin will review your update status and verify your property."
              : "Your property was saved and submitted for review. Our team will verify the listing before it appears publicly."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/vendor/dashboard">Go Home</Link>
          </Button>
          <Button asChild>
            <Link href="/vendor/dashboard#properties">View My Properties</Link>
          </Button>
        </div>
      </section>
    );

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="mx-auto flex w-full max-w-[1220px] flex-col gap-8 pb-10"
    >
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {isEditing ? "Edit Property" : "Add New Property"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? "Update the listing information and upload additional media."
              : "Create a complete listing for marketplace review."}
          </p>
        </div>
        <Badge variant="outline">Step {step + 1} of 5</Badge>
      </header>
      <PropertyStepper current={step} />
      {step === 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Basic Information</CardTitle>
              <CardDescription>
                Start with the information buyers use to identify and find your
                property.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(errors.name)}>
                  <FieldLabel htmlFor="property-name">
                    Property Title
                  </FieldLabel>
                  <Input
                    id="property-name"
                    value={values.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="e.g. Modern minimalist villa in Lekki"
                    aria-invalid={Boolean(errors.name)}
                  />
                  <FieldError>{errors.name}</FieldError>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <FieldLabel>Property Type</FieldLabel>
                    <Select
                      value={values.type}
                      onValueChange={(value) => update("type", value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {[
                            "RESIDENTIAL",
                            "COMMERCIAL",
                            "INDUSTRIAL",
                            "LAND",
                            "MIXED_USE",
                          ].map((item) => (
                            <SelectItem key={item} value={item}>
                              {readablePropertyValue(item)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Listing Type</FieldLabel>
                    <Select
                      value={values.listingType}
                      onValueChange={(value) => update("listingType", value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {[
                            "FOR_SALE",
                            "FOR_RENT",
                            "FOR_LAND",
                            "FOR_SHORTLET",
                          ].map((item) => (
                            <SelectItem key={item} value={item}>
                              {readablePropertyValue(item)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Property Status</FieldLabel>
                    <Select
                      value={values.status}
                      onValueChange={(value) => update("status", value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {[
                            ["AVAILABLE", "Available / Active"],
                            ["OCCUPIED", "Occupied"],
                            ["UNDER_MAINTENANCE", "Under Maintenance"],
                            ["UNDER_CONSTRUCTION", "Under Construction"],
                            ["SOLD", "Sold"],
                            ["RENTED", "Rented"],
                          ].map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Controls the property&apos;s current availability.
                    </FieldDescription>
                  </Field>
                </div>
                <Field data-invalid={Boolean(errors.price)}>
                  <FieldLabel htmlFor="property-price">
                    {PRICE_LABELS[values.listingType]}
                  </FieldLabel>
                  <Input
                    id="property-price"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={values.price}
                    onChange={(e) => update("price", e.target.value)}
                    placeholder="₦ 0.00"
                    aria-invalid={Boolean(errors.price)}
                  />
                  <FieldError>{errors.price}</FieldError>
                </Field>
                <GoogleAddressAutocomplete onSelect={applyGoogleAddress} />
                <Field data-invalid={Boolean(errors.address)}>
                  <FieldLabel htmlFor="property-address">
                    Full Address or Manual Address
                  </FieldLabel>
                  <Textarea
                    id="property-address"
                    value={values.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="Enter or adjust the complete property address"
                    aria-invalid={Boolean(errors.address)}
                  />
                  <FieldError>{errors.address}</FieldError>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={Boolean(errors.city)}>
                    <FieldLabel htmlFor="property-city">City</FieldLabel>
                    <Input
                      id="property-city"
                      value={values.city}
                      onChange={(e) => update("city", e.target.value)}
                      aria-invalid={Boolean(errors.city)}
                    />
                    <FieldError>{errors.city}</FieldError>
                  </Field>
                  <Field data-invalid={Boolean(errors.state)}>
                    <FieldLabel htmlFor="property-state">State</FieldLabel>
                    <Input
                      id="property-state"
                      value={values.state}
                      onChange={(e) => update("state", e.target.value)}
                      aria-invalid={Boolean(errors.state)}
                    />
                    <FieldError>{errors.state}</FieldError>
                  </Field>
                  <Field data-invalid={Boolean(errors.country)}>
                    <FieldLabel htmlFor="property-country">Country</FieldLabel>
                    <Input
                      id="property-country"
                      value={values.country}
                      onChange={(e) => update("country", e.target.value)}
                      aria-invalid={Boolean(errors.country)}
                    />
                    <FieldError>{errors.country}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="property-zip">Postal code</FieldLabel>
                    <Input
                      id="property-zip"
                      value={values.zipCode}
                      onChange={(e) => update("zipCode", e.target.value)}
                    />
                  </Field>
                </div>
                <Field data-invalid={Boolean(errors.description)}>
                  <FieldLabel htmlFor="property-description">
                    Brief Description
                  </FieldLabel>
                  <PropertyDescriptionEditor
                    id="property-description"
                    maxLength={PROPERTY_DESCRIPTION_MAX_LENGTH}
                    value={values.description}
                    onChange={(description) =>
                      update("description", description)
                    }
                    placeholder="Highlight the key features and selling points of the property"
                    invalid={Boolean(errors.description)}
                  />
                  <FieldDescription className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Use Enter for a new line. Select text to apply bold,
                      italic, or bullet points.
                    </span>
                    <span className="shrink-0">
                      {values.description.length.toLocaleString()} /{" "}
                      {PROPERTY_DESCRIPTION_MAX_LENGTH.toLocaleString()}{" "}
                      characters
                    </span>
                  </FieldDescription>
                  <FieldError>{errors.description}</FieldError>
                </Field>
                {values.listingType === "FOR_SHORTLET" && (
                  <Card className="sm:col-span-2">
                    <CardHeader>
                      <CardTitle>Shortlet availability and policies</CardTitle>
                      <CardDescription>
                        These details will be shown to guests before they book.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup className="grid gap-5 sm:grid-cols-2">
                        <Field
                          data-invalid={Boolean(errors.shortletCheckInTime)}
                        >
                          <FieldLabel htmlFor="shortlet-check-in-time">
                            Check-in time
                          </FieldLabel>
                          <Input
                            id="shortlet-check-in-time"
                            type="time"
                            value={values.shortletCheckInTime}
                            onChange={(event) =>
                              update("shortletCheckInTime", event.target.value)
                            }
                            aria-invalid={Boolean(errors.shortletCheckInTime)}
                          />
                          <FieldDescription>
                            The earliest time guests may arrive.
                          </FieldDescription>
                          <FieldError>{errors.shortletCheckInTime}</FieldError>
                        </Field>
                        <Field
                          data-invalid={Boolean(errors.shortletCheckOutTime)}
                        >
                          <FieldLabel htmlFor="shortlet-check-out-time">
                            Check-out time
                          </FieldLabel>
                          <Input
                            id="shortlet-check-out-time"
                            type="time"
                            value={values.shortletCheckOutTime}
                            onChange={(event) =>
                              update("shortletCheckOutTime", event.target.value)
                            }
                            aria-invalid={Boolean(errors.shortletCheckOutTime)}
                          />
                          <FieldDescription>
                            The time departing guests must leave.
                          </FieldDescription>
                          <FieldError>{errors.shortletCheckOutTime}</FieldError>
                        </Field>
                        <Field className="sm:col-span-2">
                          <FieldLabel htmlFor="shortlet-house-rules">
                            House rules
                          </FieldLabel>
                          <Textarea
                            id="shortlet-house-rules"
                            className="min-h-28"
                            value={values.houseRules}
                            onChange={(event) =>
                              update("houseRules", event.target.value)
                            }
                            placeholder={
                              "No smoking\nNo parties or events\nQuiet hours after 10 PM"
                            }
                          />
                          <FieldDescription>
                            Enter one rule per line.
                          </FieldDescription>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="shortlet-cancellation-policy">
                            Cancellation policy
                          </FieldLabel>
                          <Textarea
                            id="shortlet-cancellation-policy"
                            className="min-h-28"
                            value={values.cancellationPolicy}
                            onChange={(event) =>
                              update("cancellationPolicy", event.target.value)
                            }
                            placeholder="Explain refund deadlines and cancellation charges."
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="shortlet-payment-policy">
                            Payment policy
                          </FieldLabel>
                          <Textarea
                            id="shortlet-payment-policy"
                            className="min-h-28"
                            value={values.paymentPolicy}
                            onChange={(event) =>
                              update("paymentPolicy", event.target.value)
                            }
                            placeholder="Explain deposits, payment deadlines, and accepted terms."
                          />
                        </Field>
                      </FieldGroup>
                    </CardContent>
                  </Card>
                )}
              </FieldGroup>
            </CardContent>
          </Card>
          <aside className="flex flex-col gap-6">
            <PropertyTipCard>
              Select the closest Google address, then correct the address fields
              if necessary. PropertyArk uses the saved address to find the
              nearest Google Street View. Imagery depends on Google&apos;s
              coverage, so some streets may only show the regular map.
            </PropertyTipCard>
            <Card>
              <CardHeader>
                <CardTitle>Location Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {values.address.trim() ? (
                  <div className="min-h-48 overflow-hidden rounded-xl border bg-muted">
                    <iframe
                      title="Property address preview"
                      src={`https://www.google.com/maps?q=${encodeURIComponent(
                        [
                          values.address,
                          values.city,
                          values.state,
                          values.country,
                        ]
                          .filter(Boolean)
                          .join(", "),
                      )}&output=embed`}
                      className="h-48 w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                ) : (
                  <div className="flex min-h-48 items-center justify-center rounded-xl bg-muted text-primary">
                    <MapPin className="size-10" />
                  </div>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  {values.address ||
                    "The property location will appear here as the address is entered."}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Confirm that the preview shows the correct neighbourhood
                  before submitting the listing.
                </p>
              </CardContent>
            </Card>
            {values.listingType === "FOR_SHORTLET" && (
              <Card>
                <CardHeader>
                  <CardTitle>Shortlet terms</CardTitle>
                  <CardDescription>
                    Guest-facing availability and booking policies.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Check-in and check-out
                    </p>
                    <p className="mt-1 font-semibold">
                      {values.shortletCheckInTime || "Not set"} to{" "}
                      {values.shortletCheckOutTime || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">House rules</p>
                    <p className="mt-1 whitespace-pre-line">
                      {values.houseRules || "No house rules supplied."}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Cancellation policy
                    </p>
                    <p className="mt-1 whitespace-pre-line">
                      {values.cancellationPolicy || "Not supplied."}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Payment policy
                    </p>
                    <p className="mt-1 whitespace-pre-line">
                      {values.paymentPolicy || "Not supplied."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Property Details</CardTitle>
              <CardDescription>
                Specify the core physical characteristics and amenities.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={Boolean(errors.bedrooms)}>
                    <FieldLabel htmlFor="bedrooms">Bedrooms</FieldLabel>
                    <Input
                      id="bedrooms"
                      type="number"
                      min="0"
                      value={values.bedrooms}
                      onChange={(e) => update("bedrooms", e.target.value)}
                      placeholder="e.g. 4"
                      aria-invalid={Boolean(errors.bedrooms)}
                    />
                    <FieldError>{errors.bedrooms}</FieldError>
                  </Field>
                  <Field data-invalid={Boolean(errors.bathrooms)}>
                    <FieldLabel htmlFor="bathrooms">Bathrooms</FieldLabel>
                    <Input
                      id="bathrooms"
                      type="number"
                      min="0"
                      step="0.5"
                      value={values.bathrooms}
                      onChange={(e) => update("bathrooms", e.target.value)}
                      placeholder="e.g. 2.5"
                      aria-invalid={Boolean(errors.bathrooms)}
                    />
                    <FieldError>{errors.bathrooms}</FieldError>
                  </Field>
                  <Field data-invalid={Boolean(errors.size)}>
                    <FieldLabel htmlFor="size">Property Size</FieldLabel>
                    <Input
                      id="size"
                      type="number"
                      min="0"
                      value={values.size}
                      onChange={(e) => update("size", e.target.value)}
                      placeholder="e.g. 2400"
                      aria-invalid={Boolean(errors.size)}
                    />
                    <FieldError>{errors.size}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel>Unit</FieldLabel>
                    <Select
                      value={values.sizeUnit}
                      onValueChange={(value) => update("sizeUnit", value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="sqm">Square metres</SelectItem>
                          <SelectItem value="sqft">Square feet</SelectItem>
                          <SelectItem value="acres">Acres</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="property-amenities">
                    Property Amenities
                  </FieldLabel>
                  <Input
                    id="property-amenities"
                    value={amenityInput}
                    onChange={(event) => handleAmenityInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitAmenityInput();
                      }
                    }}
                    onBlur={commitAmenityInput}
                    placeholder="e.g. Parking, Pool, Gym"
                    autoComplete="off"
                  />
                  <FieldDescription>
                    Separate each amenity with a comma. Press Enter to add the
                    final entry.
                  </FieldDescription>
                  {values.amenities.length > 0 && (
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label="Added property amenities"
                    >
                      {values.amenities.map((item) => {
                        const AmenityIcon = getAmenityIcon(item);
                        return (
                          <Badge
                            key={item}
                            variant="outline"
                            className="gap-2 px-3 py-1.5 text-sm"
                          >
                            <AmenityIcon
                              className="size-4 text-primary"
                              aria-hidden="true"
                            />
                            <span>{item}</span>
                            <button
                              type="button"
                              className="rounded-full text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Remove ${item}`}
                              onClick={() =>
                                update(
                                  "amenities",
                                  values.amenities.filter(
                                    (entry) => entry !== item,
                                  ),
                                )
                              }
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
          <PropertyTipCard>
            Accurate measurements and amenities help buyers compare listings and
            reduce unnecessary questions.
          </PropertyTipCard>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex flex-col gap-6">
            <PropertyUploadBox
              title="Upload Property Images"
              description={`Upload up to ${MAX_PROPERTY_PHOTOS} high-resolution JPG or PNG photos, with a maximum of 3 MB each. The first photo becomes the cover.`}
              accept="image/jpeg,image/png"
              icon={ImagePlus}
              onFiles={(files) => addMedia("photos", files)}
            />
            {errors.photos && (
              <p className="text-sm text-destructive">{errors.photos}</p>
            )}
            <PropertyUploadBox
              title="Upload Property Video"
              description="Optional MP4 walkthrough videos, up to 10 MB each."
              accept="video/mp4"
              icon={Video}
              onFiles={(files) => addMedia("videos", files)}
            />
            <PropertyTipCard title="Tips for better listings">
              <div className="flex flex-col gap-3">
                <p>
                  Bright, wide-angle photos usually attract more inquiries. Use
                  a clear exterior or living-room image as your cover.
                </p>
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-foreground">
                    How to categorize your images
                  </p>
                  <ol className="flex list-decimal flex-col gap-1 pl-5">
                    <li>Upload your property images.</li>
                    <li>
                      Click the pencil icon on an image and select its section,
                      such as Bedroom, Kitchen, or Exterior.
                    </li>
                    <li>
                      Keep the suggested name or enter a clear name such as
                      “Bedroom 1”. The gallery will group it automatically.
                    </li>
                  </ol>
                </div>
              </div>
            </PropertyTipCard>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Uploaded Media</CardTitle>
              <CardAction>
                <Badge variant="outline">
                  {existingMedia.filter((item) => item.type === "IMAGE")
                    .length + photos.length}{" "}
                  / {MAX_PROPERTY_PHOTOS} photos
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {existingMedia.some((item) => item.type === "IMAGE") && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    Drag a saved photo into the first position, or use the arrow
                    controls, to make it the property cover. Use the pencil to
                    name and categorize each image.
                  </p>
                  <ReorderablePropertyPhotoGrid
                    photos={existingMedia
                      .filter((item) => item.type === "IMAGE")
                      .map((item, index): ReorderablePropertyPhoto => ({
                        id: item.id,
                        src: item.url,
                        name: item.name,
                        alt:
                          item.name || `Existing property photo ${index + 1}`,
                        isBusy:
                          deletingMediaIds.has(item.id) ||
                          renamingMediaIds.has(item.id) ||
                          settingPrimaryMediaId !== null,
                      }))}
                    coverLabel="Current cover"
                    onReorder={(fromIndex, toIndex) =>
                      void reorderExistingImages(fromIndex, toIndex)
                    }
                    onRemove={(photo) => {
                      const media = existingMedia.find(
                        (item) => item.id === photo.id,
                      );
                      if (media) void deleteExistingMedia(media);
                    }}
                    onRename={(photo, _index, name) =>
                      renameExistingImage(photo.id, name)
                    }
                  />
                </div>
              )}
              {photoUrls.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    Drag photos or use the arrow controls to arrange their
                    upload order. Use the pencil to name and categorize each
                    image before uploading.
                  </p>
                  <ReorderablePropertyPhotoGrid
                    photos={photoUrls.map(
                      ({ file, url }): ReorderablePropertyPhoto => ({
                        id: url,
                        src: url,
                        name: file.name,
                        alt: file.name,
                        unoptimized: true,
                      }),
                    )}
                    coverLabel={
                      existingMedia.some((item) => item.type === "IMAGE")
                        ? undefined
                        : "Cover photo"
                    }
                    onReorder={reorderPhotos}
                    onRemove={(_, index) =>
                      setPhotos((current) =>
                        current.filter((_, photoIndex) => photoIndex !== index),
                      )
                    }
                    onRename={(_photo, index, name) => renamePhoto(index, name)}
                  />
                </div>
              ) : existingMedia.some((item) => item.type === "IMAGE") ? null : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Uploaded photos will appear here.
                </p>
              )}
              {videos.length > 0 && (
                <>
                  <Separator />
                  <PropertyFileList
                    files={videos}
                    onRemove={(index) =>
                      setVideos((current) =>
                        current.filter(
                          (_, currentIndex) => currentIndex !== index,
                        ),
                      )
                    }
                  />
                </>
              )}
              {existingMedia.some((item) => item.type === "VIDEO") && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Saved videos
                    </p>
                    {existingMedia
                      .filter((item) => item.type === "VIDEO")
                      .map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Video className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            Property video {index + 1}
                          </span>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="destructive"
                            disabled={deletingMediaIds.has(item.id)}
                            aria-label={`Delete property video ${index + 1}`}
                            onClick={() => void deleteExistingMedia(item)}
                          >
                            {deletingMediaIds.has(item.id) ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <Trash2 />
                            )}
                          </Button>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {step === 3 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {isEditing ? (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Legal Documents</CardTitle>
                <CardDescription>
                  Your previously submitted ownership and verification documents
                  remain attached to this property.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PropertyTipCard title="Documents retained">
                  Contact support if a legal document must be replaced after a
                  listing has been submitted.
                </PropertyTipCard>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-col gap-6">
                {(
                  [
                    {
                      key: "ownership",
                      title: "Proof of Ownership",
                      copy: "Grant deed, warranty deed, or valid title record.",
                      icon: FileCheck2,
                    },
                    {
                      key: "identification",
                      title: "Identification",
                      copy: "Government-issued ID or passport for the primary owner.",
                      icon: ShieldCheck,
                    },
                    {
                      key: "tax",
                      title: "Tax Records",
                      copy: "Most recent property tax assessment or certificate.",
                      icon: FileText,
                    },
                  ] as const
                ).map(({ key, title, copy, icon }) => (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle>{title}</CardTitle>
                      <CardDescription>{copy}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <PropertyUploadBox
                        title={`Upload ${title}`}
                        description="PDF, JPG, or PNG, up to 10 MB per file."
                        accept="application/pdf,image/jpeg,image/png"
                        icon={icon}
                        onFiles={(files) => addDocuments(key, files)}
                      />
                      {errors[key] && (
                        <p className="text-sm text-destructive">
                          {errors[key]}
                        </p>
                      )}
                      <PropertyFileList
                        files={documents[key]}
                        onRemove={(index) =>
                          setDocuments((current) => ({
                            ...current,
                            [key]: current[key].filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          }))
                        }
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <aside className="flex flex-col gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Uploaded Files</CardTitle>
                    <CardDescription>
                      {Object.values(documents).flat().length} document(s) ready
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PropertyFileList
                      files={Object.values(documents).flat()}
                      onRemove={() => {}}
                    />
                  </CardContent>
                </Card>
                <PropertyTipCard title="Secure upload">
                  Documents are sent through the authenticated endpoint and are
                  only listed as complete after the server accepts the property.
                </PropertyTipCard>
              </aside>
            </>
          )}
        </div>
      )}
      {step === 4 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="size-5 text-primary" />
                  Property Essentials
                </CardTitle>
                <CardDescription>
                  Review the information that will be stored with this listing.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Listing title
                  </p>
                  <p className="mt-1 text-lg font-semibold">{values.name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Property type
                  </p>
                  <p className="mt-1">{readablePropertyValue(values.type)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Listing type
                  </p>
                  <p className="mt-1">
                    {readablePropertyValue(values.listingType)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Property status
                  </p>
                  <p className="mt-1">
                    {values.status === "AVAILABLE"
                      ? "Available / Active"
                      : readablePropertyValue(values.status)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Description
                  </p>
                  <PropertyDescriptionContent
                    description={values.description}
                    className="mt-1 text-foreground"
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Pricing & Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="mt-1 font-semibold text-primary">
                    {formatPropertyMoney(values.price)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Size</p>
                  <p className="mt-1 font-semibold">
                    {values.size} {values.sizeUnit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rooms</p>
                  <p className="mt-1 font-semibold">
                    {values.bedrooms || 0} bed · {values.bathrooms || 0} bath
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Files</CardTitle>
                <CardDescription>
                  {photos.length} photo(s), {videos.length} video(s), and{" "}
                  {Object.values(documents).flat().length} document(s).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PropertyFileList
                  files={[
                    ...photos,
                    ...videos,
                    ...Object.values(documents).flat(),
                  ]}
                />
              </CardContent>
            </Card>
          </div>
          <aside className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Marketplace Preview</CardTitle>
              </CardHeader>
              {photoUrls[0] && (
                <div className="relative aspect-video">
                  <Image
                    src={photoUrls[0].url}
                    alt="Property cover preview"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              )}
              <CardContent className="flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{values.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <MapPin className="mr-1 inline size-4" />
                    {values.city}, {values.state}, {values.country}
                  </p>
                </div>
                <p className="text-xl font-semibold text-primary">
                  {formatPropertyMoney(values.price)}
                </p>
                <Separator />
                <p className="flex items-center gap-2 text-sm">
                  <BedDouble className="size-4" />
                  {values.bedrooms || 0} bedrooms · {values.bathrooms || 0}{" "}
                  bathrooms · {values.size} {values.sizeUnit}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-primary/5">
              <CardHeader>
                <CardTitle>Listing Declaration</CardTitle>
              </CardHeader>
              <CardContent>
                <Field
                  orientation="horizontal"
                  data-invalid={!terms && Boolean(errors.terms)}
                >
                  <Checkbox
                    id="listing-terms"
                    checked={terms}
                    aria-invalid={!terms && Boolean(errors.terms)}
                    onCheckedChange={(checked) => {
                      setTerms(Boolean(checked));
                      setErrors((current) => ({ ...current, terms: "" }));
                    }}
                  />
                  <FieldLabel htmlFor="listing-terms" className="font-normal">
                    I confirm this information is accurate and I have the legal
                    right to list this property.
                  </FieldLabel>
                </Field>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
      <Separator />
      <footer className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <Button variant="ghost" asChild>
          <Link href="/vendor/dashboard">Cancel</Link>
        </Button>
        <div className="flex flex-1 justify-end gap-3">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((current) => current - 1)}
            >
              <ArrowLeft data-icon="inline-start" />
              Previous
            </Button>
          )}
          {!isEditing && (
            <Button type="button" variant="outline" onClick={saveDraft}>
              Save Draft
            </Button>
          )}
          {step < 4 ? (
            <Button type="button" onClick={next}>
              Next Step
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={submitting}
              onClick={requestSubmission}
            >
              {submitting ? (
                <>
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                  Saving property...
                </>
              ) : (
                <>
                  {isEditing ? "Save Changes" : "Submit Property"}
                  <ArrowRight data-icon="inline-end" />
                </>
              )}
            </Button>
          )}
        </div>
      </footer>
      <Dialog
        open={submitConfirmationOpen}
        onOpenChange={(open) => {
          if (!submitting) setSubmitConfirmationOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this property?</DialogTitle>
            <DialogDescription>
              {propertyCreationCost === null
                ? "Confirm the Credit Points charge before this property is sent for review."
                : `By submitting this property, you will be charged ${propertyCreationCost.toLocaleString("en-NG")} Credit Points. It will then be sent to the administrator for review.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 rounded-xl bg-muted p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Listing fee</span>
              <span className="font-semibold">
                {creditDetailsLoading
                  ? "Loading..."
                  : propertyCreationCost === null
                    ? "Unavailable"
                    : `${propertyCreationCost.toLocaleString("en-NG")} points`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Available balance</span>
              <span className="font-semibold">
                {creditInfo.isLoading
                  ? "Loading..."
                  : availablePoints === null
                    ? "Unavailable"
                    : `${availablePoints.toLocaleString("en-NG")} points`}
              </span>
            </div>
            {balanceAfterSubmission !== null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">
                  Balance after submission
                </span>
                <span className="font-semibold">
                  {balanceAfterSubmission.toLocaleString("en-NG")} points
                </span>
              </div>
            )}
          </div>

          {(creditDetailsUnavailable || insufficientPoints) && (
            <p className="text-sm text-destructive">
              {creditDetailsUnavailable
                ? "The current listing fee or your balance could not be loaded. Please try again."
                : `You need ${pointsNeeded?.toLocaleString("en-NG")} more points to submit this property.`}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            {insufficientPoints ? (
              <Button asChild>
                <Link href="/vendor/subscription-rewards">
                  Get Credit Points
                </Link>
              </Button>
            ) : creditDetailsUnavailable ? (
              <Button
                type="button"
                onClick={() => {
                  void creditRules.refetch();
                  void creditInfo.refetch();
                }}
              >
                Try again
              </Button>
            ) : (
              <Button
                type="button"
                disabled={submitting || creditDetailsLoading}
                onClick={() => void submit()}
              >
                {submitting && <Spinner data-icon="inline-start" />}
                {submitting ? "Submitting property..." : "Confirm and submit"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

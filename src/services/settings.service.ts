import { normalizeAvatarMediaUrl } from "@/lib/property-media-security";
import { api } from "@/services/axios";

export interface VendorSettingsProfile {
  id: string | null;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  avatarUrl: string | null;
  businessName: string;
  businessDescription: string;
  cacRegistrationNumber: string;
  taxId: string;
  createdAt: string | null;
  identityVerificationStatus: string;
  businessLicenseStatus: string;
  taxCertificationStatus: string;
  twoFactorEnabled: boolean | null;
  emailAlerts: boolean | null;
  smsNotifications: boolean | null;
  pushNotifications: boolean | null;
}

export function vendorProfileQueryKey(accountKey: string) {
  return ["vendor", "settings", "profile", accountKey] as const;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeAvatarUrl(value: string | undefined): string | null {
  if (!value) return null;
  return normalizeAvatarMediaUrl(value);
}

function normalizeProfile(value: unknown): VendorSettingsProfile {
  const root = record(value);
  const data = record(root.data);
  const nested = record(data.user ?? data.profile);
  const source = Object.keys(nested).length
    ? nested
    : Object.keys(data).length
      ? data
      : root;
  const text = (...keys: string[]) =>
    keys.map((key) => source[key]).find((item) => typeof item === "string") as
      string | undefined;
  const boolean = (...keys: string[]) => {
    const candidate = keys
      .map((key) => source[key])
      .find((item) => typeof item === "boolean");
    return typeof candidate === "boolean" ? candidate : null;
  };
  return {
    id: text("id", "_id", "userId") ?? null,
    fullName: text("fullName", "name") ?? "",
    email: text("email") ?? "",
    phone: text("phone") ?? "",
    location: text("location", "address") ?? "",
    avatarUrl: normalizeAvatarUrl(
      text("avatarUrl", "avatar", "profilePicture"),
    ),
    businessName: text("businessName", "companyName", "agencyName") ?? "",
    businessDescription:
      text("businessDescription", "companyDescription", "bio", "about") ?? "",
    cacRegistrationNumber:
      text("cacRegistrationNumber", "cacNumber", "registrationNumber") ?? "",
    taxId: text("taxId", "tin", "taxIdentificationNumber") ?? "",
    createdAt: text("createdAt", "joinedAt") ?? null,
    identityVerificationStatus:
      text("ninStatus", "identityVerificationStatus", "verificationStatus") ??
      "PENDING",
    businessLicenseStatus:
      text("businessLicenseStatus", "licenseStatus") ?? "UNAVAILABLE",
    taxCertificationStatus:
      text("taxCertificationStatus", "taxStatus") ?? "UNAVAILABLE",
    twoFactorEnabled: boolean(
      "twoFactorEnabled",
      "isTwoFactorEnabled",
      "twoFAEnabled",
    ),
    emailAlerts: boolean("emailAlerts", "emailNotifications"),
    smsNotifications: boolean("smsNotifications", "smsAlerts"),
    pushNotifications: boolean("pushNotifications", "mobilePushNotifications"),
  };
}

export const settingsService = {
  getProfile: async () =>
    normalizeProfile((await api.get("/users/profile")).data),
  updateProfile: async (payload: {
    fullName: string;
    phone: string;
    location: string;
    businessName?: string;
    businessDescription?: string;
    cacRegistrationNumber?: string;
    taxId?: string;
    emailAlerts?: boolean;
    smsNotifications?: boolean;
    pushNotifications?: boolean;
  }) => normalizeProfile((await api.patch("/users/update", payload)).data),
  updateAvatar: async (avatar: File) => {
    const form = new FormData();
    form.append("avatar", avatar);
    const updated = normalizeProfile(
      (await api.patch("/users/avatar", form)).data,
    );

    // Some successful avatar responses only contain a status message. Fetch
    // the canonical profile in that case so a temporary blob URL is never
    // persisted as the user's avatar.
    if (updated.avatarUrl) return updated;
    return normalizeProfile((await api.get("/users/profile")).data);
  },
  changePassword: async (payload: {
    newPassword: string;
    confirmPassword?: string;
    confirmNewPassword?: string;
    currentPassword?: string;
  }) =>
    (
      await api.patch("/users/change-password", {
        newPassword: payload.newPassword,
        confirmPassword:
          payload.confirmPassword ?? payload.confirmNewPassword ?? "",
      })
    ).data,
};

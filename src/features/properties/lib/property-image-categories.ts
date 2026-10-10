export const PROPERTY_IMAGE_CATEGORIES = [
  "Interior",
  "Exterior",
  "Kitchen",
  "Bathroom",
  "Bedroom",
  "Living",
  "Dining",
  "Others",
] as const;

export type PropertyImageCategory = (typeof PROPERTY_IMAGE_CATEGORIES)[number];

const CATEGORY_KEYWORDS: ReadonlyArray<
  readonly [PropertyImageCategory, readonly string[]]
> = [
  ["Kitchen", ["kitchen"]],
  ["Bathroom", ["bathroom", "bath", "toilet", "washroom"]],
  ["Bedroom", ["bedroom", "bed room"]],
  ["Living", ["living", "lounge", "sitting room"]],
  ["Dining", ["dining"]],
  [
    "Exterior",
    [
      "exterior",
      "outside",
      "facade",
      "front view",
      "backyard",
      "garden",
      "compound",
    ],
  ],
  ["Interior", ["interior", "inside", "hallway", "staircase"]],
];

export function propertyImageCategoryFromName(
  name?: string | null,
): PropertyImageCategory {
  const normalized = (name ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .toLocaleLowerCase()
    .trim();

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return "Others";
}

export function propertyImageDisplayName(name?: string | null) {
  return (name ?? "").replace(/\.[a-z0-9]+$/i, "").trim();
}

export function propertyImageUploadName(file: File, displayName: string) {
  const extension = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
  const cleanName = propertyImageDisplayName(displayName) || "Property image";
  return `${cleanName}${extension}`;
}

export function nextPropertyImageName(
  category: PropertyImageCategory,
  names: readonly string[],
) {
  const count = names.filter(
    (name) => propertyImageCategoryFromName(name) === category,
  ).length;
  return `${category} ${count + 1}`;
}

"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  LoaderCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  nextPropertyImageName,
  PROPERTY_IMAGE_CATEGORIES,
  propertyImageCategoryFromName,
  propertyImageDisplayName,
  type PropertyImageCategory,
} from "@/features/properties/lib/property-image-categories";
import { cn } from "@/lib/utils";

const GLASS_OVERLAY_CLASS =
  "border-white/40 bg-background/70 text-foreground shadow-sm backdrop-blur-md hover:bg-background/85 hover:text-foreground";

export interface ReorderablePropertyPhoto {
  id: string;
  src: string;
  alt: string;
  name: string;
  unoptimized?: boolean;
  isBusy?: boolean;
}

interface ReorderablePropertyPhotoGridProps {
  photos: ReorderablePropertyPhoto[];
  coverLabel?: string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (photo: ReorderablePropertyPhoto, index: number) => void;
  onRename?: (
    photo: ReorderablePropertyPhoto,
    index: number,
    name: string,
  ) => void | Promise<void>;
}

export function ReorderablePropertyPhotoGrid({
  photos,
  coverLabel,
  onReorder,
  onRemove,
  onRename,
}: ReorderablePropertyPhotoGridProps) {
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] =
    useState<PropertyImageCategory>("Others");
  const [savingName, setSavingName] = useState(false);

  function dropAt(toIndex: number) {
    if (!draggedPhotoId) return;
    const fromIndex = photos.findIndex((photo) => photo.id === draggedPhotoId);
    setDraggedPhotoId(null);
    if (fromIndex < 0 || fromIndex === toIndex) return;
    onReorder(fromIndex, toIndex);
  }

  function openRename(photo: ReorderablePropertyPhoto) {
    setEditingPhotoId(photo.id);
    setDraftName(propertyImageDisplayName(photo.name));
    setDraftCategory(propertyImageCategoryFromName(photo.name));
  }

  function selectCategory(category: PropertyImageCategory) {
    setDraftCategory(category);
    setDraftName(
      nextPropertyImageName(
        category,
        photos
          .filter((photo) => photo.id !== editingPhotoId)
          .map((photo) => photo.name),
      ),
    );
  }

  async function saveName() {
    const photo = photos.find((item) => item.id === editingPhotoId);
    const index = photos.findIndex((item) => item.id === editingPhotoId);
    const name = draftName.trim();
    if (!photo || index < 0 || !name || !onRename) return;

    setSavingName(true);
    try {
      await onRename(photo, index, name);
      setEditingPhotoId(null);
    } catch {
      // The parent displays the API error and the dialog stays open for retry.
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {photos.map((photo, index) => (
        <figure
          key={photo.id}
          draggable={!photo.isBusy}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            setDraggedPhotoId(photo.id);
          }}
          onDragEnd={() => setDraggedPhotoId(null)}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            dropAt(index);
          }}
          className={cn(
            "group relative aspect-square cursor-grab overflow-hidden rounded-lg border bg-muted active:cursor-grabbing",
            index === 0 && "col-span-2 aspect-video ring-2 ring-primary",
            draggedPhotoId === photo.id && "opacity-50",
          )}
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes={index === 0 ? "800px" : "400px"}
            unoptimized={photo.unoptimized}
            className="object-cover"
          />

          <div className="absolute left-2 top-2 flex items-center gap-2">
            {index === 0 && coverLabel ? (
              <Badge>{coverLabel}</Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-white/40 bg-background/70 text-foreground shadow-sm backdrop-blur-md"
              >
                Photo {index + 1}
              </Badge>
            )}
            <span className="hidden size-7 items-center justify-center rounded-md border border-white/40 bg-background/70 text-foreground shadow-sm backdrop-blur-md sm:flex">
              <GripVertical className="size-4" aria-hidden="true" />
              <span className="sr-only">Drag to reorder</span>
            </span>
          </div>

          <Button
            type="button"
            size="icon-sm"
            variant="destructive"
            className="absolute right-2 top-2"
            disabled={photo.isBusy}
            aria-label={`Remove ${photo.alt}`}
            onClick={() => onRemove(photo, index)}
          >
            {photo.isBusy ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Trash2 />
            )}
          </Button>

          <div className="absolute bottom-2 right-2 flex gap-1">
            {onRename && (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className={GLASS_OVERLAY_CLASS}
                disabled={photo.isBusy}
                aria-label={`Categorize ${photo.alt}`}
                onClick={() => openRename(photo)}
              >
                <Pencil data-icon="inline-start" />
              </Button>
            )}
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className={GLASS_OVERLAY_CLASS}
              disabled={index === 0 || photo.isBusy}
              aria-label={`Move ${photo.alt} earlier`}
              onClick={() => onReorder(index, index - 1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className={GLASS_OVERLAY_CLASS}
              disabled={index === photos.length - 1 || photo.isBusy}
              aria-label={`Move ${photo.alt} later`}
              onClick={() => onReorder(index, index + 1)}
            >
              <ArrowDown />
            </Button>
          </div>

          <Badge
            className="absolute bottom-2 left-2 border-white/40 bg-background/70 text-foreground shadow-sm backdrop-blur-md"
            variant="outline"
          >
            {propertyImageCategoryFromName(photo.name)}
          </Badge>
        </figure>
      ))}

      <Dialog
        open={editingPhotoId !== null}
        onOpenChange={(open) => {
          if (!open && !savingName) setEditingPhotoId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorize property image</DialogTitle>
            <DialogDescription>
              Choose a section and give the image a clear name. The public
              gallery uses this name to group the image automatically.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Image section</FieldLabel>
              <Select
                value={draftCategory}
                onValueChange={(value) =>
                  selectCategory(value as PropertyImageCategory)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PROPERTY_IMAGE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="property-image-name">Image name</FieldLabel>
              <Input
                id="property-image-name"
                value={draftName}
                maxLength={80}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setDraftCategory(
                    propertyImageCategoryFromName(event.target.value),
                  );
                }}
                placeholder="e.g. Bedroom 1"
                autoFocus
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={savingName}
              onClick={() => setEditingPhotoId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!draftName.trim() || savingName}
              onClick={() => void saveName()}
            >
              {savingName && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                />
              )}
              Save image name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

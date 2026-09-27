"use client";

import Image from "next/image";
import { useState } from "react";
import type { Photo as PhotoEntry } from "@/config/imagery";
import { cx } from "./cx";

/**
 * A catalogue photo filling its (positioned) parent. Uses next/image for resized WebP/AVIF,
 * the catalogue focal point for cropping, and a short fade once decoded. With no photo it
 * renders the plain midnight surface, so layouts never depend on a cover being set.
 * Decorative by default (alt=""); pass `describe` where the photo carries meaning.
 */
export function Photo({
  photo,
  sizes,
  priority = false,
  describe = false,
  className,
}: {
  photo: PhotoEntry | null;
  sizes: string;
  priority?: boolean;
  describe?: boolean;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  if (!photo) return <div aria-hidden className={cx("absolute inset-0 bg-midnight", className)} />;
  return (
    <Image
      src={photo.src}
      alt={describe ? photo.alt : ""}
      fill
      sizes={sizes}
      priority={priority}
      onLoad={() => setLoaded(true)}
      data-loaded={loaded || priority}
      className={cx("photo-img object-cover", className)}
      style={{ objectPosition: photo.focal }}
    />
  );
}

/** Small square cover for list rows and pickers. Decorative: the row text names the event. */
export function CoverThumb({ photo, size = 40 }: { photo: PhotoEntry | null; size?: number }) {
  return (
    <span aria-hidden className="relative inline-block shrink-0 overflow-hidden rounded-control bg-midnight" style={{ width: size, height: size }}>
      <Photo photo={photo} sizes={`${size * 2}px`} />
    </span>
  );
}

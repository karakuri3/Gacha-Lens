"use client";

import Image from "next/image";
import { useState } from "react";
import { normalizeImageUrl, resolvePresentationImage } from "@/lib/domain/variant-image-presentation";

export default function ProductImage({
  item,
  src,
  fallbackSrc,
  imageScope,
  alt = "",
  sizes = "(max-width: 640px) 100vw, 33vw",
  priority = false,
  emptyLabel = "画像なし",
}) {
  const primarySrc = text(src ?? item?.display_image_url ?? item?.image_url ?? item?.imageUrl);
  const safeFallbackSrc = text(fallbackSrc ?? item?.series_image_url);
  const scope = imageScope ?? item?.image_scope ?? "missing";

  return (
    <ResolvedProductImage
      key={`${normalizeImageUrl(primarySrc)}\u001f${normalizeImageUrl(safeFallbackSrc)}\u001f${scope}`}
      primarySrc={primarySrc}
      fallbackSrc={safeFallbackSrc}
      imageScope={scope}
      alt={alt}
      sizes={sizes}
      priority={priority}
      emptyLabel={emptyLabel}
    />
  );
}

function ResolvedProductImage({ primarySrc, fallbackSrc, imageScope, alt, sizes, priority, emptyLabel }) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const presentation = resolvePresentationImage({
    primarySrc,
    fallbackSrc,
    imageScope,
    primaryFailed,
    fallbackFailed,
  });

  if (!presentation.src) {
    return (
      <span className="image-placeholder" role="img" aria-label={emptyLabel}>
        <span>画像なし</span>
      </span>
    );
  }

  return (
    <>
      <Image
        src={presentation.src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className="product-image__media"
        onError={() => {
          if (presentation.uses_fallback) {
            setFallbackFailed(true);
          } else {
            setPrimaryFailed(true);
          }
        }}
      />
      {presentation.is_series_fallback ? <span className="product-image__scope">シリーズ画像</span> : null}
    </>
  );
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

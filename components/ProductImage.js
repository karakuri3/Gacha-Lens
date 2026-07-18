import Image from "next/image";

export default function ProductImage({ src, alt = "", sizes = "(max-width: 640px) 100vw, 33vw", priority = false, emptyLabel = "画像準備中" }) {
  if (!src) return <span className="image-placeholder">{emptyLabel}</span>;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      className="product-image__media"
    />
  );
}

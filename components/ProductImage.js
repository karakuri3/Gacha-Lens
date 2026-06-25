import Image from "next/image";

export default function ProductImage({ src, alt = "", sizes = "(max-width: 640px) 100vw, 33vw" }) {
  if (!src) return <span className="image-placeholder">NO IMAGE</span>;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="product-image__media"
    />
  );
}

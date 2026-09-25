"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

const PRODUCT_LINK_SELECTOR = "a.product-card[href], .lineup-grid a[href], .detail-thumbnails a[href]";

export default function IntentPrefetchBoundary({ children, className = "" }) {
  const router = useRouter();
  const warmed = useRef(new Set());

  function warmTarget(event) {
    const origin = event.target instanceof Element ? event.target : null;
    const link = origin?.closest(PRODUCT_LINK_SELECTOR);
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (!href.startsWith("/series/") || warmed.current.has(href)) return;

    warmed.current.add(href);
    router.prefetch(href);
  }

  return (
    <div
      className={className}
      onPointerOver={warmTarget}
      onFocusCapture={warmTarget}
      onTouchStartCapture={warmTarget}
    >
      {children}
    </div>
  );
}

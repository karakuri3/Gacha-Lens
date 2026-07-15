"use client";

export default function TrackedMarketLink({ link, variantId, className = "market-action", children }) {
  function track() {
    const payload = JSON.stringify({ provider: link.id, variantId, pagePath: window.location.pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/outbound-clicks", new Blob([payload], { type: "application/json" }));
      return;
    }
    fetch("/api/outbound-clicks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }

  return (
    <a className={className} href={link.href} target="_blank" rel="noopener noreferrer" onClick={track}>
      {children}
    </a>
  );
}

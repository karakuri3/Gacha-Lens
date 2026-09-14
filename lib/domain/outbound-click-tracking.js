export const CANONICAL_OUTBOUND_CLICK_HOST = "gachalens.com";

export function shouldRecordOutboundClickRequest(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" && url.hostname.toLowerCase() === CANONICAL_OUTBOUND_CLICK_HOST;
  } catch {
    return false;
  }
}

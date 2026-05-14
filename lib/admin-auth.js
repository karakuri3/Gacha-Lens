import crypto from "node:crypto";

export const REVIEW_COOKIE_NAME = "gacha_review_admin";

export function getReviewAdminToken() {
  return process.env.REVIEW_ADMIN_TOKEN || process.env.ADMIN_REVIEW_TOKEN || "";
}

export function isReviewAuthConfigured() {
  return Boolean(getReviewAdminToken());
}

export function createReviewSessionValue() {
  const token = getReviewAdminToken();
  return token ? hashToken(token) : "";
}

export function verifyReviewToken(candidate) {
  const expected = getReviewAdminToken();
  if (!expected || !candidate) return false;
  return timingSafeEqual(hashToken(candidate), hashToken(expected));
}

export function verifyReviewSession(value) {
  const expected = createReviewSessionValue();
  if (!expected || !value) return false;
  return timingSafeEqual(value, expected);
}

export function getReviewTokenFromRequest(request) {
  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  return request.headers.get("x-review-admin-token") || bearerToken;
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

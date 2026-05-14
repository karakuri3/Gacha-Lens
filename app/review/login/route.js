import { NextResponse } from "next/server";
import { createReviewSessionValue, REVIEW_COOKIE_NAME, verifyReviewToken } from "@/lib/admin-auth";

export async function POST(request) {
  const formData = await request.formData();
  const token = String(formData.get("token") || "");
  const redirectUrl = new URL("/review", request.url);

  if (!verifyReviewToken(token)) {
    redirectUrl.searchParams.set("auth", "failed");
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.cookies.set(REVIEW_COOKIE_NAME, createReviewSessionValue(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

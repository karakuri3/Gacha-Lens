import { NextResponse } from "next/server";
import { REVIEW_COOKIE_NAME } from "@/lib/admin-auth";

export async function POST(request) {
  const response = NextResponse.redirect(new URL("/review", request.url), { status: 303 });
  response.cookies.set(REVIEW_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

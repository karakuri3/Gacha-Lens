import { NextResponse } from "next/server";
import { getPublicFavoriteIdentifiers } from "@/lib/series";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const values = String(new URL(request.url).searchParams.get("ids") || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value && value.length <= 200)
    .slice(0, 100);

  const identifiers = await getPublicFavoriteIdentifiers(values);
  return NextResponse.json(
    { identifiers },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

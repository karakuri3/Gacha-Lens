const SOURCE_SHA = process.env.GACHA_RELEASE_SOURCE_SHA ?? "";

export const dynamic = "force-static";
export const revalidate = false;

export function GET() {
  const sourceSha = /^[0-9a-f]{40}$/.test(SOURCE_SHA) ? SOURCE_SHA : "unavailable";

  return Response.json(
    { source_sha: sourceSha },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

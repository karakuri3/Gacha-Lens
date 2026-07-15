import { NextResponse } from "next/server";
import { REVIEW_COOKIE_NAME, verifyReviewSession } from "@/lib/admin-auth";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export async function POST(request, { params }) {
  if (!sameOrigin(request) || !verifyReviewSession(request.cookies.get(REVIEW_COOKIE_NAME)?.value)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabaseConfig || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Supabase service role is required" }, { status: 503 });
  }

  const { id } = await params;
  const form = await request.formData();
  const decision = String(form.get("decision") || "");
  if (!['approved', 'rejected'].includes(decision)) return Response.json({ error: "Invalid decision" }, { status: 400 });

  const { data: report, error } = await supabase.from("community_reports").select("*").eq("id", id).maybeSingle();
  if (error || !report) return Response.json({ error: "Report not found" }, { status: 404 });

  if (decision === "approved") await publishReport(report);

  await Promise.all([
    supabase.from("community_reports").update({
      status: decision,
      review_required: false,
      confidence: decision === "approved" ? (report.source_url ? 0.65 : 0.48) : report.confidence,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id),
    supabase.from("import_issues").update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      note: `Community report ${decision} by review admin.`,
      updated_at: new Date().toISOString(),
    }).eq("id", `community-report-${id}`),
  ]);

  return NextResponse.redirect(new URL(`/review?community=${decision}`, request.url), { status: 303 });
}

async function publishReport(report) {
  if (["sold_price", "asking_price", "buyback_price"].includes(report.report_type)) {
    const status = report.report_type === "sold_price" ? "sold" : report.report_type === "buyback_price" ? "buyback" : "active";
    await supabase.from("market_listings").upsert({
      id: `community-${report.id}`,
      variant_id: report.variant_id,
      matched_variant_id: report.variant_id,
      series_id: report.series_id,
      title: `ユーザー確認 ${report.report_type}`,
      listing_type: "single",
      market_review_type: "single",
      classification_reason: "reviewed_community_report",
      classification_confidence: report.source_url ? 0.65 : 0.48,
      classification_details: { community_report_id: report.id, reviewed: true },
      price: report.price,
      status,
      source: "community_report",
      source_type: "user_report",
      source_url: report.source_url,
      listed_at: report.occurred_at,
      sold_at: status === "sold" ? report.occurred_at : null,
      last_observed_at: report.occurred_at,
      confidence: report.source_url ? 0.65 : 0.48,
      review_required: false,
      raw: { community_report_id: report.id, shop_name: report.shop_name, region: report.region },
    }, { onConflict: "id" });
    return;
  }

  const stockStatus = { in_stock: "in_stock", low_stock: "low", sold_out: "sold_out", restocked: "restocked" }[report.report_type];
  await supabase.from("stock_reports").upsert({
    id: `community-stock-${report.id}`,
    variant_id: report.variant_id,
    matched_variant_id: report.variant_id,
    series_id: report.series_id,
    source_type: "user_report",
    source_weight: report.source_url ? 0.62 : 0.42,
    status: stockStatus,
    status_label: report.report_type,
    classification_reason: "reviewed_community_report",
    classification_keywords: [],
    text: report.note,
    region: report.region,
    shop_name: report.shop_name,
    source_url: report.source_url,
    reported_at: report.occurred_at,
    confidence: report.source_url ? 0.62 : 0.42,
    review_required: false,
    raw: { community_report_id: report.id },
  }, { onConflict: "id" });

  if (report.report_type === "restocked") {
    await supabase.from("restock_events").upsert({
      id: `community-restock-${report.id}`,
      variant_id: report.variant_id,
      matched_variant_id: report.variant_id,
      series_id: report.series_id,
      source_type: "user_report",
      source_weight: report.source_url ? 0.62 : 0.42,
      event_type: "restock",
      event_label: "再入荷",
      classification_reason: "reviewed_community_report",
      classification_keywords: [],
      text: report.note,
      region: report.region,
      shop_name: report.shop_name,
      source_url: report.source_url,
      reported_at: report.occurred_at,
      confidence: report.source_url ? 0.62 : 0.42,
      review_required: false,
      raw: { community_report_id: report.id },
    }, { onConflict: "id" });
  }
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

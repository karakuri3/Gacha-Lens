import crypto from "node:crypto";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PRICE_TYPES = new Set(["sold_price", "asking_price", "buyback_price"]);
const STOCK_TYPES = new Set(["in_stock", "low_stock", "sold_out", "restocked"]);
const ALLOWED_TYPES = new Set([...PRICE_TYPES, ...STOCK_TYPES]);

export async function POST(request) {
  if (!hasSupabaseConfig || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "投稿受付は準備中です" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  if (text(body.website)) return Response.json({ ok: true }, { status: 202 });

  const reportType = text(body.reportType);
  const variantId = text(body.variantId);
  if (!ALLOWED_TYPES.has(reportType) || !variantId) {
    return Response.json({ error: "入力内容を確認してください" }, { status: 400 });
  }

  const { data: variant, error: variantError } = await supabase
    .from("variants")
    .select("id,series_id,released")
    .eq("id", variantId)
    .maybeSingle();
  if (variantError || !variant) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  if (PRICE_TYPES.has(reportType) && !variant.released) {
    return Response.json({ error: "発売前の商品には価格報告を登録できません" }, { status: 400 });
  }

  const price = PRICE_TYPES.has(reportType) ? parsePrice(body.price) : null;
  if (PRICE_TYPES.has(reportType) && !price) {
    return Response.json({ error: "価格は1〜1,000,000円で入力してください" }, { status: 400 });
  }

  const sourceUrl = safeUrl(body.sourceUrl);
  if (text(body.sourceUrl) && !sourceUrl) return Response.json({ error: "確認URLはhttps://で入力してください" }, { status: 400 });

  const submitterHash = hashSubmitter(request);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("community_reports")
    .select("id", { count: "exact", head: true })
    .eq("submitter_hash", submitterHash)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= 5) return Response.json({ error: "投稿回数が多いため、時間を空けてください" }, { status: 429 });

  const id = crypto.randomUUID();
  const report = {
    id,
    variant_id: variant.id,
    series_id: variant.series_id,
    report_type: reportType,
    price,
    shop_name: truncate(body.shopName, 100),
    region: truncate(body.region, 100),
    source_url: sourceUrl,
    note: truncate(body.note, 500),
    occurred_at: safeDate(body.occurredAt),
    submitter_hash: submitterHash,
    status: "pending",
    confidence: sourceUrl ? 0.4 : 0.25,
    review_required: true,
  };

  const { error: insertError } = await supabase.from("community_reports").insert(report);
  if (insertError) return Response.json({ error: "投稿を保存できませんでした" }, { status: 500 });

  await supabase.from("import_issues").upsert({
    id: `community-report-${id}`,
    issue_type: "community_report_pending",
    table_name: "community_reports",
    record_id: id,
    source: "community_report",
    source_url: sourceUrl,
    raw: { ...report, submitter_hash: undefined, title: reportLabel(reportType) },
    resolved: false,
    note: "公開集計へ反映する前に内容を確認してください。",
  }, { onConflict: "id" });

  return Response.json({ ok: true, status: "pending" }, { status: 201 });
}

function hashSubmitter(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  const salt = process.env.COMMUNITY_REPORT_SALT || process.env.INGEST_CRON_TOKEN || "gacha-community";
  return crypto.createHash("sha256").update(`${salt}:${forwarded}:${agent}`).digest("hex");
}

function parsePrice(value) {
  const parsed = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000000 ? parsed : null;
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

function safeDate(value) {
  const parsed = new Date(value || Date.now());
  const now = Date.now();
  const time = parsed.getTime();
  if (!Number.isFinite(time) || time > now + 86400000 || time < now - 366 * 86400000) return new Date().toISOString();
  return parsed.toISOString();
}

function truncate(value, max) {
  return text(value).slice(0, max) || null;
}

function text(value) {
  return String(value || "").trim();
}

function reportLabel(type) {
  return {
    sold_price: "売れた価格",
    asking_price: "販売価格",
    buyback_price: "買取価格",
    in_stock: "在庫あり",
    low_stock: "残り少ない",
    sold_out: "売り切れ",
    restocked: "再入荷",
  }[type] || type;
}

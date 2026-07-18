const DEFAULT_OFFICIAL_SOURCE_URLS = [
  "https://gashapon.jp/schedule/",
  "https://gashapon.jp/products/",
  "https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0",
];

export async function fetchOfficialRaw(options = {}) {
  const urls = parseList(options.urls ?? process.env.OFFICIAL_SOURCE_URLS);
  const configuredUrls = urls.length ? urls : DEFAULT_OFFICIAL_SOURCE_URLS;
  const sourceUrls = expandOfficialSourceUrls(configuredUrls, options);
  const detailFetchLimit = number(options.detailFetchLimit ?? process.env.OFFICIAL_DETAIL_FETCH_LIMIT) ?? 60;
  const detailFetchDelayMs = number(options.detailFetchDelayMs ?? process.env.OFFICIAL_DETAIL_FETCH_DELAY_MS) ?? 250;
  const sourceFetchDelayMs = number(options.sourceFetchDelayMs ?? process.env.OFFICIAL_SOURCE_FETCH_DELAY_MS) ?? 200;
  const results = [];
  const issues = [];
  const detailQueue = [];
  const previousRecords = asArray(options.previousRecords);
  const knownOfficialRecords = asArray(options.knownOfficialRecords);
  let takaratomyTotalPages = null;

  for (const url of sourceUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json, text/html;q=0.9, */*;q=0.8",
          "user-agent": "GachaLensBot/0.1 (+official-master-ingestion)",
        },
      });

      if (!response.ok) {
        issues.push(createIssue(url, `HTTP ${response.status}`));
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      const body = await response.text();
      const parsed = contentType.includes("json")
        ? parseJsonPayload(body, url)
        : parseHtmlPayload(body, url);

      results.push(...parsed.records);
      issues.push(...parsed.issues);
      detailQueue.push(...parsed.detailUrls);
      takaratomyTotalPages = parsed.sourceMeta?.takaratomyTotalPages ?? takaratomyTotalPages;
    } catch (error) {
      issues.push(createIssue(url, error.message));
    }
    if (sourceFetchDelayMs > 0) await sleep(sourceFetchDelayMs);
  }

  const priorityDetailUrls = asArray(options.priorityDetailUrls).map(text).filter(Boolean);
  const priorityDetailUrlSet = new Set(priorityDetailUrls);
  const previousDetailUrls = previousRecords
    .map((record) => text(record.official_url))
    .filter(isKnownOfficialDetailUrl);
  const databaseDetailUrls = knownOfficialRecords
    .map((record) => text(record.official_url))
    .filter(isKnownOfficialDetailUrl);
  const allDetailUrls = [...new Set([...priorityDetailUrls, ...detailQueue, ...previousDetailUrls, ...databaseDetailUrls])];
  const detailedUrls = new Set(
    [
      ...previousRecords
        .filter((record) => asArray(record.variants).length > 0)
        .map((record) => text(record.official_url)),
      ...asArray(options.knownDetailedOfficialUrls).map(text),
    ].filter(Boolean)
  );
  const recordsByOfficialUrl = new Map(
    [...knownOfficialRecords, ...previousRecords, ...results]
      .filter((record) => record.official_url)
      .map((record) => [record.official_url, record])
  );
  const missingDetailUrls = allDetailUrls
    .filter((url) => !detailedUrls.has(url))
    .sort((left, right) => {
      const priorityDifference = Number(priorityDetailUrlSet.has(right)) - Number(priorityDetailUrlSet.has(left));
      return priorityDifference || compareDetailPriority(left, right, recordsByOfficialUrl);
    });
  const detailCursor = Math.max(0, number(options.detailCursor) ?? 0);
  const refreshQueue = rotate(allDetailUrls, detailCursor);
  const detailUrls = (missingDetailUrls.length ? missingDetailUrls : refreshQueue).slice(0, detailFetchLimit);
  for (const detailUrl of detailUrls) {
    try {
      const response = await fetch(detailUrl, {
        headers: {
          accept: "text/html, */*;q=0.8",
          "user-agent": "GachaLensBot/0.1 (+official-detail-ingestion)",
        },
      });
      if (!response.ok) {
        issues.push(createIssue(detailUrl, `detail HTTP ${response.status}`));
        continue;
      }
      const detailBody = await response.text();
      const detail = isTakaratomyDetailUrl(detailUrl)
        ? parseTakaratomyDetailHtml(detailBody, detailUrl)
        : parseOfficialDetailHtml(detailBody, detailUrl);
      if (detail.record) results.push(detail.record);
      issues.push(...detail.issues);
    } catch (error) {
      issues.push(createIssue(detailUrl, error.message));
    }
    if (detailFetchDelayMs > 0) await sleep(detailFetchDelayMs);
  }

  const records = mergeOfficialRecords(previousRecords, results);
  const detailedRecords = records.filter((record) => asArray(record.variants).length > 0).length;
  const detailedRecordUrls = new Set(
    [
      ...records
        .filter((record) => asArray(record.variants).length > 0)
        .map((record) => text(record.official_url)),
      ...asArray(options.knownDetailedOfficialUrls).map(text),
    ].filter(Boolean)
  );
  const nextDetailCursor = allDetailUrls.length
    ? (detailCursor + detailUrls.length) % allDetailUrls.length
    : 0;
  const takaratomyPagesPerRun = Math.max(1, number(options.takaratomyPagesPerRun ?? process.env.OFFICIAL_TARTS_PAGES_PER_RUN) ?? 4);
  const takaratomyPageLimit = Math.max(2, takaratomyTotalPages ?? number(process.env.OFFICIAL_TARTS_MAX_PAGE) ?? 80);
  const currentTakaratomyPage = resolveTakaratomyCursor(options, takaratomyPagesPerRun, takaratomyPageLimit);
  const nextTakaratomyPage = currentTakaratomyPage + takaratomyPagesPerRun > takaratomyPageLimit
    ? 2
    : currentTakaratomyPage + takaratomyPagesPerRun;

  return {
    ok: true,
    reviewRequired: issues.length > 0,
    source: "official",
    fetchedAt: new Date().toISOString(),
    count: records.length,
    records,
    detailedRecords,
    detailQueue: allDetailUrls.length,
    priorityDetails: priorityDetailUrls.length,
    detailFetched: detailUrls.length,
    remainingDetails: allDetailUrls.filter((url) => !detailedRecordUrls.has(url)).length,
    detailCursor: nextDetailCursor,
    sourceCursors: {
      ...(options.sourceCursors || {}),
      takaratomyPage: nextTakaratomyPage,
      takaratomyTotalPages: takaratomyPageLimit,
    },
    sourceCoverage: {
      takaratomyTotalPages,
      takaratomyPagesPerRun,
      nextTakaratomyPage,
    },
    issues,
  };
}

function compareDetailPriority(leftUrl, rightUrl, recordsByOfficialUrl) {
  const left = detailPriority(recordsByOfficialUrl.get(leftUrl));
  const right = detailPriority(recordsByOfficialUrl.get(rightUrl));
  if (left.bucket !== right.bucket) return left.bucket - right.bucket;
  return left.order - right.order;
}

function detailPriority(record) {
  const timestamp = Date.parse(String(record?.release_date || ""));
  if (!Number.isFinite(timestamp)) return { bucket: 3, order: 0 };
  const now = Date.now();
  const recentCutoff = now - 1000 * 60 * 60 * 24 * 120;
  if (timestamp >= now) return { bucket: 0, order: timestamp };
  if (timestamp >= recentCutoff) return { bucket: 1, order: -timestamp };
  return { bucket: 2, order: -timestamp };
}

function parseJsonPayload(body, url) {
  const data = JSON.parse(body);
  const records = normalizeOfficialContainer(data, url);
  return { records, issues: records.length ? [] : [createIssue(url, "No official records found in JSON")], detailUrls: [] };
}

function parseHtmlPayload(body, url) {
  if (isTakaratomySearchUrl(url)) return parseTakaratomySearchHtml(body, url);

  const jsonLdRecords = [...body.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => safeJson(match[1]))
    .flatMap((entry) => normalizeOfficialContainer(entry, url));

  if (jsonLdRecords.length) return { records: jsonLdRecords, issues: [], detailUrls: [] };

  const scheduleRecords = parseScheduleCards(body, url);
  if (scheduleRecords.length) {
    return {
      records: scheduleRecords,
      issues: shouldCreateScheduleReviewIssues()
        ? [createIssue(url, `Schedule page captured ${scheduleRecords.length} cards; raise OFFICIAL_DETAIL_FETCH_LIMIT to fetch more detail lineups`)]
        : [],
      detailUrls: scheduleRecords.map((record) => record.official_url).filter(Boolean),
    };
  }

  const detailUrls = parseProductDetailLinks(body, url);
  if (detailUrls.length) {
    return {
      records: [],
      issues: [],
      detailUrls,
    };
  }

  if (!isProductDetailUrl(url)) {
    return {
      records: [],
      issues: [],
      detailUrls: [],
    };
  }

  const title = matchMeta(body, "og:title") || matchTitle(body);
  const image = matchMeta(body, "og:image");
  const productId = stableId("official", url);
  const record = title ? {
    id: productId,
    slug: productId,
    name: cleanText(title),
    brand: "",
    category: "",
    official_url: url,
    image_url: image,
    variants: [],
    source_type: "official_site",
    review_required: true,
    raw: { source_url: url, parser: "html_meta" },
  } : null;

  return {
    records: record ? [record] : [],
    issues: [createIssue(url, record ? "HTML fallback requires manual variant lineup review" : "No official product metadata found")],
    detailUrls: isProductDetailUrl(url) ? [url] : [],
  };
}

function parseTakaratomySearchHtml(body, url) {
  const productListHtml = body.match(/<div\s+class=["']dbitems["'][^>]*>([\s\S]*?)(?=<div\s+id=["']pagenation["'])/i)?.[1] || "";
  const records = [...productListHtml.matchAll(/<a\b[^>]+href=["']([^"']*\/items\/item\.html\?n=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => parseTakaratomySearchCard(match[1], match[2], url))
    .filter(Boolean);
  const totalProducts = number(body.match(/class=["']kensu[^"']*["'][^>]*>\s*([\d,]+)商品中/i)?.[1]);
  const takaratomyTotalPages = totalProducts ? Math.ceil(totalProducts / 40) : null;

  return {
    records,
    issues: records.length ? [] : [createIssue(url, "No Takara Tomy Arts products found")],
    detailUrls: records.map((record) => record.official_url).filter(Boolean),
    sourceMeta: { takaratomyTotalPages },
  };
}

function parseTakaratomySearchCard(href, cardHtml, sourceUrl) {
  const officialUrl = absoluteUrl(href, sourceUrl);
  const name = stripTags(cardHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
  if (!name) return null;

  const productCode = new URL(officialUrl).searchParams.get("n") || stableId(name);
  const paragraphs = [...cardHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => stripTags(match[1]));
  const priceText = paragraphs.find((value) => value.includes("価格")) || "";
  const releaseText = paragraphs.find((value) => value.includes("発売時期")) || "";
  const schedule = parseTakaratomyReleaseSchedule(releaseText);
  const id = `tarts-${stableId(productCode)}`;

  return {
    id,
    slug: id,
    name,
    franchise: inferFranchise(name),
    brand: "タカラトミーアーツ",
    category: "ガチャ",
    release_month: schedule.release_month,
    release_week: schedule.release_week,
    release_date: schedule.release_date,
    price: number(priceText),
    official_url: officialUrl,
    image_url: absoluteUrl(matchImage(cardHtml), sourceUrl),
    released: isProbablyReleased(schedule),
    variants: [],
    source_type: "official_site",
    review_required: true,
    raw: {
      source_url: sourceUrl,
      parser: "takaratomy_arts_search_card",
      product_code: productCode,
      release_text: releaseText,
    },
  };
}

function parseTakaratomyDetailHtml(body, url) {
  if (/みまもりフィルター|id=["']check_page["']/i.test(body)) {
    return {
      record: null,
      issues: [createIssue(url, "Detail is protected by an age confirmation page; discovery data was retained")],
    };
  }

  const section = body.match(/<section\s+id=["']detail["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || body;
  const rawName = stripTags(section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "")
    || matchMeta(body, "og:title")
    || matchTitle(body);
  const name = cleanTakaratomyTitle(rawName);
  if (!name) return { record: null, issues: [createIssue(url, "No Takara Tomy Arts detail title found")] };

  const productCode = new URL(url).searchParams.get("n") || stableId(name);
  const id = `tarts-${stableId(productCode)}`;
  const summaryHtml = body.match(/<div\s+class=["']summary["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  const summaryText = htmlToLines(summaryHtml);
  const headerText = stripTags(section.match(/<div\s+class=["']head["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const metaDescription = matchMeta(body, "description");
  const releaseText = firstMatchText([headerText, metaDescription], /発売時期\s*[:：]\s*([^■。]+)/i);
  const schedule = parseTakaratomyReleaseSchedule(releaseText);
  const expectedVariantCount = number((summaryText || metaDescription).match(/全\s*(\d+)\s*種/)?.[1]);
  const variantNames = parseTakaratomyLineup(summaryText || metaDescription, expectedVariantCount);
  const imageUrl = matchMeta(body, "og:image")
    || absoluteUrl(section.match(/<div\s+class=["'][^"']*images[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1] || "", url);
  const variants = variantNames.map((variantName, index) => createTakaratomyVariant(id, variantName, imageUrl, index));
  const price = number(firstMatchText([headerText, metaDescription], /価格\s*[:：]\s*([\d,]+)\s*円/i));
  const issues = [];

  if (!variants.length) {
    issues.push(createIssue(url, "Takara Tomy Arts detail captured but no lineup was found"));
  } else if (expectedVariantCount && variants.length !== expectedVariantCount) {
    issues.push(createIssue(url, `Takara Tomy Arts variant count mismatch: expected ${expectedVariantCount}, parsed ${variants.length}`));
  }

  return {
    record: {
      id,
      slug: id,
      name,
      franchise: inferFranchise(name),
      brand: "タカラトミーアーツ",
      category: "ガチャ",
      release_month: schedule.release_month,
      release_week: schedule.release_week,
      release_date: schedule.release_date,
      price,
      official_url: url,
      image_url: imageUrl,
      released: isProbablyReleased(schedule),
      variants,
      source_type: "official_site",
      review_required: variants.length === 0 || Boolean(expectedVariantCount && variants.length !== expectedVariantCount),
      raw: {
        source_url: url,
        parser: "takaratomy_arts_detail_page",
        product_code: productCode,
        release_text: releaseText,
        expected_variant_count: expectedVariantCount,
        summary_text: summaryText,
      },
    },
    issues,
  };
}

function parseTakaratomyLineup(value, expectedCount) {
  const normalized = text(value).replace(/\r/g, "");
  const markerIndex = normalized.search(/ラインナップ(?:は|[:：])/);
  const source = markerIndex >= 0 ? normalized.slice(markerIndex) : normalized;
  const lineupText = source
    .replace(/^.*?ラインナップ(?:は|[:：])\s*/s, "")
    .replace(/(?:の)?全\s*\d+\s*種[。！!]?([\s\S]*)$/s, "")
    .trim();
  let candidates = lineupText
    .split(/\n+/)
    .flatMap((line) => line.split(/\s*、\s*/))
    .map((line) => line.replace(/^[・●\-\s]+|[。\s]+$/g, "").replace(/^「([\s\S]+)」$/, "$1").trim())
    .filter((line) => isLikelyVariantName(line));

  if (markerIndex < 0 && !expectedCount) return [];
  if (expectedCount && candidates.length > expectedCount) candidates = candidates.slice(-expectedCount);
  return [...new Set(candidates)];
}

function createTakaratomyVariant(seriesId, name, imageUrl, index) {
  const secret = /シークレット|SECRET/i.test(name);
  const rare = !secret && /レアカラー|レア|当たり|スペシャル/i.test(name);
  const variantType = secret ? "secret" : rare ? "rare" : "normal";
  return {
    id: stableVariantId(seriesId, name, index),
    slug: stableVariantId(seriesId, name, index),
    name,
    image_url: imageUrl,
    variant_type: variantType,
    rarity: secret ? "secret" : rare ? "rare" : "",
    tags: secret ? ["シークレット"] : rare ? ["レア"] : [],
    axes: {},
    review_required: false,
  };
}

function parseTakaratomyReleaseSchedule(value) {
  const normalized = text(value);
  const yearMonth = normalized.match(/(20\d{2})年\s*(\d{1,2})月/);
  const weekDate = normalized.match(/[（(]\s*(\d{1,2})月\s*(\d{1,2})日週発売\s*[）)]/);
  const year = yearMonth ? Number(yearMonth[1]) : null;
  const month = yearMonth ? Number(yearMonth[2]) : weekDate ? Number(weekDate[1]) : null;
  const day = weekDate ? Number(weekDate[2]) : 1;
  const week = weekDate ? Math.min(5, Math.max(1, Math.ceil(day / 7))) : null;
  return {
    release_month: month ? `${month}月` : "",
    release_week: week ? `第${week}週` : "未定",
    release_date: year && month ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "",
  };
}

function cleanTakaratomyTitle(value) {
  return cleanText(value).replace(/\s*\|\s*商品情報.*$/i, "").trim();
}

function htmlToLines(value) {
  return cleanTextPreservingLines(
    decodeHtml(String(value))
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function cleanTextPreservingLines(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function firstMatchText(values, pattern) {
  for (const value of values) {
    const matched = text(value).match(pattern);
    if (matched?.[1]) return cleanText(matched[1]);
  }
  return "";
}

function isLikelyVariantName(value) {
  const normalized = text(value);
  if (!normalized || normalized.length > 80) return false;
  return !/^(?:※|商品|対象年齢|発売|価格|種類|ラインナップ|詳細|©|\(c\))/i.test(normalized);
}

function parseScheduleCards(body, url) {
  const period = parseSchedulePeriod(body, url);
  const weekBlocks = [...body.matchAll(/<div class=["']week["'][^>]*>([\s\S]*?)(?=<div class=["']week["']|<\/section>|<\/main>)/gi)];
  return weekBlocks.flatMap((weekMatch) => {
    const weekHtml = weekMatch[1];
    const schedule = parseWeekLabel(weekHtml, period);
    return [...weekHtml.matchAll(/<a class=["']c-card__link["'] href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((cardMatch) => parseScheduleCard(cardMatch[1], cardMatch[2], schedule, url))
      .filter(Boolean);
  });
}

function parseProductDetailLinks(body, url) {
  return [...body.matchAll(/<a\b[^>]+href=["']([^"']*\/products\/detail\.php\?[^"']+)["'][^>]*>/gi)]
    .map((match) => absoluteUrl(match[1], url))
    .filter(Boolean);
}

function parseScheduleCard(href, cardHtml, schedule, sourceUrl) {
  const officialUrl = absoluteUrl(href, sourceUrl);
  const name = stripTags(matchClass(cardHtml, "c-card__name"));
  if (!name || !officialUrl.includes("/products/detail.php")) return null;

  const janCode = new URL(officialUrl).searchParams.get("jan_code") || "";
  const imageUrl = absoluteUrl(matchImage(cardHtml), sourceUrl);
  const price = number(stripTags(matchClass(cardHtml, "c-card__price--main")));
  const category = stripTags(matchClass(cardHtml, "c-card__category"));
  const isRestock = cardHtml.includes("c-card__resale");
  const id = janCode ? `gashapon-${janCode}` : stableId("official", officialUrl, name);

  return {
    id,
    slug: id,
    name,
    franchise: inferFranchise(name),
    brand: "バンダイ",
    category,
    release_month: schedule.release_month,
    release_week: schedule.release_week,
    release_date: schedule.release_date,
    price,
    official_url: officialUrl,
    image_url: imageUrl,
    released: isProbablyReleased(schedule),
    variants: [],
    source_type: "official_site",
    review_required: true,
    raw: {
      source_url: sourceUrl,
      parser: "gashapon_schedule_card",
      jan_code: janCode,
      is_restock: isRestock,
      schedule,
    },
  };
}

function parseOfficialDetailHtml(body, url) {
  const name = stripTags(body.match(/<h1 class=["']pg-heading["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "") || matchMeta(body, "og:title") || matchTitle(body);
  if (!name) return { record: null, issues: [createIssue(url, "No detail title found")] };

  const janCode = new URL(url).searchParams.get("jan_code") || "";
  const id = janCode ? `gashapon-${janCode}` : stableId("official", url, name);
  const imageUrl = matchMeta(body, "og:image") || matchDetailImages(body)[0]?.image_url || "";
  const releaseText = detailDefinition(body, "発売時期");
  const releaseDate = parseReleaseDate(releaseText);
  const price = number(detailDefinition(body, "価格"));
  const variantCountText = detailDefinition(body, "種類数");
  const expectedVariantCount = number(variantCountText);
  const variants = matchDetailImages(body)
    .filter((item) => item.name)
    .map((item, index) => ({
      id: stableVariantId(id, item.name, index),
      slug: stableVariantId(id, item.name, index),
      name: item.name,
      image_url: item.image_url,
      variant_type: "normal",
      rarity: "",
      tags: [],
      axes: {},
      review_required: false,
    }));

  const issues = [];
  if (!variants.length) {
    issues.push(createIssue(url, "Detail page captured but no variant titles were found"));
  } else if (expectedVariantCount && variants.length < expectedVariantCount) {
    issues.push(createIssue(url, `Detail page variant count mismatch: expected ${expectedVariantCount}, parsed ${variants.length}`));
  }

  return {
    record: {
      id,
      slug: id,
      name,
      franchise: inferFranchise(name),
      brand: "バンダイ",
      category: "ガシャポン",
      release_month: parseReleaseMonth(releaseText),
      release_week: parseReleaseWeek(releaseText),
      release_date: releaseDate,
      price,
      official_url: url,
      image_url: imageUrl,
      released: isProbablyReleased({ release_date: releaseDate, release_month: parseReleaseMonth(releaseText) }),
      variants,
      source_type: "official_site",
      review_required: variants.length === 0,
      raw: {
        source_url: url,
        parser: "gashapon_detail_page",
        jan_code: janCode,
        release_text: releaseText,
        variant_count_text: variantCountText,
        expected_variant_count: expectedVariantCount,
      },
    },
    issues,
  };
}

function normalizeOfficialContainer(data, url) {
  const values = Array.isArray(data) ? data : [data];
  return values.flatMap((entry) => {
    if (!entry) return [];
    if (Array.isArray(entry.products)) return entry.products.flatMap((product) => normalizeOfficialContainer(product, url));
    if (Array.isArray(entry.items)) return entry.items.flatMap((product) => normalizeOfficialContainer(product, url));
    if (Array.isArray(entry.officialProducts)) return entry.officialProducts.flatMap((product) => normalizeOfficialContainer(product, url));
    return [normalizeOfficialProduct(entry, url)].filter(Boolean);
  });
}

function normalizeOfficialProduct(entry, url) {
  const name = text(entry.name || entry.title || entry.product_name);
  if (!name) return null;

  const id = text(entry.id || entry.series_id || entry.slug) || stableId("official", url, name);
  const variants = asArray(entry.variants || entry.lineup || entry.line_up || entry.itemListElement).map((variant, index) => {
    const variantName = text(variant.name || variant.title || variant.variant_name || variant.item?.name);
    return {
      id: text(variant.id || variant.variant_id) || stableId(id, variantName || index),
      slug: text(variant.slug) || stableId(id, variantName || index),
      name: variantName,
      image_url: text(variant.image_url || variant.image || variant.item?.image),
      variant_type: text(variant.variant_type || variant.type) || "normal",
      rarity: text(variant.rarity),
      tags: asArray(variant.tags).map(text).filter(Boolean),
      axes: variant.axes || {},
      review_required: !variantName,
    };
  });

  return {
    id,
    slug: text(entry.slug) || id,
    name,
    franchise: text(entry.franchise || entry.character || entry.work_name || entry.brand?.name),
    brand: text(entry.brand?.name || entry.brand || entry.maker || entry.manufacturer),
    category: text(entry.category || entry.genre),
    release_month: text(entry.release_month || entry.month || entry.releaseMonth),
    release_week: text(entry.release_week || entry.week || entry.releaseWeek),
    release_date: text(entry.release_date || entry.releaseDate || entry.releaseDateTime),
    price: entry.price || entry.price_yen || entry.priceYen || null,
    official_url: text(entry.official_url || entry.url) || url,
    image_url: text(entry.image_url || entry.image || entry.thumbnail),
    released: Boolean(entry.released || entry.is_released),
    variants,
    source_type: "official_site",
    review_required: variants.length === 0,
    raw: { ...entry, source_url: url },
  };
}

function parseWeekLabel(html, period = {}) {
  const dates = [...html.matchAll(/pg-schedule__month--date["'][^>]*>(\d{1,2})</g)].map((match) => Number(match[1]));
  const month = dates[0] || period.month || null;
  return {
    release_month: month ? `${month}月` : "",
    release_week: dates[1] ? `第${dates[1]}週` : "",
    release_date: period.year && month ? `${period.year}-${String(month).padStart(2, "0")}-01` : "",
    release_year: period.year || null,
  };
}

function parseSchedulePeriod(body, url) {
  const ym = new URL(url).searchParams.get("ym") || "";
  const queryMatch = ym.match(/^(\d{4})(\d{2})$/);
  if (queryMatch) return { year: Number(queryMatch[1]), month: Number(queryMatch[2]) };

  const titleMatch = body.match(/pg-tit__main--mo["'][^>]*>\s*(\d{4})\.(\d{1,2})\s*</i)
    || body.match(/発売スケジュール（\s*(\d{4})年\s*(\d{1,2})月\s*）/i);
  return titleMatch ? { year: Number(titleMatch[1]), month: Number(titleMatch[2]) } : {};
}

function matchClass(html, className) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*${escapeRegExp(className)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  return html.match(pattern)?.[1] || "";
}

function matchImage(html) {
  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
}

function matchDetailImages(body) {
  return [...body.matchAll(/<li[^>]+class=["'][^"']*swiper-slide[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => match[1].match(/<img\b[^>]*>/i)?.[0] || "")
    .filter(Boolean)
    .map((imgTag) => ({
      image_url: attributeValue(imgTag, "src"),
      name: cleanText(decodeHtml(attributeValue(imgTag, "title") || attributeValue(imgTag, "alt"))),
    }))
    .filter((item) => item.name && !isNonVariantImageTitle(item.name))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.name === item.name) === index);
}

function attributeValue(tag, name) {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}=["']([^"']*)["']`, "i");
  return tag.match(pattern)?.[1] || "";
}

function detailDefinition(body, label) {
  const pattern = new RegExp(`<dt class=["']pg-detailDefinition__title["'][^>]*>\\s*${escapeRegExp(label)}[\\s\\S]*?<\\/dt>\\s*<dd class=["']pg-detailDefinition__detail[^"']*["'][^>]*>([\\s\\S]*?)<\\/dd>`, "i");
  return stripTags(body.match(pattern)?.[1] || "");
}

function parseReleaseMonth(value) {
  const matched = text(value).match(/(\d{1,2})月/);
  return matched ? `${Number(matched[1])}月` : "";
}

function parseReleaseWeek(value) {
  const matched = text(value).match(/第\s*([1-5])\s*週/);
  return matched ? `第${matched[1]}週` : "";
}

function parseReleaseDate(value) {
  const matched = text(value).match(/(20\d{2})年\s*(\d{1,2})月/);
  return matched ? `${matched[1]}-${String(Number(matched[2])).padStart(2, "0")}-01` : "";
}

function stripTags(value) {
  return cleanText(decodeHtml(String(value).replace(/<[^>]+>/g, " ")));
}

function absoluteUrl(value, baseUrl) {
  if (!value) return "";
  return new URL(value, baseUrl).toString();
}

function inferFranchise(name) {
  return text(name).split(/[　\s]/)[0] || "";
}

function isProductDetailUrl(value) {
  return text(value).includes("/products/detail.php");
}

function shouldCreateScheduleReviewIssues() {
  return text(process.env.OFFICIAL_STRICT_DETAIL_REVIEW).toLowerCase() === "true";
}

function isProbablyReleased(schedule = {}) {
  const releaseDate = text(schedule.release_date);
  if (releaseDate) {
    const releaseMonth = new Date(`${releaseDate.slice(0, 7)}-01T00:00:00+09:00`).getTime();
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    if (Number.isFinite(releaseMonth)) return releaseMonth <= currentMonth;
  }
  const month = number(schedule.release_month);
  if (!month) return false;
  const now = new Date();
  return month <= now.getMonth() + 1;
}

function expandOfficialSourceUrls(urls, options = {}) {
  const pastMonths = Math.max(0, number(options.schedulePastMonths ?? process.env.OFFICIAL_SCHEDULE_PAST_MONTHS) ?? 6);
  const futureMonths = Math.max(0, number(options.scheduleFutureMonths ?? process.env.OFFICIAL_SCHEDULE_FUTURE_MONTHS) ?? 6);
  const historyStart = parseYearMonth(options.historyStartMonth ?? process.env.OFFICIAL_HISTORY_START_MONTH);
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startMonth = historyStart || addMonths(currentMonth, -pastMonths);
  const endMonth = addMonths(currentMonth, futureMonths);
  const expanded = [];
  const takaratomyPagesPerRun = Math.max(1, number(options.takaratomyPagesPerRun ?? process.env.OFFICIAL_TARTS_PAGES_PER_RUN) ?? 4);
  const takaratomyTotalPages = Math.max(2, number(options.sourceCursors?.takaratomyTotalPages) ?? number(process.env.OFFICIAL_TARTS_MAX_PAGE) ?? 80);
  const takaratomyCursor = resolveTakaratomyCursor(options, takaratomyPagesPerRun, takaratomyTotalPages);

  for (const url of urls) {
    if (isTakaratomySearchUrl(url)) {
      const latestUrl = new URL(url);
      latestUrl.searchParams.set("order", "release");
      latestUrl.searchParams.set("sort", "0");
      latestUrl.searchParams.set("p", "1");
      expanded.push(latestUrl.toString());
      for (let page = takaratomyCursor; page <= takaratomyTotalPages && page < takaratomyCursor + takaratomyPagesPerRun; page += 1) {
        const pageUrl = new URL(latestUrl);
        pageUrl.searchParams.set("p", String(page));
        expanded.push(pageUrl.toString());
      }
      continue;
    }
    if (!isScheduleUrl(url) || new URL(url).searchParams.has("ym")) {
      expanded.push(url);
      continue;
    }
    for (let cursor = startMonth; cursor <= endMonth; cursor = addMonths(cursor, 1)) {
      const monthUrl = new URL(url);
      monthUrl.searchParams.set("ym", `${cursor.getFullYear()}${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      expanded.push(monthUrl.toString());
    }
  }
  return [...new Set(expanded)];
}

function resolveTakaratomyCursor(options, pagesPerRun, totalPages) {
  const savedCursor = number(options.sourceCursors?.takaratomyPage);
  if (savedCursor && savedCursor >= 2) return savedCursor;
  const pageSpan = Math.max(1, totalPages - 1);
  const hour = Math.floor(Date.now() / (60 * 60 * 1000));
  return 2 + ((hour * pagesPerRun) % pageSpan);
}

function isTakaratomySearchUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === "www.takaratomy-arts.co.jp" && url.pathname.endsWith("/items/gacha/search.html");
  } catch {
    return false;
  }
}

function isTakaratomyDetailUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === "www.takaratomy-arts.co.jp" && url.pathname.endsWith("/items/item.html") && url.searchParams.has("n");
  } catch {
    return false;
  }
}

function isKnownOfficialDetailUrl(value) {
  return isProductDetailUrl(value) || isTakaratomyDetailUrl(value);
}

function isScheduleUrl(value) {
  try {
    return new URL(value).pathname.includes("/schedule");
  } catch {
    return false;
  }
}

function parseYearMonth(value) {
  const matched = text(value).match(/^(20\d{2})[-/]?(0?[1-9]|1[0-2])$/);
  return matched ? new Date(Number(matched[1]), Number(matched[2]) - 1, 1) : null;
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function safeJson(value) {
  try {
    return [JSON.parse(value)];
  } catch {
    return [];
  }
}

function matchMeta(body, property) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegExp(property)}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return cleanText(body.match(pattern)?.[1] || "");
}

function matchTitle(body) {
  return cleanText(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function createIssue(url, message) {
  return {
    id: stableId("official-fetch", url, message),
    issue_type: "official_fetch_review",
    table_name: "series",
    source: "official_site",
    source_url: url,
    resolved: false,
    note: message,
    raw: { url, message },
  };
}

function mergeOfficialRecords(previousRecords, incomingRecords) {
  const records = new Map();
  for (const incoming of [...previousRecords, ...incomingRecords]) {
    if (!incoming?.id) continue;
    const current = records.get(incoming.id) || {};
    const currentVariants = asArray(current.variants);
    const incomingVariants = asArray(incoming.variants);
    records.set(incoming.id, {
      ...current,
      ...incoming,
      variants: incomingVariants.length ? incomingVariants : currentVariants,
      raw: { ...(current.raw || {}), ...(incoming.raw || {}) },
    });
  }
  return [...records.values()];
}

function rotate(values, offset) {
  if (!values.length) return [];
  const start = offset % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[\n,]/).map(text).filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function cleanText(value) {
  return text(value).replace(/\s+/g, " ");
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&ldquo;", "“")
    .replaceAll("&rdquo;", "”")
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function isNonVariantImageTitle(value) {
  const normalized = text(value).toLowerCase();
  return ["イメージカット", "image", "main", "メイン"].includes(normalized);
}

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, "-")).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 140);
}

function stableVariantId(seriesId, variantName, index) {
  const id = stableId(seriesId, variantName);
  return id && id !== stableId(seriesId) ? id : stableId(seriesId, `variant-${index + 1}`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

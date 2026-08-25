import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildVariantImagePresentation,
  resolvePresentationImage,
  resolveTrustedVariantImage,
} from "../lib/domain/variant-image-presentation.js";
import { isPublicVariant } from "../lib/domain/variant-publication.js";

const root = process.cwd();
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const bandaiParent = { id: "bandai-series", brand: "バンダイ", image_url: "https://images.example/bandai-series.jpg" };
const tartsParent = { id: "tarts-series", brand: "タカラトミーアーツ", image_url: "https://images.example/tarts-series.jpg" };

test("Bandai genuine variant image remains trusted and drives the display", () => {
  const result = buildVariantImagePresentation({
    variant: { id: "bandai-variant", image: "https://images.example/bandai-variant.jpg", variant_type: "normal" },
    parent: bandaiParent,
    siblingCount: 4,
  });

  assert.deepEqual(result, {
    variant_image_url: "https://images.example/bandai-variant.jpg",
    series_image_url: bandaiParent.image_url,
    display_image_url: "https://images.example/bandai-variant.jpg",
    has_variant_image: true,
    image_scope: "variant",
  });
});

test("shared Takara Tomy Arts variant rows are never trusted as individual images", () => {
  const result = buildVariantImagePresentation({
    variant: { id: "tarts-y099762-a", image: "https://images.example/Y099762_b.jpg", variant_type: "normal" },
    parent: tartsParent,
    siblingCount: 4,
  });

  assert.equal(result.variant_image_url, "");
  assert.equal(result.display_image_url, tartsParent.image_url);
  assert.equal(result.has_variant_image, false);
  assert.equal(result.image_scope, "series_fallback");
});

test("a shared parent image is a fallback, not a variant image", () => {
  const result = buildVariantImagePresentation({
    variant: { id: "shared-image", image: "https://images.example/bandai-series.jpg", variant_type: "normal" },
    parent: bandaiParent,
    siblingCount: 2,
  });

  assert.equal(result.variant_image_url, "");
  assert.equal(result.series_image_url, bandaiParent.image_url);
  assert.equal(result.display_image_url, bandaiParent.image_url);
  assert.equal(result.has_variant_image, false);
  assert.equal(result.image_scope, "series_fallback");
});

test("missing images and generated placeholders resolve to the neutral missing state", () => {
  const missing = buildVariantImagePresentation({
    variant: { id: "missing", image: "", variant_type: "normal" },
    parent: { id: "missing-parent" },
    siblingCount: 1,
  });
  const generated = resolveTrustedVariantImage({
    variant: { id: "generated", image: "data:image/svg+xml;charset=UTF-8,%3Csvg%3E", variant_type: "normal" },
    parent: bandaiParent,
    siblingCount: 1,
  });

  assert.deepEqual(missing, {
    variant_image_url: "",
    series_image_url: "",
    display_image_url: "",
    has_variant_image: false,
    image_scope: "missing",
  });
  assert.equal(generated, "");
});

test("provisional publication and image suppression remain fail closed", () => {
  const provisional = { id: "provisional", slug: "provisional", series_id: "series-1", name: "確認中", variant_type: "provisional", image: "https://images.example/item.jpg" };
  assert.equal(isPublicVariant(provisional, { seriesIds: new Set(["series-1"]) }), false);
  assert.equal(resolveTrustedVariantImage({ variant: provisional, parent: bandaiParent, siblingCount: 1 }), "");
});

test("a broken trusted image moves once to a distinct series fallback before the neutral placeholder", () => {
  const initial = resolvePresentationImage({
    primarySrc: "https://images.example/variant.jpg",
    fallbackSrc: "https://images.example/series.jpg",
    imageScope: "variant",
  });
  const fallback = resolvePresentationImage({
    primarySrc: "https://images.example/variant.jpg",
    fallbackSrc: "https://images.example/series.jpg",
    imageScope: "variant",
    primaryFailed: true,
  });
  const noLoop = resolvePresentationImage({
    primarySrc: "https://images.example/shared.jpg",
    fallbackSrc: "https://images.example/shared.jpg",
    imageScope: "series_fallback",
    primaryFailed: true,
  });
  const exhausted = resolvePresentationImage({
    primarySrc: "https://images.example/variant.jpg",
    fallbackSrc: "https://images.example/series.jpg",
    imageScope: "variant",
    primaryFailed: true,
    fallbackFailed: true,
  });

  assert.deepEqual(initial, {
    src: "https://images.example/variant.jpg",
    can_fallback: true,
    uses_fallback: false,
    is_series_fallback: false,
  });
  assert.deepEqual(fallback, {
    src: "https://images.example/series.jpg",
    can_fallback: true,
    uses_fallback: true,
    is_series_fallback: true,
  });
  assert.deepEqual(noLoop, {
    src: "",
    can_fallback: false,
    uses_fallback: false,
    is_series_fallback: false,
  });
  assert.deepEqual(exhausted, {
    src: "",
    can_fallback: true,
    uses_fallback: true,
    is_series_fallback: false,
  });
});

test("ProductImage exposes a one-way client-side series fallback and neutral placeholder", () => {
  const component = source("components/ProductImage.js");
  assert.match(component, /^"use client";/);
  assert.match(component, /resolvePresentationImage/);
  assert.match(component, /onError=\{\(\) =>/);
  assert.match(component, /product-image__scope/);
  assert.match(component, />シリーズ画像</);
  assert.match(component, /画像なし/);
});

test("cards and detail routes use presentation data without changing canonical image consumers", () => {
  const card = source("components/SeriesCard.js");
  const detail = source("app/series/[slug]/page.js");
  const group = source("app/series/group/[slug]/page.js");

  assert.match(card, /fallbackSrc=\{isSeries \? "" : series\.series_image_url\}/);
  assert.match(card, /imageScope=\{isSeries \? "series" : series\.image_scope\}/);
  assert.match(detail, /image: item\.variant_image_url \? absoluteSiteUrl\(item\.variant_image_url\) : undefined/);
  assert.match(detail, /<ProductImage item=\{item\}/);
  assert.match(detail, /entry\.image_scope === "series_fallback"/);
  assert.match(group, /variant\.image_scope === "series_fallback"/);
  assert.match(source("app/globals.css"), /lineup-grid__series-fallback/);
});

test("public listing surfaces request display presentation while category and parent-series visuals remain series scoped", () => {
  for (const relativePath of ["app/page.js", "app/ranking/page.js", "app/schedule/page.js", "app/stock/page.js", "app/restocks/page.js", "app/favorites/page.js"]) {
    assert.match(source(relativePath), /<ProductImage item=/);
  }
  assert.match(source("app/categories/page.js"), /<ProductImage src=\{category\.image_url\}/);
  assert.match(source("app/series/group/[slug]/page.js"), /<ProductImage src=\{item\.image_url\}/);
});

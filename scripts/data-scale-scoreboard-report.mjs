import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildDataScaleScoreboard,
  renderDataScaleScoreboardHuman,
} from "../lib/domain/data-scale-scoreboard.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRows } from "./supabase-rest.mjs";

const OUTPUT_MODES = new Set(["human", "json", "both"]);

export async function loadProductionDataScaleScoreboard(options = {}) {
  loadOptionalEnvFile();
  const now = new Date(options.now ?? new Date());
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid scoreboard timestamp.");

  const read = options.fetchRows ?? fetchRows;
  const data = {};

  // Deliberately sequential: this report is diagnostic and should not create a burst
  // of concurrent full-table reads against Production.
  data.series = await read("series", {
    select: "id",
    operationName: "scoreboard.series",
  });
  data.variants = await read("variants", {
    select: "id",
    operationName: "scoreboard.variants",
  });
  data.marketListings = await read("market_listings", {
    select: "id,variant_id,matched_variant_id,listing_type,status,source,source_url,listed_at,last_observed_at,review_required,created_at,raw",
    operationName: "scoreboard.market_listings",
  });
  data.marketObservations = await read("market_listing_observations", {
    select: "id,listing_id,variant_id,series_id,price,status,source,observed_at,created_at,raw",
    operationName: "scoreboard.market_listing_observations",
  });
  data.stockReports = await read("stock_reports", {
    select: "id,variant_id,matched_variant_id,reported_at,created_at,review_required",
    operationName: "scoreboard.stock_reports",
  });
  data.restockEvents = await read("restock_events", {
    select: "id,variant_id,matched_variant_id,reported_at,created_at,review_required",
    operationName: "scoreboard.restock_events",
  });
  data.xReactions = await read("x_reactions", {
    select: "id,variant_id,matched_variant_id,source_type,posted_at,created_at,review_required",
    operationName: "scoreboard.x_reactions",
  });
  data.outboundClicks = await read("outbound_clicks", {
    select: "id,variant_id,provider,clicked_at",
    operationName: "scoreboard.outbound_clicks",
  });
  data.ingestionRuns = await read("ingestion_runs", {
    select: "id,task,status,started_at,created_at",
    params: { order: "started_at.desc" },
    operationName: "scoreboard.ingestion_runs",
  });
  data.importIssues = await read("import_issues", {
    select: "id,issue_type,resolved,created_at",
    operationName: "scoreboard.import_issues",
  });

  const previousDay = readSnapshotOption(options.previousDay);
  const previousWeek = readSnapshotOption(options.previousWeek);

  return buildDataScaleScoreboard({
    ...data,
    stockReports: data.stockReports.filter((row) => row.review_required !== true),
    restockEvents: data.restockEvents.filter((row) => row.review_required !== true),
    socialAuthorized: parseBoolean(process.env.X_FETCH_ENABLED),
    sourceCapabilities: buildSourceCapabilities(),
    traffic: normalizeExternalPanel(options.traffic),
    revenue: normalizeExternalPanel(options.revenue),
  }, {
    now,
    mainSha: options.mainSha ?? process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    previousDay,
    previousWeek,
  });
}

export function buildSourceCapabilities() {
  return [
    { source: "official", capability: "catalog_and_release_facts", state: "active" },
    { source: "rakuten", capability: "market_listings", state: "active" },
    { source: "yahoo_shopping", capability: "market_listings", state: "active" },
    { source: "x", capability: "social_signals", state: parseBoolean(process.env.X_FETCH_ENABLED) ? "active" : "not_configured" },
    { source: "mercari", capability: "market_history_and_completed_sales", state: "partnership_required" },
  ];
}

function readSnapshotOption(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const file = path.resolve(String(value));
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 2_000_000) {
    throw new Error("Previous scoreboard snapshot must be a JSON file <= 2 MB.");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeExternalPanel(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function parseArgs(argv) {
  const args = { mode: "human", out: "", previousDay: "", previousWeek: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") args.mode = "json";
    else if (token === "--both") args.mode = "both";
    else if (token === "--human") args.mode = "human";
    else if (token === "--out") args.out = requiredValue(argv, ++index, token);
    else if (token === "--previous-day") args.previousDay = requiredValue(argv, ++index, token);
    else if (token === "--previous-week") args.previousWeek = requiredValue(argv, ++index, token);
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!OUTPUT_MODES.has(args.mode)) throw new Error("Invalid output mode.");
  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function serialize(snapshot, mode) {
  const json = JSON.stringify(snapshot, null, 2);
  const human = renderDataScaleScoreboardHuman(snapshot);
  if (mode === "json") return json;
  if (mode === "both") return `${human}\n\n${json}`;
  return human;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = await loadProductionDataScaleScoreboard({
    previousDay: args.previousDay,
    previousWeek: args.previousWeek,
  });
  const output = serialize(snapshot, args.mode);
  if (args.out) {
    const target = path.resolve(args.out);
    fs.writeFileSync(target, `${output}\n`, { encoding: "utf8", flag: "w" });
    console.log(`Scoreboard written: ${target}`);
  } else {
    console.log(output);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`data-scale-scoreboard failed: ${error?.message || "unknown_error"}`);
    process.exitCode = 1;
  });
}

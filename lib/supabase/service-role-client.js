import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getCurrentDataSourceOperation } from "../data/data-source-policy";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_DETAIL_READ_CACHE_SECONDS = 1800;
const PUBLIC_DETAIL_READ_CACHE_TAG = "gacha-public-detail-read";
const PUBLIC_DETAIL_READ_OPERATIONS = new Set(["variant-detail", "related-variants"]);

export const hasServiceRoleSupabaseConfig = Boolean(supabaseUrl && serviceRoleKey);

let client;

function requestMethod(input, init) {
  if (init?.method) return String(init.method).toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return String(input.method || "GET").toUpperCase();
  return "GET";
}

function serviceRoleFetch(input, init = {}) {
  const method = requestMethod(input, init);
  const operation = getCurrentDataSourceOperation();
  const shouldCache = (method === "GET" || method === "HEAD") && PUBLIC_DETAIL_READ_OPERATIONS.has(operation);

  if (!shouldCache) return fetch(input, init);

  return fetch(input, {
    ...init,
    cache: "force-cache",
    next: {
      revalidate: PUBLIC_DETAIL_READ_CACHE_SECONDS,
      tags: [PUBLIC_DETAIL_READ_CACHE_TAG],
    },
  });
}

export function getServiceRoleSupabaseClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server database access");
  }

  client ??= createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: serviceRoleFetch,
    },
  });
  return client;
}

export const serviceRoleSupabase = hasServiceRoleSupabaseConfig
  ? getServiceRoleSupabaseClient()
  : null;

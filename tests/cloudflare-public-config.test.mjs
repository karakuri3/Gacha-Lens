import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  DEFAULT_SUPABASE_URL,
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "../lib/supabase/public-config.js";
import { DEFAULT_SITE_URL, getSiteUrl } from "../lib/site-metadata.js";

const root = process.cwd();
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Cloudflare preview has portable non-secret Supabase defaults", () => {
  assert.equal(DEFAULT_SUPABASE_URL, "https://vxbrnvfhmzcxehuuzzum.supabase.co");
  assert.match(DEFAULT_SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/);
  assert.equal(resolveSupabaseUrl({}), DEFAULT_SUPABASE_URL);
  assert.equal(resolveSupabasePublishableKey({}), DEFAULT_SUPABASE_PUBLISHABLE_KEY);
});

test("environment values still override portable public defaults", () => {
  assert.equal(
    resolveSupabaseUrl({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }),
    "https://example.supabase.co"
  );
  assert.equal(
    resolveSupabaseUrl({ SUPABASE_URL: "https://server-only.example.supabase.co" }),
    "https://server-only.example.supabase.co"
  );
  assert.equal(
    resolveSupabasePublishableKey({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_override" }),
    "sb_publishable_override"
  );
});

test("canonical site origin defaults to Production when host variables are absent", () => {
  assert.equal(DEFAULT_SITE_URL, "https://gachalens.com");
  assert.equal(getSiteUrl({}).toString(), "https://gachalens.com/");
});

test("portable public config never contains the service-role credential", () => {
  const publicConfig = source("lib/supabase/public-config.js");
  const serviceClient = source("lib/supabase/service-role-client.js");
  const publishableClient = source("lib/supabase/publishable-client.js");

  assert.doesNotMatch(publicConfig, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(serviceClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(serviceClient, /resolveSupabaseUrl\(\)/);
  assert.match(publishableClient, /resolveSupabasePublishableKey\(\)/);
  assert.match(publishableClient, /resolveSupabaseUrl\(\)/);
});

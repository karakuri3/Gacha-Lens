export async function upsertIngestionRun(row) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !row?.id) return false;

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/ingestion_runs?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([row]),
  });

  if (!response.ok) {
    throw new Error(`ingestion_runs upsert failed: ${await response.text()}`);
  }
  return true;
}

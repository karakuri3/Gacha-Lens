import { officialPreconditionDatabaseColumns } from "../domain/official-apply-contract.js";
import { createOfficialPostgresTransactionAdapter } from "./official-bounded-postgres.js";

const MAX_IDENTITY_ROWS = 30;

export function createOfficialQualiaSeriesPostgresTransactionAdapter(client) {
  const base = createOfficialPostgresTransactionAdapter(client);
  return {
    ...base,
    async begin() {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    },
    async readSeriesIdentityRows(candidate, { lock = false } = {}) {
      const columns = officialPreconditionDatabaseColumns("series");
      const result = await client.query(
        `SELECT ${columns.join(", ")}
           FROM public.series
          WHERE id = $1
             OR official_url = $2
             OR (name = $3 AND brand = 'クオリア')
          ORDER BY id
          LIMIT ${MAX_IDENTITY_ROWS + 1}${lock ? " FOR UPDATE" : ""}`,
        [candidate.series_id, candidate.official_url, candidate.series_name],
      );
      if (!Array.isArray(result.rows) || result.rows.length > MAX_IDENTITY_ROWS) {
        const error = new Error("qualia_series_canary_identity_read_incomplete");
        error.reason_code = "qualia_series_canary_identity_read_incomplete";
        throw error;
      }
      return result.rows;
    },
  };
}

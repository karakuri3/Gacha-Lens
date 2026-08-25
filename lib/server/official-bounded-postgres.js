import {
  OFFICIAL_WRITE_TABLES,
  officialDatabaseColumns,
  officialPreconditionDatabaseColumns,
  toOfficialDatabaseRow,
} from "../domain/official-apply-contract.js";

export function createOfficialPostgresTransactionAdapter(client) {
  if (!client || typeof client.query !== "function") throw new Error("Postgres client is required.");
  return {
    async begin() {
      await client.query("BEGIN");
    },
    async readRow(table, id, { lock = false } = {}) {
      const config = tableConfig(table);
      const result = await client.query(
        `SELECT ${config.preconditionColumns.join(", ")} FROM public.${config.table} WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
        [id],
      );
      if (!Array.isArray(result.rows) || result.rows.length > 1) throw new Error("Official bounded row read was not unique.");
      return result.rows[0] ?? null;
    },
    async captureCounts() {
      const result = await client.query(`
        SELECT
          (SELECT count(*)::integer FROM public.series) AS series,
          (SELECT count(*)::integer FROM public.variants) AS variants,
          (SELECT count(*)::integer FROM public.restock_events) AS restock_events,
          (SELECT count(*)::integer FROM public.import_issues) AS import_issues,
          (SELECT count(*)::integer FROM public.variants WHERE review_required = true) AS review_required,
          (SELECT count(*)::integer FROM public.variants WHERE variant_type = 'provisional') AS provisional_variants
      `);
      if (!Array.isArray(result.rows) || result.rows.length !== 1) {
        throw new Error("Official bounded count snapshot was unavailable.");
      }
      return Object.fromEntries(Object.entries(result.rows[0])
        .map(([key, value]) => [key, Number(value)]));
    },
    async writeRow(table, operation, values) {
      const config = tableConfig(table);
      const row = toOfficialDatabaseRow(table, values);
      let result;
      if (operation === "insert") {
        const placeholders = config.columns.map((_, index) => `$${index + 1}`);
        result = await client.query(
          `INSERT INTO public.${config.table} (${config.columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
          config.columns.map((column) => row[column]),
        );
      } else if (operation === "update") {
        const columns = config.columns.filter((column) => column !== "id");
        const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
        result = await client.query(
          `UPDATE public.${config.table} SET ${assignments.join(", ")} WHERE id = $${columns.length + 1}`,
          [...columns.map((column) => row[column]), row.id],
        );
      } else {
        throw new Error("Official bounded SQL operation is invalid.");
      }
      if (result.rowCount !== 1) throw new Error("Official bounded SQL write count was not exactly one.");
      return result.rowCount;
    },
    async commit() {
      await client.query("COMMIT");
    },
    async rollback() {
      await client.query("ROLLBACK");
    },
  };
}

function tableConfig(table) {
  if (!Object.hasOwn(OFFICIAL_WRITE_TABLES, table)) throw new Error("Official bounded SQL table is not allowed.");
  return {
    table,
    columns: officialDatabaseColumns(table),
    preconditionColumns: officialPreconditionDatabaseColumns(table),
  };
}

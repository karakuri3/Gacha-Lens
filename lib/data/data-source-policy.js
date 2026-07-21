export const DATA_SOURCE_CODES = Object.freeze({
  CONFIG: "DATA_SOURCE_CONFIG_ERROR",
  UNAVAILABLE: "DATA_SOURCE_UNAVAILABLE",
  QUERY: "DATA_QUERY_FAILED",
});

export class DataSourceError extends Error {
  constructor(code, operation = "catalog") {
    super(publicMessageFor(code));
    this.name = "DataSourceError";
    this.code = code;
    this.operation = operation;
  }
}

export function resolveDataSource({
  nodeEnv = process.env.NODE_ENV,
  configuredSource = process.env.GACHA_DATA_SOURCE,
  hasSupabaseConfig = false,
} = {}) {
  const environment = String(nodeEnv || "development").trim().toLowerCase();
  const requested = String(configuredSource || "").trim().toLowerCase();
  const isProduction = environment === "production";

  if (requested && requested !== "supabase" && requested !== "sample") {
    throw new DataSourceError(DATA_SOURCE_CODES.CONFIG, "resolve-data-source");
  }

  if (isProduction && requested === "sample") {
    throw new DataSourceError(DATA_SOURCE_CODES.CONFIG, "resolve-data-source");
  }

  if (requested === "sample") return "sample";

  if (!hasSupabaseConfig) {
    throw new DataSourceError(DATA_SOURCE_CODES.CONFIG, "resolve-data-source");
  }

  return "supabase";
}

export async function runDataSourceOperation(operation, callback) {
  try {
    return await callback();
  } catch (error) {
    if (error instanceof DataSourceError) throw error;
    console.error("[gacha-data-source] operation failed", { operation });
    throw new DataSourceError(DATA_SOURCE_CODES.QUERY, operation);
  }
}

function publicMessageFor(code) {
  if (code === DATA_SOURCE_CODES.CONFIG) {
    return "Data source configuration is unavailable.";
  }
  if (code === DATA_SOURCE_CODES.UNAVAILABLE) {
    return "The product data service is temporarily unavailable.";
  }
  return "Product data could not be retrieved.";
}

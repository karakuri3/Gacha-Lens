export const SUPABASE_FULL_TABLE_PAGE_SIZE = 1000;
export const SUPABASE_FULL_TABLE_MAX_CONCURRENCY = 1;

export async function fetchAllRowsSequential(fetchPage, options = {}) {
  if (typeof fetchPage !== "function") throw new TypeError("fetchPage is required");
  const pageSize = positiveInteger(options.pageSize, SUPABASE_FULL_TABLE_PAGE_SIZE);
  let requestCount = 0;

  const firstPage = await requestPage(0, pageSize - 1, true);
  if (firstPage.error) return failed(firstPage.error);

  const rows = [...firstPage.data];
  const total = nonnegativeInteger(firstPage.count, rows.length);
  if (rows.length !== Math.min(total, pageSize)) {
    return failed(new Error("Supabase full-table first page was incomplete."));
  }

  for (let from = pageSize; from < total; from += pageSize) {
    const to = Math.min(total - 1, from + pageSize - 1);
    const page = await requestPage(from, to, false);
    if (page.error) return failed(page.error);
    if (page.data.length !== to - from + 1) {
      return failed(new Error("Supabase full-table page was incomplete."));
    }
    rows.push(...page.data);
  }

  return {
    data: rows,
    error: null,
    request_count: requestCount,
    max_concurrency: SUPABASE_FULL_TABLE_MAX_CONCURRENCY,
  };

  async function requestPage(from, to, exactCount) {
    requestCount += 1;
    const result = await fetchPage({ from, to, exactCount });
    return {
      data: Array.isArray(result?.data) ? result.data : [],
      count: result?.count,
      error: result?.error ?? null,
    };
  }

  function failed(error) {
    return {
      data: [],
      error,
      request_count: requestCount,
      max_concurrency: SUPABASE_FULL_TABLE_MAX_CONCURRENCY,
    };
  }
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonnegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

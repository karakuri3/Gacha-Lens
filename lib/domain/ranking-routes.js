export function normalizeRankingTab(value) {
  return value === "upcoming" ? "upcoming" : "released";
}

export function normalizeRankingScope(value) {
  return value === "series" ? "series" : "variant";
}

export function rankingPath({ tab = "released", scope = "variant" } = {}) {
  const normalizedTab = normalizeRankingTab(tab);
  const normalizedScope = normalizeRankingScope(scope);

  if (normalizedTab === "released" && normalizedScope === "variant") return "/ranking";
  if (normalizedTab === "released" && normalizedScope === "series") return "/ranking/series";
  if (normalizedTab === "upcoming" && normalizedScope === "variant") return "/ranking/upcoming";
  return "/ranking/upcoming/series";
}

export function getLegacyRankingRedirectPath(url) {
  const candidate = url instanceof URL ? url : new URL(String(url), "https://gachalens.com");
  if (candidate.pathname !== "/ranking" || candidate.searchParams.size === 0) return null;

  const keys = [...candidate.searchParams.keys()];
  if (keys.some((key) => key !== "tab" && key !== "scope")) return null;
  if (!candidate.searchParams.has("tab") && !candidate.searchParams.has("scope")) return null;

  return rankingPath({
    tab: candidate.searchParams.get("tab"),
    scope: candidate.searchParams.get("scope"),
  });
}

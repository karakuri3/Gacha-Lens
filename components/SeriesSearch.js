import ContentSection from "./ContentSection";
import SectionHeading from "./SectionHeading";
import ActionLinkButton from "./ActionLinkButton";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayText(value, fallback = "なし") {
  if (!hasText(value)) {
    return fallback;
  }

  return value.trim();
}

function getSearchStateText(currentCategory, currentSort, initialKeyword) {
  const categoryText = hasText(currentCategory) ? currentCategory.trim() : "すべて";
  const sortText = hasText(currentSort) ? currentSort.trim() : "release";
  const keywordText = hasText(initialKeyword) ? initialKeyword.trim() : "なし";

  return `カテゴリ：${categoryText} / 並び替え：${sortText} / 入力中の検索語：${keywordText}`;
}

function getSearchGuideText(currentCategory, currentSort) {
  if (hasText(currentCategory) && hasText(currentSort)) {
    return `今はカテゴリ「${currentCategory.trim()}」と並び替え条件を残したまま検索できます。検索しても、見ている範囲や並び順はそのままです。`;
  }

  if (hasText(currentCategory)) {
    return `今はカテゴリ「${currentCategory.trim()}」の中だけで検索します。まずカテゴリでしぼって、その中で作品名やキャラ名を探したいときに向いています。`;
  }

  if (hasText(currentSort)) {
    return "今の並び替えを残したまま検索できます。検索結果も同じ基準で見比べたいときに向いています。";
  }

  return "作品名やキャラ名が分かっているなら、ここから直接探すのが早いです。";
}

function getKeywordGuideText(initialKeyword) {
  if (hasText(initialKeyword)) {
    return `今は「${initialKeyword.trim()}」で検索中です。近い言葉に変えたいときは、このまま打ち直して再検索できます。`;
  }

  return "作品名・キャラ名・シリーズ名の一部だけでも検索できます。";
}

function getClearGuideText(clearHref, currentCategory, currentSort) {
  if (!hasText(clearHref)) {
    return "";
  }

  if (hasText(currentCategory) || hasText(currentSort)) {
    return "検索だけを外して、今のカテゴリや並び替えは残したまま一覧に戻せます。";
  }

  return "検索語だけを消して、一覧を広く見直せます。";
}

function getGuideCardStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "14px",
    backgroundColor: "#ffffff",
    boxSizing: "border-box",
  };
}

function getInputStyle() {
  return {
    width: "100%",
    minHeight: "48px",
    padding: "12px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    fontSize: "16px",
    lineHeight: 1.5,
    color: "#111827",
    backgroundColor: "#ffffff",
    boxSizing: "border-box",
  };
}

export default function SeriesSearch({
  title = "シリーズ名で探す",
  description = "",
  initialKeyword = "",
  currentSort = "",
  currentCategory = "",
  clearHref = "",
}) {
  const stateText = getSearchStateText(
    currentCategory,
    currentSort,
    initialKeyword
  );

  const clearGuideText = getClearGuideText(
    clearHref,
    currentCategory,
    currentSort
  );

  return (
    <ContentSection marginTop="24px" backgroundColor="#fafafa">
      <SectionHeading title={title} description={description} />

      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          marginTop: "16px",
        }}
      >
        <div style={getGuideCardStyle()}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "bold",
              color: "#6b7280",
              lineHeight: 1.5,
            }}
          >
            今の検索状態
          </div>

          <div
            style={{
              marginTop: "8px",
              fontSize: "17px",
              fontWeight: "bold",
              color: "#111827",
              lineHeight: 1.5,
            }}
          >
            条件を残したまま探せる
          </div>

          <p
            style={{
              margin: "8px 0 0 0",
              color: "#4b5563",
              lineHeight: 1.7,
            }}
          >
            {stateText}
          </p>
        </div>

        <div style={getGuideCardStyle()}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "bold",
              color: "#6b7280",
              lineHeight: 1.5,
            }}
          >
            検索の向き
          </div>

          <div
            style={{
              marginTop: "8px",
              fontSize: "17px",
              fontWeight: "bold",
              color: "#111827",
              lineHeight: 1.5,
            }}
          >
            作品名やキャラ名が分かるときに強い
          </div>

          <p
            style={{
              margin: "8px 0 0 0",
              color: "#4b5563",
              lineHeight: 1.7,
            }}
          >
            {getSearchGuideText(currentCategory, currentSort)}
          </p>
        </div>

        <div style={getGuideCardStyle()}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "bold",
              color: "#6b7280",
              lineHeight: 1.5,
            }}
          >
            入力の考え方
          </div>

          <div
            style={{
              marginTop: "8px",
              fontSize: "17px",
              fontWeight: "bold",
              color: "#111827",
              lineHeight: 1.5,
            }}
          >
            一部の言葉だけでも探せる
          </div>

          <p
            style={{
              margin: "8px 0 0 0",
              color: "#4b5563",
              lineHeight: 1.7,
            }}
          >
            {getKeywordGuideText(initialKeyword)}
          </p>
        </div>
      </div>

      <form
        action="/series"
        method="get"
        style={{
          marginTop: "16px",
          display: "grid",
          gap: "12px",
        }}
      >
        {hasText(currentSort) ? (
          <input type="hidden" name="sort" value={currentSort.trim()} />
        ) : null}

        {hasText(currentCategory) ? (
          <input
            type="hidden"
            name="category"
            value={currentCategory.trim()}
          />
        ) : null}

        <div>
          <label
            htmlFor="series-search-keyword"
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "14px",
              fontWeight: "bold",
              color: "#374151",
              lineHeight: 1.5,
            }}
          >
            検索したい言葉
          </label>

          <input
            id="series-search-keyword"
            type="search"
            name="q"
            defaultValue={getDisplayText(initialKeyword, "")}
            placeholder="例：ちいかわ / ポケモン / サンリオ"
            style={getInputStyle()}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="submit"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              textAlign: "center",
              padding: "10px 14px",
              fontSize: "14px",
              fontWeight: "bold",
              lineHeight: "1.4",
              borderRadius: "10px",
              border: "1px solid #111827",
              backgroundColor: "#111827",
              color: "#ffffff",
              boxShadow: "0 1px 2px rgba(17, 24, 39, 0.08)",
              boxSizing: "border-box",
              minHeight: "42px",
              cursor: "pointer",
            }}
          >
            この条件で検索する
          </button>

          {hasText(clearHref) ? (
            <ActionLinkButton href={clearHref} variant="outline">
              検索だけクリア
            </ActionLinkButton>
          ) : null}
        </div>
      </form>

      {hasText(clearGuideText) ? (
        <p
          style={{
            marginTop: "12px",
            marginBottom: 0,
            color: "#4b5563",
            lineHeight: 1.7,
          }}
        >
          {clearGuideText}
        </p>
      ) : (
        <p
          style={{
            marginTop: "12px",
            marginBottom: 0,
            color: "#4b5563",
            lineHeight: 1.7,
          }}
        >
          検索すると、入力した言葉を含むシリーズ一覧へ移動します。
        </p>
      )}
    </ContentSection>
  );
}
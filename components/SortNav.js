import {
  SERIES_SORT_OPTIONS,
  normalizeSeriesSortKey,
} from "@/lib/series-sort";
import ActionLinkButton from "./ActionLinkButton";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function buildSortUrl(sortValue, currentCategory, currentKeyword) {
  const params = new URLSearchParams();

  params.set("sort", sortValue);

  if (hasText(currentCategory)) {
    params.set("category", currentCategory.trim());
  }

  if (hasText(currentKeyword)) {
    params.set("q", currentKeyword.trim());
  }

  return `/series?${params.toString()}`;
}

function getSortLabel(sortValue) {
  const matchedOption = SERIES_SORT_OPTIONS.find(
    (option) => option.value === sortValue
  );

  return matchedOption?.label ?? sortValue;
}

function getCurrentSortDescription(sortValue, sortLabel) {
  if (sortValue === "release") {
    return "新作を追いたいときや、発売の近い順で流れを見たいときに向いています。";
  }

  if (sortValue === "score") {
    return "どれから見ればいいか迷うときに向いています。相場や在庫などをもとに、注目しやすい順で見られます。";
  }

  return `今は「${sortLabel}」で見ています。目的に合わせて表示順を切り替えられます。`;
}

function getConditionKeepText(currentCategory, currentKeyword) {
  if (hasText(currentCategory) && hasText(currentKeyword)) {
    return `カテゴリ「${currentCategory}」と検索「${currentKeyword}」を残したまま並び順だけ切り替わります。`;
  }

  if (hasText(currentCategory)) {
    return `カテゴリ「${currentCategory}」は残したまま、並び順だけ切り替わります。`;
  }

  if (hasText(currentKeyword)) {
    return `検索「${currentKeyword}」は残したまま、並び順だけ切り替わります。`;
  }

  return "並び替えを変えても、一覧ページの中で見る順番だけが変わります。";
}

function getSortChoiceGuideText(sortValue) {
  if (sortValue === "release") {
    return "まず広く見たいときは、このまま発売日順から入るのが自然です。";
  }

  if (sortValue === "score") {
    return "迷ったときは、このまま注目順で上から見ていくと候補を決めやすいです。";
  }

  return "目的が変わったら、他の並び替えに切り替えて同じ一覧を比べられます。";
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

export default function SortNav({
  currentSort = "release",
  currentCategory = "",
  currentKeyword = "",
}) {
  const normalizedSort = normalizeSeriesSortKey(currentSort);
  const currentSortLabel = getSortLabel(normalizedSort);

  return (
    <section
      style={{
        marginTop: "16px",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          padding: "20px",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          backgroundColor: "#fafafa",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            paddingBottom: "12px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              fontWeight: "bold",
              color: "#6b7280",
              lineHeight: 1.5,
            }}
          >
            並び替え
          </p>

          <h2
            style={{
              margin: "8px 0 0 0",
              fontSize: "28px",
              lineHeight: 1.35,
              color: "#111827",
              fontWeight: "bold",
              letterSpacing: "-0.01em",
            }}
          >
            一覧の見える順番を切り替える
          </h2>

          <p
            style={{
              margin: "10px 0 0 0",
              color: "#4b5563",
              fontSize: "15px",
              lineHeight: 1.8,
              maxWidth: "780px",
            }}
          >
            {getCurrentSortDescription(normalizedSort, currentSortLabel)}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
              今の並び順
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
              {currentSortLabel}
            </div>

            <p
              style={{
                margin: "8px 0 0 0",
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              いま一覧に出ているシリーズを、この基準で上から見ています。
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
              切り替えても残るもの
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
              カテゴリ・検索条件はそのまま
            </div>

            <p
              style={{
                margin: "8px 0 0 0",
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              {getConditionKeepText(currentCategory, currentKeyword)}
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
              使い分け
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
              見たい目的で切り替える
            </div>

            <p
              style={{
                margin: "8px 0 0 0",
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              {getSortChoiceGuideText(normalizedSort)}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginTop: "16px",
          }}
        >
          {SERIES_SORT_OPTIONS.map((option) => {
            const isActive = normalizedSort === option.value;

            return (
              <ActionLinkButton
                key={option.value}
                href={buildSortUrl(
                  option.value,
                  currentCategory,
                  currentKeyword
                )}
                variant={isActive ? "solid" : "outline"}
              >
                {option.label}
              </ActionLinkButton>
            );
          })}
        </div>

        <p
          style={{
            marginTop: "12px",
            marginBottom: 0,
            color: "#4b5563",
            lineHeight: 1.7,
          }}
        >
          ボタンを押すと、今の一覧の中身はなるべくそのままで、見える順番だけを切り替えられます。
        </p>
      </div>
    </section>
  );
}
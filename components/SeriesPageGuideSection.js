import ActionLinkButton from "./ActionLinkButton";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayText(value, fallback = "未設定") {
  if (!hasText(value)) {
    return fallback;
  }

  return value.trim();
}

function getResultCountText(resultCount) {
  if (typeof resultCount === "number" && Number.isFinite(resultCount)) {
    return `${resultCount}件`;
  }

  return "件数未取得";
}

function getCurrentViewText({
  currentCategory,
  currentKeyword,
  currentSortLabel,
  resultCount,
}) {
  const categoryText = hasText(currentCategory) ? currentCategory : "すべて";
  const keywordText = hasText(currentKeyword) ? currentKeyword : "なし";
  const sortText = getDisplayText(currentSortLabel, "発売日順");
  const resultText = getResultCountText(resultCount);

  return `カテゴリ：${categoryText} / 検索：${keywordText} / 並び替え：${sortText} / 表示件数：${resultText}`;
}

function getGuideDescription({
  currentCategory,
  currentKeyword,
  currentSortLabel,
  resultCount,
}) {
  const isDefaultView =
    !hasText(currentCategory) &&
    !hasText(currentKeyword) &&
    getDisplayText(currentSortLabel, "発売日順") === "発売日順";

  if (isDefaultView) {
    return `今は初期状態です。すべてのシリーズを発売日順で見ています。現在は ${getResultCountText(
      resultCount
    )} が表示対象です。`;
  }

  if (hasText(currentCategory) && hasText(currentKeyword)) {
    return `今は「${currentCategory}」の中で「${currentKeyword}」を検索している状態です。カテゴリと検索を両方使って、かなり絞り込んで見ています。`;
  }

  if (hasText(currentCategory)) {
    return `今はカテゴリ「${currentCategory}」で絞って見ています。まず系統でしぼってから候補を見たいときに向いています。`;
  }

  if (hasText(currentKeyword)) {
    return `今は「${currentKeyword}」で検索して見ています。作品名やキャラ名が決まっているときに向いています。`;
  }

  return `今は並び替えを変えて見ています。表示順を変えながら、同じ一覧を比べたいときに向いています。`;
}

function getSearchGuideText(currentCategory) {
  if (hasText(currentCategory)) {
    return `今は「${currentCategory}」の中だけで検索できます。カテゴリを決めたあとに、作品名やキャラ名でさらに細かくしぼる使い方が向いています。`;
  }

  return "作品名やキャラ名が分かっているなら、カテゴリより検索から入るほうが早いです。まず名前で探してから、必要なら並び替えやカテゴリで調整できます。";
}

function getCategoryGuideText(currentKeyword) {
  if (hasText(currentKeyword)) {
    return `今は検索条件を入れているので、カテゴリを押すとその検索を残したまま見る範囲だけ切り替えられます。`;
  }

  return "まだ作品名が決まっていないなら、まずカテゴリから入るのが見やすいです。そこから検索や並び替えを足していく流れが自然です。";
}

function getNextActionText({
  currentCategory,
  currentKeyword,
  resultCount,
}) {
  if (
    typeof resultCount === "number" &&
    Number.isFinite(resultCount) &&
    resultCount === 0
  ) {
    return "今の条件では0件です。カテゴリを外すか、検索を消すか、並び替えを戻して広く見直すのがおすすめです。";
  }

  if (hasText(currentCategory) && hasText(currentKeyword)) {
    return "かなり絞れているので、このまま一覧を見るか、検索だけ少し変えて近い候補を探すのがおすすめです。";
  }

  if (hasText(currentCategory)) {
    return "次は一覧を見ながら気になるシリーズを選ぶか、検索を足してカテゴリ内でさらに細かく探すのがおすすめです。";
  }

  if (hasText(currentKeyword)) {
    return "次は一覧で候補を見比べるか、カテゴリを足して検索範囲をしぼるのがおすすめです。";
  }

  return "まずはカテゴリか検索のどちらかから入るのがおすすめです。迷うなら一覧まで進んで、出てきたカードから気になるものを比べられます。";
}

function getGuideCardStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "16px",
    backgroundColor: "#ffffff",
    boxSizing: "border-box",
  };
}

export default function SeriesPageGuideSection({
  currentCategory = "",
  currentKeyword = "",
  currentSortLabel = "発売日順",
  resultCount = 0,
  searchHref = "#series-search",
  resultsHref = "#series-results",
}) {
  const guideDescription = getGuideDescription({
    currentCategory,
    currentKeyword,
    currentSortLabel,
    resultCount,
  });

  const currentViewText = getCurrentViewText({
    currentCategory,
    currentKeyword,
    currentSortLabel,
    resultCount,
  });

  const nextActionText = getNextActionText({
    currentCategory,
    currentKeyword,
    resultCount,
  });

  return (
    <section
      style={{
        marginTop: "24px",
        scrollMarginTop: "24px",
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
            一覧ページの使い方
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
            今の状態と次の見方を先に整理する
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
            {guideDescription}
          </p>
        </div>

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
              今の表示状態
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
              条件を確認してから見る
            </div>

            <p
              style={{
                margin: "8px 0 0 0",
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              {currentViewText}
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
              カテゴリと検索の使い分け
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
              ざっくりはカテゴリ、直接は検索
            </div>

            <p
              style={{
                margin: "8px 0 0 0",
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              {getCategoryGuideText(currentKeyword)}
            </p>

            <p
              style={{
                margin: "10px 0 0 0",
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              {getSearchGuideText(currentCategory)}
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
              次にすること
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
              次の1アクションを決める
            </div>

            <p
              style={{
                margin: "8px 0 0 0",
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              {nextActionText}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: "16px",
          }}
        >
          <ActionLinkButton href={searchHref} variant="solid">
            検索から探す
          </ActionLinkButton>

          <ActionLinkButton href={resultsHref} variant="outline">
            一覧まで移動する
          </ActionLinkButton>
        </div>
      </div>
    </section>
  );
}